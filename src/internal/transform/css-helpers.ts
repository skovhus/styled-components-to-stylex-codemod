import type { Collection, JSCodeshift, TemplateLiteral } from "jscodeshift";
import { compile } from "stylis";

import type { CssRuleIR } from "../css-ir.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { parseStyledTemplateLiteral } from "../styled-css.js";
import type { StyledDecl } from "../transform-types.js";

type Loc = { line: number; column: number } | null;

export type CssHelperFunction = {
  name: string;
  paramName: string;
  paramType?: unknown;
  loc: Loc;
  rules: CssRuleIR[];
  templateExpressions: unknown[];
  rawCss: string;
};

export function removeInlinedCssHelperFunctions(args: {
  root: any;
  j: JSCodeshift;
  cssLocal: string | undefined;
  names: Set<string>;
}): boolean {
  const { root, j, cssLocal, names } = args;
  if (!cssLocal || names.size === 0) {
    return false;
  }
  const exportedLocalNames = buildExportedLocalNames(root, j);
  let changed = false;

  root
    .find(j.VariableDeclarator, {
      init: { type: "ArrowFunctionExpression" },
    })
    .forEach((p: any) => {
      if (p.node.id.type !== "Identifier") {
        return;
      }
      const name = p.node.id.name;
      if (!names.has(name)) {
        return;
      }
      if (exportedLocalNames.has(name)) {
        return;
      }
      const init = p.node.init as any;
      if (!init || init.type !== "ArrowFunctionExpression") {
        return;
      }
      const body = init.body as any;
      if (
        !body ||
        body.type !== "TaggedTemplateExpression" ||
        body.tag?.type !== "Identifier" ||
        body.tag.name !== cssLocal
      ) {
        return;
      }

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
      changed = true;
    });

  return changed;
}

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

  const isSwitchReturnCssInsideCssTemplateIife = (p: any): boolean => {
    // Allow nested `return css`...`` inside a switch that's wrapped in a template IIFE,
    // inside any `css` tagged template:
    //   css` ... ${() => { switch(x) { ... return css`...` }}} ... `
    const cssNode = p?.node as any;
    const ret = p?.parentPath?.node as any;
    if (!ret || ret.type !== "ReturnStatement" || ret.argument !== cssNode) {
      return false;
    }

    // Find the nearest enclosing ArrowFunctionExpression and ensure we passed through a SwitchStatement.
    let cur: any = p.parentPath;
    let sawSwitch = false;
    let iifePath: any = null;
    while (cur && cur.parentPath) {
      cur = cur.parentPath;
      const n = cur?.node;
      if (!n) {
        break;
      }
      if (n.type === "SwitchStatement") {
        sawSwitch = true;
      }
      if (n.type === "ArrowFunctionExpression") {
        iifePath = cur;
        break;
      }
    }
    if (!iifePath || !sawSwitch) {
      return false;
    }
    if ((iifePath.node.params ?? []).length !== 0) {
      return false;
    }

    // Find the enclosing `css` tagged template.
    let up: any = iifePath;
    while (up && up.parentPath) {
      up = up.parentPath;
      const n = up?.node as any;
      if (
        n?.type === "TaggedTemplateExpression" &&
        n.tag?.type === "Identifier" &&
        n.tag.name === cssLocal
      ) {
        return true;
      }
    }

    return false;
  };

  cssTagged.forEach((p: any) => {
    if (isSwitchReturnCssInsideCssTemplateIife(p)) {
      return;
    }
    const cssNode = p.node as any;
    const parent = p.parentPath?.node;
    if (
      parent?.type === "VariableDeclarator" &&
      parent.init === cssNode &&
      parent.id?.type === "Identifier"
    ) {
      return;
    }
    // Allow css templates as values of object properties:
    //   const obj = { prop: css`...` }
    if (
      (parent?.type === "Property" || parent?.type === "ObjectProperty") &&
      parent.value === cssNode &&
      parent.key?.type === "Identifier"
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
      // Support css helper functions: const helper = (x) => css`...`
      // (These may later be inlined when called from a styled template.)
      if (
        arrowParent?.type === "VariableDeclarator" &&
        arrowParent.init === arrow &&
        arrowParent.id?.type === "Identifier"
      ) {
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

/**
 * Tracks CSS helpers that are object properties, e.g.:
 *   const buttonStyles = { rootCss: css`...`, sizeCss: css`...` }
 * Maps: objectName -> propertyName -> StyledDecl
 */
export type CssHelperObjectMembers = Map<string, Map<string, StyledDecl>>;

export function extractAndRemoveCssHelpers(args: {
  root: any;
  j: JSCodeshift;
  styledImports: Collection<any>;
  cssLocal: string | undefined;
  toStyleKey: (name: string) => string;
}): {
  unsupportedCssUsages: UnsupportedCssUsage[];
  cssHelperFunctions: Map<string, CssHelperFunction>;
  cssHelperNames: Set<string>;
  cssHelperObjectMembers: CssHelperObjectMembers;
  cssHelperDecls: StyledDecl[];
  cssHelperHasUniversalSelectors: boolean;
  cssHelperUniversalSelectorLoc: Loc;
  changed: boolean;
} {
  const { root, j, styledImports, cssLocal, toStyleKey } = args;

  const styledLocalNames = collectStyledDefaultImportLocalNames(styledImports);
  const exportedLocalNames = buildExportedLocalNames(root, j);

  const cssHelperFunctions = new Map<string, CssHelperFunction>();
  const cssHelperNames = new Set<string>();
  const cssHelperObjectMembers: CssHelperObjectMembers = new Map();
  const cssHelperDecls: StyledDecl[] = [];
  let cssHelperHasUniversalSelectors = false;
  let cssHelperUniversalSelectorLoc: Loc = null;
  let changed = false;

  if (!cssLocal) {
    return {
      unsupportedCssUsages: [],
      cssHelperFunctions,
      cssHelperNames,
      cssHelperObjectMembers,
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
      cssHelperFunctions,
      cssHelperNames,
      cssHelperObjectMembers,
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

  // Collect css helper functions like: const helper = (x) => css`...`
  // These are NOT converted here; they are collected for later inlining.
  root
    .find(j.VariableDeclarator, {
      init: { type: "ArrowFunctionExpression" },
    })
    .forEach((p: any) => {
      if (p.node.id.type !== "Identifier") {
        return;
      }
      const name = p.node.id.name;
      const init = p.node.init as any;
      if (!init || init.type !== "ArrowFunctionExpression") {
        return;
      }
      const param0 = init.params?.[0];
      if (!param0 || param0.type !== "Identifier") {
        return;
      }
      const paramName = param0.name;
      const paramType = (param0 as any).typeAnnotation;

      const body = init.body as any;
      if (
        !body ||
        body.type !== "TaggedTemplateExpression" ||
        body.tag?.type !== "Identifier" ||
        body.tag.name !== cssLocal
      ) {
        return;
      }
      const template = body.quasi;
      const parsed = parseStyledTemplateLiteral(template);
      // Compile with an `& { ... }` wrapper so Stylis emits declarations under `&`,
      // but pass the *unwrapped* raw template CSS for placeholder recovery heuristics.
      const wrappedRawCss = `& { ${parsed.rawCss} }`;
      const stylisAst = compile(wrappedRawCss);
      const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, {
        rawCss: parsed.rawCss,
      });

      cssHelperFunctions.set(name, {
        name,
        paramName,
        paramType,
        loc: getCssHelperTemplateLoc(template),
        rules,
        templateExpressions: parsed.slots.map((s) => s.expression),
        rawCss: parsed.rawCss,
      });
    });

  // Collect CSS helpers defined as object properties:
  //   const buttonStyles = { rootCss: css`...`, sizeCss: css`...` }
  root
    .find(j.VariableDeclarator, {
      init: { type: "ObjectExpression" },
    })
    .forEach((p: any) => {
      if (p.node.id.type !== "Identifier") {
        return;
      }
      const objectName = p.node.id.name;
      const objectExpr = p.node.init as { properties?: unknown[] };
      if (!objectExpr.properties || !Array.isArray(objectExpr.properties)) {
        return;
      }

      // Check if this object contains any CSS template literal properties
      const memberMap = new Map<string, StyledDecl>();

      for (const prop of objectExpr.properties) {
        const propTyped = prop as {
          type?: string;
          key?: { type?: string; name?: string };
          value?: { type?: string; tag?: { type?: string; name?: string }; quasi?: unknown };
        };

        // Only handle simple property definitions (not spread, getters, etc.)
        if (propTyped.type !== "Property" && propTyped.type !== "ObjectProperty") {
          continue;
        }

        // Only handle identifier keys (not computed or string literal keys)
        if (propTyped.key?.type !== "Identifier") {
          continue;
        }

        const propName = propTyped.key.name;
        if (!propName) {
          continue;
        }

        // Check if the value is a css template literal
        const value = propTyped.value;
        if (
          !value ||
          value.type !== "TaggedTemplateExpression" ||
          value.tag?.type !== "Identifier" ||
          value.tag.name !== cssLocal
        ) {
          continue;
        }

        // Parse the CSS template
        const template = value.quasi as TemplateLiteral;
        const parsed = parseStyledTemplateLiteral(template);

        // Only support static CSS templates (no interpolations) for now
        // to keep the implementation simpler and safer
        if (parsed.slots.length > 0) {
          continue;
        }

        const rawCss = `& { ${parsed.rawCss} }`;
        const stylisAst = compile(rawCss);
        const rules = normalizeStylisAstToIR(stylisAst as any, parsed.slots, { rawCss });

        if (rules.some((r) => typeof r.selector === "string" && r.selector.includes("*"))) {
          noteCssHelperUniversalSelector(template);
        }

        // Create a qualified name for the style key: objectName + PropName
        const qualifiedName = `${objectName}.${propName}`;
        const styleKey = toStyleKey(
          `${objectName}${propName.charAt(0).toUpperCase()}${propName.slice(1)}`,
        );

        const decl: StyledDecl = {
          localName: qualifiedName,
          base: { kind: "intrinsic", tagName: "div" },
          styleKey,
          isCssHelper: true,
          rules,
          templateExpressions: [],
          rawCss,
        };

        memberMap.set(propName, decl);
        cssHelperDecls.push(decl);
      }

      // Only add to cssHelperObjectMembers if we found at least one CSS property
      if (memberMap.size > 0) {
        cssHelperObjectMembers.set(objectName, memberMap);

        // Remove the CSS helper properties from the object (unless exported)
        const isExported = exportedLocalNames.has(objectName);
        if (!isExported) {
          // Filter out the CSS helper properties
          const cssHelperPropNames = new Set(memberMap.keys());
          const remainingProps = objectExpr.properties.filter((prop: any) => {
            if (prop.type !== "Property" && prop.type !== "ObjectProperty") {
              return true; // Keep non-property items like spread
            }
            if (prop.key?.type !== "Identifier") {
              return true; // Keep computed or non-identifier keys
            }
            return !cssHelperPropNames.has(prop.key.name);
          });

          if (remainingProps.length === 0) {
            // All properties were CSS helpers - remove the entire declaration
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
          } else {
            // Some properties remain - just remove the CSS helper properties
            objectExpr.properties = remainingProps;
          }
        }
        changed = true;
      }
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
    cssHelperFunctions,
    cssHelperNames,
    cssHelperObjectMembers,
    cssHelperDecls,
    cssHelperHasUniversalSelectors,
    cssHelperUniversalSelectorLoc,
    changed,
  };
}
