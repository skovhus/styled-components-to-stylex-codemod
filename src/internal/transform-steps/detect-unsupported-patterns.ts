import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { isStyledTag } from "../transform/css-helpers.js";
import { unwrapTransparentExpression } from "../utilities/jscodeshift-utils.js";

/**
 * Detects unsupported template patterns (component selectors, specificity hacks) and bails with warnings.
 */
export function detectUnsupportedPatternsStep(ctx: TransformContext): StepResult {
  const { root, j, warnings, styledLocalNames } = ctx;

  const collectStyledComponentNames = (): Set<string> => {
    const names = new Set<string>();
    if (!styledLocalNames || styledLocalNames.size === 0) {
      return names;
    }

    root.find(j.VariableDeclarator).forEach((p) => {
      const id = p.node.id;
      const init = p.node.init as any;
      if (!id || id.type !== "Identifier" || !init) {
        return;
      }
      if (init.type === "TaggedTemplateExpression") {
        if (isStyledTag(styledLocalNames, init.tag)) {
          names.add(id.name);
        }
        return;
      }
      if (init.type === "CallExpression") {
        if (isStyledTag(styledLocalNames, init.callee)) {
          names.add(id.name);
        }
      }
    });

    return names;
  };

  const collectHocStyledFactoryNames = (): Map<string, { line: number; column: number } | null> => {
    const names = new Map<string, { line: number; column: number } | null>();
    if (!styledLocalNames || styledLocalNames.size === 0) {
      return names;
    }

    const getAssignedIdentifier = (path: any): { name: string; loc?: any } | null => {
      let cur: any = path;
      while (cur?.parentPath) {
        const parent = cur.parentPath.node;
        if (parent?.type === "VariableDeclarator" && parent.id?.type === "Identifier") {
          return { name: parent.id.name, loc: parent.id.loc };
        }
        if (parent?.type === "AssignmentExpression" && parent.left?.type === "Identifier") {
          return { name: parent.left.name, loc: parent.left.loc };
        }
        if (
          parent?.type === "MemberExpression" ||
          parent?.type === "OptionalMemberExpression" ||
          parent?.type === "CallExpression"
        ) {
          cur = cur.parentPath;
          continue;
        }
        break;
      }
      return null;
    };

    root.find(j.CallExpression).forEach((p) => {
      const callNode = p.node as any;
      const args = callNode.arguments ?? [];
      const hasStyledArg = args.some(
        (arg: any) => arg?.type === "Identifier" && styledLocalNames.has(arg.name),
      );
      if (!hasStyledArg) {
        return;
      }
      if (callNode.callee?.type === "Identifier" && styledLocalNames.has(callNode.callee.name)) {
        return;
      }
      const assigned = getAssignedIdentifier(p);
      if (!assigned) {
        return;
      }
      names.set(
        assigned.name,
        assigned.loc?.start?.line !== undefined
          ? { line: assigned.loc.start.line, column: assigned.loc.start.column ?? 0 }
          : null,
      );
    });

    return names;
  };

  const isFactoryTag = (factoryNames: Set<string>, tag: any): boolean => {
    if (!tag || typeof tag !== "object") {
      return false;
    }
    if (tag.type === "Identifier") {
      return factoryNames.has(tag.name);
    }
    if (tag.type === "MemberExpression" || tag.type === "OptionalMemberExpression") {
      return isFactoryTag(factoryNames, tag.object);
    }
    if (tag.type === "CallExpression") {
      return isFactoryTag(factoryNames, tag.callee);
    }
    return false;
  };

  const isFunctionNode = (node: any): boolean =>
    !!node &&
    (node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ObjectMethod" ||
      node.type === "ClassMethod");

  const isAssignedWithinFunction = (path: any): boolean => {
    let cur: any = path;
    while (cur?.parentPath) {
      const parent = cur.parentPath.node;
      if (parent?.type === "VariableDeclarator" && parent.init === cur.node) {
        return true;
      }
      if (parent?.type === "AssignmentExpression" && parent.right === cur.node) {
        return true;
      }
      if (isFunctionNode(parent)) {
        break;
      }
      cur = cur.parentPath;
    }
    return false;
  };

  const isInsideFunction = (path: any): boolean => {
    let cur: any = path;
    while (cur?.parentPath) {
      cur = cur.parentPath;
      if (isFunctionNode(cur?.node)) {
        return true;
      }
    }
    return false;
  };

  // Detect patterns that aren't directly representable in StyleX (or require semantic rewrites).
  // These warnings are used for per-fixture expectations and help guide manual follow-ups.
  let hasComponentSelector = false;
  let hasSpecificityHack = false;
  let componentSelectorLoc: { line: number; column: number } | null = null;
  let specificityHackLoc: { line: number; column: number } | null = null;
  let hocStyledFactoryLoc: { line: number; column: number } | null = null;
  let staticStyledPropertyLoc: { line: number; column: number } | null = null;

  root.find(j.TemplateLiteral).forEach((p) => {
    const tl = p.node;

    // Specificity hacks like `&&` / `&&&` inside styled template literals.
    for (const quasi of tl.quasis) {
      if (quasi.value.raw.includes("&&")) {
        hasSpecificityHack = true;
        if (!specificityHackLoc && quasi.loc?.start?.line !== undefined) {
          specificityHackLoc = {
            line: quasi.loc.start.line,
            column: quasi.loc.start.column ?? 0,
          };
        }
      }
    }

    // Component selector patterns like `${Link}:hover & { ... }`
    for (let i = 0; i < tl.expressions.length; i++) {
      const expr = tl.expressions[i];
      const after = tl.quasis[i + 1]?.value.raw ?? "";
      if (expr?.type === "Identifier" && after.includes(":hover &")) {
        hasComponentSelector = true;
        if (!componentSelectorLoc) {
          const loc = (expr as any).loc ?? tl.loc;
          if (loc?.start?.line !== undefined) {
            componentSelectorLoc = {
              line: loc.start.line,
              column: loc.start.column ?? 0,
            };
          }
        }
      }
    }
  });

  if (!hocStyledFactoryLoc) {
    const hocFactories = collectHocStyledFactoryNames();
    if (hocFactories.size > 0) {
      const factoryNames = new Set(hocFactories.keys());
      root.find(j.TaggedTemplateExpression).forEach((p) => {
        if (hocStyledFactoryLoc) {
          return;
        }
        const tag = p.node.tag as any;
        if (!isFactoryTag(factoryNames, tag)) {
          return;
        }
        const loc = (p.node.loc ?? tag?.loc)?.start;
        if (loc?.line !== undefined) {
          hocStyledFactoryLoc = { line: loc.line, column: loc.column ?? 0 };
        }
      });
      root.find(j.CallExpression).forEach((p) => {
        if (hocStyledFactoryLoc) {
          return;
        }
        const callee = p.node.callee as any;
        if (!isFactoryTag(factoryNames, callee)) {
          return;
        }
        const loc = (p.node.loc ?? callee?.loc)?.start;
        if (loc?.line !== undefined) {
          hocStyledFactoryLoc = { line: loc.line, column: loc.column ?? 0 };
        }
      });
      if (!hocStyledFactoryLoc) {
        for (const [, loc] of hocFactories.entries()) {
          if (loc) {
            hocStyledFactoryLoc = loc;
            break;
          }
        }
      }
    }
  }

  root.find(j.TaggedTemplateExpression).forEach((p) => {
    if (hocStyledFactoryLoc) {
      return;
    }
    const tag = p.node.tag as any;
    if (!styledLocalNames || styledLocalNames.size === 0 || !isStyledTag(styledLocalNames, tag)) {
      return;
    }
    if (!isInsideFunction(p)) {
      return;
    }
    if (isAssignedWithinFunction(p)) {
      return;
    }
    const loc = (p.node.loc ?? tag?.loc)?.start;
    if (loc?.line !== undefined) {
      hocStyledFactoryLoc = { line: loc.line, column: loc.column ?? 0 };
    }
  });

  if (!staticStyledPropertyLoc && styledLocalNames && styledLocalNames.size > 0) {
    const styledComponentNames = collectStyledComponentNames();
    if (styledComponentNames.size > 0) {
      root.find(j.TaggedTemplateExpression).forEach((p) => {
        if (staticStyledPropertyLoc) {
          return;
        }
        const tag = p.node.tag as any;
        if (!isStyledTag(styledLocalNames, tag)) {
          return;
        }
        const expressions = p.node.quasi?.expressions ?? [];
        for (const expr of expressions) {
          const base = unwrapTransparentExpression(expr) as any;
          if (base?.type !== "MemberExpression" && base?.type !== "OptionalMemberExpression") {
            continue;
          }
          const obj = unwrapTransparentExpression(base.object) as any;
          if (obj?.type !== "Identifier") {
            continue;
          }
          if (!styledComponentNames.has(obj.name)) {
            continue;
          }
          const loc = base.loc?.start ?? obj.loc?.start ?? p.node.loc?.start;
          if (loc?.line !== undefined) {
            staticStyledPropertyLoc = { line: loc.line, column: loc.column ?? 0 };
            break;
          }
        }
      });
    }
  }

  if (!staticStyledPropertyLoc && styledLocalNames && styledLocalNames.size > 0) {
    const styledComponentNames = collectStyledComponentNames();
    if (styledComponentNames.size > 0) {
      root.find(j.JSXMemberExpression).forEach((p) => {
        if (staticStyledPropertyLoc) {
          return;
        }
        const obj = p.node.object;
        if (obj?.type !== "JSXIdentifier") {
          return;
        }
        if (!styledComponentNames.has(obj.name)) {
          return;
        }
        const loc = (p.node.loc ?? obj.loc)?.start;
        if (loc?.line !== undefined) {
          staticStyledPropertyLoc = { line: loc.line, column: loc.column ?? 0 };
        }
      });
    }
  }

  if (hasComponentSelector) {
    warnings.push({
      severity: "warning",
      type: "Component selectors like `${OtherComponent}:hover &` are not directly representable in StyleX. Manual refactor is required",
      loc: componentSelectorLoc,
    });

    // Policy: component selectors like `${OtherComponent}:hover &` require a semantic refactor.
    // Bail out to avoid producing incorrect output.
    return returnResult({ code: null, warnings }, "bail");
  }

  if (hasSpecificityHack) {
    warnings.push({
      severity: "warning",
      type: "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
      loc: specificityHackLoc,
    });
    return returnResult({ code: null, warnings }, "bail");
  }

  if (hocStyledFactoryLoc) {
    warnings.push({
      severity: "warning",
      type: "Higher-order styled factory wrappers (e.g. hoc(styled)) are not supported",
      loc: hocStyledFactoryLoc,
    });
    return returnResult({ code: null, warnings }, "bail");
  }

  if (staticStyledPropertyLoc) {
    warnings.push({
      severity: "warning",
      type: "Static properties on styled components (e.g. Styled.Component) are not supported",
      loc: staticStyledPropertyLoc,
    });
    return returnResult({ code: null, warnings }, "bail");
  }

  return CONTINUE;
}
