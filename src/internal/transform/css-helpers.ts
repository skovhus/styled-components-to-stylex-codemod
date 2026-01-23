import type { Collection, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";

import { normalizeStylisAstToIR } from "../css-ir.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import type { StyledDecl } from "../transform-types.js";

type Loc = { line: number; column: number } | null;

export function isIdentifierReference(p: any): boolean {
  const parent = p?.parent?.node;
  if (!parent) {
    return true;
  }
  // Import specifiers are not "uses".
  if (
    parent.type === "ImportSpecifier" ||
    parent.type === "ImportDefaultSpecifier" ||
    parent.type === "ImportNamespaceSpecifier"
  ) {
    return false;
  }
  // `foo.css` (non-computed) is a property name, not an identifier reference.
  if (
    (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
    parent.property === p.node &&
    parent.computed === false
  ) {
    return false;
  }
  // `{ css: 1 }` / `{ css }` key is not a reference when not computed.
  if (
    (parent.type === "Property" || parent.type === "ObjectProperty") &&
    parent.key === p.node &&
    parent.computed === false
  ) {
    return false;
  }
  // TS type keys are not runtime references.
  if (parent.type === "TSPropertySignature" && parent.key === p.node) {
    return false;
  }
  return true;
}

function buildExportedLocalNames(root: any, j: JSCodeshift): Set<string> {
  const exportedLocalNames = new Set<string>();
  root.find(j.ExportNamedDeclaration).forEach((p: any) => {
    const decl = p.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations ?? []) {
        if (d.type === "VariableDeclarator" && d.id.type === "Identifier") {
          exportedLocalNames.add(d.id.name);
        }
      }
    }
    for (const spec of p.node.specifiers ?? []) {
      if (spec.type === "ExportSpecifier" && spec.local?.type === "Identifier") {
        exportedLocalNames.add(spec.local.name);
      }
    }
  });
  root.find(j.ExportDefaultDeclaration).forEach((p: any) => {
    const decl = p.node.declaration;
    if (decl?.type === "Identifier") {
      exportedLocalNames.add(decl.name);
    }
  });
  return exportedLocalNames;
}

function collectStyledDefaultImportLocalNames(styledImports: Collection<any>): Set<string> {
  const styledLocalNames = new Set<string>();
  styledImports.forEach((imp) => {
    const specs = imp.node.specifiers ?? [];
    for (const spec of specs) {
      if (spec.type === "ImportDefaultSpecifier" && spec.local?.type === "Identifier") {
        styledLocalNames.add(spec.local.name);
      }
    }
  });
  return styledLocalNames;
}

export function isStyledTag(styledLocalNames: Set<string>, tag: any): boolean {
  if (!tag || typeof tag !== "object") {
    return false;
  }
  if (tag.type === "Identifier") {
    return styledLocalNames.has(tag.name);
  }
  if (tag.type === "MemberExpression" || tag.type === "OptionalMemberExpression") {
    return isStyledTag(styledLocalNames, tag.object);
  }
  if (tag.type === "CallExpression") {
    return isStyledTag(styledLocalNames, tag.callee);
  }
  return false;
}

function getCssHelperPlacementHints(
  root: any,
  declaratorPath: any,
): { declIndex?: number; insertAfterName?: string } {
  const varDeclPath = declaratorPath?.parentPath;
  if (!varDeclPath || varDeclPath.node?.type !== "VariableDeclaration") {
    return {};
  }
  const programBody = (root.get().node.program as any)?.body;
  if (!Array.isArray(programBody)) {
    return {};
  }
  const idx = (() => {
    const direct = programBody.indexOf(varDeclPath.node);
    if (direct >= 0) {
      return direct;
    }
    const loc = (varDeclPath.node as any)?.loc?.start;
    if (!loc) {
      return -1;
    }
    return programBody.findIndex((s: any) => {
      const sloc = s?.loc?.start;
      return sloc && sloc.line === loc.line && sloc.column === loc.column;
    });
  })();
  let insertAfterName: string | undefined = undefined;
  if (idx > 0) {
    for (let i = idx - 1; i >= 0; i--) {
      const stmt = programBody[i];
      if (stmt?.type === "VariableDeclaration") {
        const decl = (stmt.declarations ?? [])[0];
        if (decl?.id?.type === "Identifier") {
          insertAfterName = decl.id.name;
          break;
        }
      }
      if (stmt?.type === "FunctionDeclaration" && stmt.id?.type === "Identifier") {
        insertAfterName = stmt.id.name;
        break;
      }
    }
  }
  return {
    declIndex: idx >= 0 ? idx : undefined,
    ...(insertAfterName ? { insertAfterName } : {}),
  };
}

function getCssHelperTemplateLoc(template: any): Loc {
  const start = template?.loc?.start;
  if (start?.line === undefined) {
    return null;
  }
  return { line: start.line, column: start.column ?? 0 };
}

function isStyledCallExpression(node: any, styledLocalNames: Set<string>): boolean {
  // styled.div(...) or styled("div")(...) pattern
  if (node?.type !== "CallExpression") {
    return false;
  }
  const callee = node.callee;
  // styled.div(...)
  if (
    callee?.type === "MemberExpression" &&
    callee.object?.type === "Identifier" &&
    styledLocalNames.has(callee.object.name)
  ) {
    return true;
  }
  // styled("div")(...)
  if (
    callee?.type === "CallExpression" &&
    callee.callee?.type === "Identifier" &&
    styledLocalNames.has(callee.callee.name)
  ) {
    return true;
  }
  return false;
}

interface UnsupportedCssUsage {
  loc: Loc;
  reason: "call-expression" | "outside-styled-template";
}

function detectUnsupportedCssHelperUsage(args: {
  root: any;
  j: JSCodeshift;
  cssLocal: string;
  styledLocalNames: Set<string>;
}): UnsupportedCssUsage[] {
  const { root, j, cssLocal, styledLocalNames } = args;
  const unsupportedUsages: UnsupportedCssUsage[] = [];

  const getLoc = (node: any): Loc => {
    const start = node?.loc?.start;
    if (!start?.line && start?.line !== 0) {
      return null;
    }
    return { line: start.line, column: start.column ?? 0 };
  };

  // Check for css(...) call expressions - these are unsupported
  root
    .find(j.CallExpression, { callee: { type: "Identifier", name: cssLocal } } as any)
    .forEach((p: any) => {
      unsupportedUsages.push({ loc: getLoc(p.node), reason: "call-expression" });
    });

  const cssTagged = root.find(j.TaggedTemplateExpression, {
    tag: { type: "Identifier", name: cssLocal },
  } as any);

  cssTagged.forEach((p: any) => {
    const cssNode = p.node as any;
    const parent = p.parentPath?.node;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.init === cssNode &&
      parent.id?.type === "Identifier"
    ) {
      return;
    }
    // Allow conditional usage only when it's within a styled template literal.
    // (Heuristic preserved from previous inline logic.)
    let cur: any = p;
    let arrow: any = null;
    while (cur && cur.parentPath) {
      cur = cur.parentPath;
      if (!cur?.node) {
        break;
      }
      if (cur.node.type === "ArrowFunctionExpression") {
        arrow = cur.node;
        break;
      }
    }
    if (!arrow) {
      // css template outside arrow function (e.g. in regular function or top-level return)
      unsupportedUsages.push({ loc: getLoc(cssNode), reason: "outside-styled-template" });
      return;
    }

    // Support direct css template body: styled.div(props => css`...`)
    if (arrow.body === cssNode) {
      // Check if this arrow is a direct argument to a styled call
      const arrowParent = cur.parentPath?.node;
      if (isStyledCallExpression(arrowParent, styledLocalNames)) {
        // This is the pattern styled.div(props => css`...`) - allowed
        return;
      }
    }

    // Support block body with return: styled.div(props => { return css`...`; })
    if (arrow.body?.type === "BlockStatement") {
      const retStmt = arrow.body.body.find((s: any) => s.type === "ReturnStatement");
      if (retStmt?.argument === cssNode) {
        // Check if this arrow is a direct argument to a styled call
        const arrowParent = cur.parentPath?.node;
        if (isStyledCallExpression(arrowParent, styledLocalNames)) {
          // This is the pattern styled.div(props => { return css`...`; }) - allowed
          return;
        }
      }
    }

    // Support ConditionalExpression: props.$x ? css`...` : css`...`
    if (arrow.body?.type === "ConditionalExpression") {
      const cond = arrow.body;
      if (cond.consequent !== cssNode && cond.alternate !== cssNode) {
        unsupportedUsages.push({ loc: getLoc(cssNode), reason: "outside-styled-template" });
        return;
      }
    }
    // Support LogicalExpression: props.$x && css`...`
    else if (arrow.body?.type === "LogicalExpression" && arrow.body.operator === "&&") {
      if (arrow.body.right !== cssNode) {
        unsupportedUsages.push({ loc: getLoc(cssNode), reason: "outside-styled-template" });
        return;
      }
    } else if (arrow.body !== cssNode && arrow.body?.type !== "BlockStatement") {
      // Not a direct body, not a conditional, not a logical, not a block - unsupported
      unsupportedUsages.push({ loc: getLoc(cssNode), reason: "outside-styled-template" });
      return;
    }
    let hasStyledAncestor = false;
    let anc: any = cur;
    while (anc && anc.parentPath) {
      anc = anc.parentPath;
      if (
        anc?.node?.type === "TaggedTemplateExpression" &&
        isStyledTag(styledLocalNames, anc.node.tag)
      ) {
        hasStyledAncestor = true;
        break;
      }
      // Also check for styled call expression: styled.div(fn => css`...`)
      if (isStyledCallExpression(anc?.node, styledLocalNames)) {
        hasStyledAncestor = true;
        break;
      }
    }
    if (!hasStyledAncestor) {
      unsupportedUsages.push({ loc: getLoc(cssNode), reason: "outside-styled-template" });
      return;
    }
  });
  return unsupportedUsages;
}

export { type UnsupportedCssUsage };

export function extractAndRemoveCssHelpers(args: {
  root: any;
  j: JSCodeshift;
  styledImports: Collection<any>;
  cssLocal: string | undefined;
  toStyleKey: (name: string) => string;
}): {
  unsupportedCssUsages: UnsupportedCssUsage[];
  cssHelperNames: Set<string>;
  cssHelperDecls: StyledDecl[];
  cssHelperHasUniversalSelectors: boolean;
  cssHelperUniversalSelectorLoc: Loc;
  changed: boolean;
} {
  const { root, j, styledImports, cssLocal, toStyleKey } = args;

  const styledLocalNames = collectStyledDefaultImportLocalNames(styledImports);
  const exportedLocalNames = buildExportedLocalNames(root, j);

  const cssHelperNames = new Set<string>();
  const cssHelperDecls: StyledDecl[] = [];
  let cssHelperHasUniversalSelectors = false;
  let cssHelperUniversalSelectorLoc: Loc = null;
  let changed = false;

  if (!cssLocal) {
    return {
      unsupportedCssUsages: [],
      cssHelperNames,
      cssHelperDecls,
      cssHelperHasUniversalSelectors,
      cssHelperUniversalSelectorLoc,
      changed,
    };
  }

  const unsupportedCssUsages = detectUnsupportedCssHelperUsage({
    root,
    j,
    cssLocal,
    styledLocalNames,
  });
  if (unsupportedCssUsages.length > 0) {
    return {
      unsupportedCssUsages,
      cssHelperNames,
      cssHelperDecls,
      cssHelperHasUniversalSelectors,
      cssHelperUniversalSelectorLoc,
      changed,
    };
  }

  const noteCssHelperUniversalSelector = (template: any): void => {
    cssHelperHasUniversalSelectors = true;
    if (cssHelperUniversalSelectorLoc) {
      return;
    }
    cssHelperUniversalSelectorLoc = getCssHelperTemplateLoc(template);
  };

  const isStillReferenced = (): boolean =>
    root
      .find(j.Identifier, { name: cssLocal } as any)
      .filter((p: any) => isIdentifierReference(p))
      .size() > 0;

  root
    .find(j.VariableDeclarator, {
      init: { type: "TaggedTemplateExpression" },
    })
    .forEach((p: any) => {
      const init = p.node.init as any;
      if (
        !init ||
        init.type !== "TaggedTemplateExpression" ||
        init.tag?.type !== "Identifier" ||
        init.tag.name !== cssLocal
      ) {
        return;
      }
      if (p.node.id.type !== "Identifier") {
        return;
      }
      const localName = p.node.id.name;
      const placementHints = getCssHelperPlacementHints(root, p);

      const template = init.quasi;
      const parsed = parseStyledTemplateLiteral(template);
      // `css\`...\`` snippets are not attached to a selector; parse by wrapping in `& { ... }`.
      const rawCss = `& { ${parsed.rawCss} }`;
      const stylisAst = compile(rawCss);
      const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, { rawCss });
      if (rules.some((r) => typeof r.selector === "string" && r.selector.includes("*"))) {
        noteCssHelperUniversalSelector(template);
      }

      cssHelperDecls.push({
        ...placementHints,
        localName,
        base: { kind: "intrinsic", tagName: "div" },
        styleKey: toStyleKey(localName),
        isCssHelper: true,
        rules,
        templateExpressions: parsed.slots.map((s) => s.expression),
        rawCss,
      });

      cssHelperNames.add(localName);
      const isExported = exportedLocalNames.has(localName);
      if (!isExported) {
        const decl = p.parentPath?.node;
        if (decl?.type === "VariableDeclaration") {
          decl.declarations = decl.declarations.filter((dcl: any) => dcl !== p.node);
          if (decl.declarations.length === 0) {
            const exportDecl = p.parentPath?.parentPath?.node;
            if (exportDecl?.type === "ExportNamedDeclaration") {
              j(p).closest(j.ExportNamedDeclaration).remove();
            } else {
              j(p).closest(j.VariableDeclaration).remove();
            }
          }
        }
      }
      changed = true;
    });

  // Remove `css` import specifier from styled-components imports ONLY if `css` is no longer referenced.
  // This avoids producing "only-import-changes" outputs when we didn't actually transform `css` usage
  // (e.g. `return css\`...\`` inside a function).
  if (!isStillReferenced()) {
    styledImports.forEach((imp) => {
      const specs = imp.node.specifiers ?? [];
      const next = specs.filter((s: any) => {
        if (s.type !== "ImportSpecifier") {
          return true;
        }
        if (s.imported.type !== "Identifier") {
          return true;
        }
        return s.imported.name !== "css";
      });
      if (next.length !== specs.length) {
        imp.node.specifiers = next;
        if (imp.node.specifiers.length === 0) {
          j(imp).remove();
        }
        changed = true;
      }
    });
  }

  return {
    unsupportedCssUsages: [],
    cssHelperNames,
    cssHelperDecls,
    cssHelperHasUniversalSelectors,
    cssHelperUniversalSelectorLoc,
    changed,
  };
}
