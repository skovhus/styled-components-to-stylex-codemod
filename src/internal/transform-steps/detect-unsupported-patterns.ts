/**
 * Step: detect unsupported styled-components patterns and bail early.
 * Core concepts: selector validation and warning reporting.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { isStyledTag } from "../transform/css-helpers.js";

/**
 * Detects unsupported template patterns (component selectors, specificity hacks) and bails with warnings.
 */
export function detectUnsupportedPatternsStep(ctx: TransformContext): StepResult {
  const { root, j, warnings, styledLocalNames } = ctx;

  const unwrapExpression = (expr: any): any => {
    let current = expr;
    while (current) {
      if (
        current.type === "TSAsExpression" ||
        current.type === "TSNonNullExpression" ||
        current.type === "TypeCastExpression" ||
        current.type === "ParenthesizedExpression"
      ) {
        current = current.expression;
        continue;
      }
      break;
    }
    return current;
  };

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

  const styledComponentNames = collectStyledComponentNames();

  // Detect patterns that aren't directly representable in StyleX (or require semantic rewrites).
  // These warnings are used for per-fixture expectations and help guide manual follow-ups.
  let hasComponentSelector = false;
  let hasSpecificityHack = false;
  let componentSelectorLoc: { line: number; column: number } | null = null;
  let specificityHackLoc: { line: number; column: number } | null = null;
  let hocStyledFactoryLoc: { line: number; column: number } | null = null;
  let themePropOverrideLoc: { line: number; column: number } | null = null;

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

  if (!themePropOverrideLoc && styledComponentNames.size > 0) {
    const getThemeAttrLoc = (attrs: any[] | null | undefined) => {
      for (const attr of attrs ?? []) {
        if (
          attr?.type === "JSXAttribute" &&
          attr.name?.type === "JSXIdentifier" &&
          attr.name.name === "theme"
        ) {
          const loc = attr.loc?.start;
          if (loc?.line !== undefined) {
            return { line: loc.line, column: loc.column ?? 0 };
          }
          return null;
        }
      }
      return null;
    };

    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier" } },
      } as any)
      .forEach((p: any) => {
        if (themePropOverrideLoc) {
          return;
        }
        const opening = p.node.openingElement;
        const name = opening?.name;
        if (name?.type !== "JSXIdentifier") {
          return;
        }
        if (!styledComponentNames.has(name.name)) {
          return;
        }
        const loc = getThemeAttrLoc(opening.attributes ?? []);
        if (loc) {
          themePropOverrideLoc = loc;
        }
      });

    root
      .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier" } } as any)
      .forEach((p: any) => {
        if (themePropOverrideLoc) {
          return;
        }
        const node = p.node;
        const name = node?.name;
        if (name?.type !== "JSXIdentifier") {
          return;
        }
        if (!styledComponentNames.has(name.name)) {
          return;
        }
        const loc = getThemeAttrLoc(node.attributes ?? []);
        if (loc) {
          themePropOverrideLoc = loc;
        }
      });
  }

  // Detect Component.defaultProps = { theme: ... } assignments.
  // These are safe to handle: the codemod removes the defaultProps assignment and
  // resolves theme values via the adapter (StyleX variables). We record the component
  // names so collect-static-props can strip the theme key from defaultProps.
  if (styledComponentNames.size > 0) {
    collectThemeDefaultProps({
      root,
      j,
      styledComponentNames,
      unwrapExpression,
      ctx,
    });
  }

  if (themePropOverrideLoc) {
    warnings.push({
      severity: "warning",
      type: "Theme prop overrides on styled components are not supported",
      loc: themePropOverrideLoc,
    });
    return returnResult({ code: null, warnings }, "bail");
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

  return CONTINUE;
}

// =============================================================================
// Non-exported helpers
// =============================================================================

/**
 * Checks whether an object expression contains ONLY a `theme` key (no other properties).
 */
function isThemeOnlyObjectExpression(objExpr: any): boolean {
  if (!objExpr || objExpr.type !== "ObjectExpression") {
    return false;
  }
  const props = (objExpr.properties ?? []).filter(
    (p: any) => p && (p.type === "Property" || p.type === "ObjectProperty"),
  );
  if (props.length === 0) {
    return false;
  }
  return props.every((prop: any) => {
    const key = prop.key;
    const keyName =
      key?.type === "Identifier"
        ? key.name
        : key?.type === "StringLiteral"
          ? key.value
          : key?.type === "Literal" && typeof key.value === "string"
            ? key.value
            : null;
    return keyName === "theme";
  });
}

/**
 * Detects `Component.defaultProps = { theme: ... }` and `Component.defaultProps.theme = ...`
 * assignments. Records the component names on context so the assignments can be cleaned up
 * later (instead of bailing the entire transform).
 */
function collectThemeDefaultProps(args: {
  root: ReturnType<import("jscodeshift").API["jscodeshift"]>;
  j: import("jscodeshift").API["jscodeshift"];
  styledComponentNames: Set<string>;
  unwrapExpression: (expr: any) => any;
  ctx: TransformContext;
}): void {
  const { root, j, styledComponentNames, unwrapExpression, ctx } = args;

  // Pattern 1: Component.defaultProps = { theme: ... }
  root.find(j.AssignmentExpression).forEach((p) => {
    const left = unwrapExpression(p.node.left);
    const right = unwrapExpression(p.node.right);
    if (!left || !right) {
      return;
    }
    if (left.type !== "MemberExpression" && left.type !== "OptionalMemberExpression") {
      return;
    }
    const obj = unwrapExpression(left.object);
    const prop = left.property;
    if (obj?.type !== "Identifier") {
      return;
    }
    if (!styledComponentNames.has(obj.name)) {
      return;
    }
    if (left.computed) {
      return;
    }
    if (prop?.type !== "Identifier" || prop.name !== "defaultProps") {
      return;
    }
    if (isThemeOnlyObjectExpression(right)) {
      ctx.themeDefaultPropsComponents ??= new Set();
      ctx.themeDefaultPropsComponents.add(obj.name);
    }
  });

  // Pattern 2: Component.defaultProps.theme = ...
  root.find(j.AssignmentExpression).forEach((p) => {
    const left = unwrapExpression(p.node.left);
    if (!left) {
      return;
    }
    if (left.type !== "MemberExpression" && left.type !== "OptionalMemberExpression") {
      return;
    }
    const inner = unwrapExpression(left.object);
    const themeProp = left.property;
    if (
      !inner ||
      (inner.type !== "MemberExpression" && inner.type !== "OptionalMemberExpression")
    ) {
      return;
    }
    if (left.computed || inner.computed) {
      return;
    }
    const baseObj = unwrapExpression(inner.object);
    const defaultPropsProp = inner.property;
    if (baseObj?.type !== "Identifier") {
      return;
    }
    if (!styledComponentNames.has(baseObj.name)) {
      return;
    }
    if (defaultPropsProp?.type !== "Identifier" || defaultPropsProp.name !== "defaultProps") {
      return;
    }
    if (themeProp?.type !== "Identifier" || themeProp.name !== "theme") {
      return;
    }
    ctx.themeDefaultPropsComponents ??= new Set();
    ctx.themeDefaultPropsComponents.add(baseObj.name);
  });
}
