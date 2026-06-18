/**
 * Builds a conditional inline-style fallback for theme boolean ternaries where
 * one branch resolves statically and the other must run at runtime via the
 * `useTheme()` hook variable.
 */
import type { ImportSpec } from "../../adapter.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
import { isMemberExpression } from "../lower-rules/utils.js";
import type { HandlerResult, ThemeParamInfo } from "./types.js";

/**
 * When a theme boolean conditional (e.g., `props.theme.isDark ? A : B`) has one
 * resolvable branch and the other is an unresolvable call expression, emit the
 * resolved branch as the base StyleX style and the unresolvable branch as a
 * conditional inline style.
 *
 * This replaces `props.theme.*` / `<paramName>.theme.*` references in the
 * unresolvable branch with `theme.*` (using the `useTheme()` hook variable).
 */
export function tryBuildThemeBooleanInlineStyleFallback(args: {
  trueValue: unknown;
  falseValue: unknown;
  trueImports: ImportSpec[];
  falseImports: ImportSpec[];
  trueBranch: unknown;
  falseBranch: unknown;
  themeBoolInfo: { themeProp: string };
  cssProp: string;
  paramName: string | null;
  info: ThemeParamInfo | null;
}): HandlerResult | null {
  const {
    trueValue,
    falseValue,
    trueImports,
    falseImports,
    trueBranch,
    falseBranch,
    themeBoolInfo,
    cssProp,
    paramName,
    info,
  } = args;

  // Exactly one branch must be resolved
  if ((trueValue === null) === (falseValue === null)) {
    return null;
  }

  const resolvedBranchIsTrue = trueValue !== null;
  const unresolvableBranch = resolvedBranchIsTrue ? falseBranch : trueBranch;

  // Transform the unresolvable branch: replace props.theme.* / <param>.theme.* with theme.*
  const transformed = replaceThemeRefsWithHookVar(unresolvableBranch, paramName, info);
  if (!transformed) {
    return null;
  }

  // Verify the transformation replaced all param/theme binding references.
  // Dangling references (e.g. non-theme prop accesses) would produce undefined variables at runtime.
  if (!isFullyTransformedThemeExpr(transformed, paramName, info)) {
    return null;
  }

  return {
    type: "splitThemeBooleanWithInlineStyleFallback",
    cssProp,
    themeProp: themeBoolInfo.themeProp,
    resolvedValue: resolvedBranchIsTrue ? trueValue : falseValue,
    resolvedImports: resolvedBranchIsTrue ? trueImports : falseImports,
    resolvedBranchIsTrue,
    inlineExpr: transformed,
  };
}

/**
 * Validates that a transformed expression has no dangling references to
 * the original arrow function parameter or theme binding name.
 * After `replaceThemeRefsWithHookVar`, all `<paramName>.theme.*` should
 * have been rewritten to `theme.*`. If the param name still appears,
 * the expression accesses non-theme props and can't be safely used
 * with `useTheme()` alone.
 */
function isFullyTransformedThemeExpr(
  transformed: unknown,
  paramName: string | null,
  info: ThemeParamInfo | null,
): boolean {
  const ids = new Set<string>();
  collectFreeIdentifiers(transformed, ids);
  if (paramName && ids.has(paramName)) {
    return false;
  }
  if (info?.kind === "themeBinding") {
    if (info.themeName !== "theme" && ids.has(info.themeName)) {
      return false;
    }
    // Reject expressions that reference destructured sibling bindings
    // (e.g., `enabled` from `({ theme, enabled }) => ...`) since only
    // `theme` is available via useTheme() in the generated wrapper.
    if (info.siblingBindings.some((b) => ids.has(b))) {
      return false;
    }
  }
  return true;
}

/**
 * Collects free variable identifiers from an AST node, excluding
 * non-computed property names in member expressions (e.g., in
 * `theme.color.bgSub`, only `theme` is a free variable; `color`
 * and `bgSub` are property accesses, not variable references).
 */
function collectFreeIdentifiers(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectFreeIdentifiers(child, out);
    }
    return;
  }
  const typed = node as Record<string, unknown>;
  const nodeType = typed.type as string | undefined;

  // For member expressions, only recurse into the object (left side).
  // Skip the property name unless it's computed (bracket notation).
  if (nodeType === "MemberExpression" || nodeType === "OptionalMemberExpression") {
    collectFreeIdentifiers(typed.object, out);
    if (typed.computed) {
      collectFreeIdentifiers(typed.property, out);
    }
    return;
  }

  if (nodeType === "Identifier" && typeof typed.name === "string") {
    out.add(typed.name);
  }

  for (const key of Object.keys(typed)) {
    if (key === "loc" || key === "comments" || key === "type") {
      continue;
    }
    const child = typed[key];
    if (child && typeof child === "object") {
      collectFreeIdentifiers(child, out);
    }
  }
}

/**
 * Deep-clones an expression and replaces `<paramName>.theme.*` or `theme.*`
 * (for destructured theme binding) with `theme.*` references suitable for
 * use with the `useTheme()` hook variable.
 *
 * Returns null if the expression contains references that cannot be safely
 * transformed (e.g., non-theme param usage).
 */
function replaceThemeRefsWithHookVar(
  expr: unknown,
  paramName: string | null,
  info: ThemeParamInfo | null,
): unknown {
  if (!expr || typeof expr !== "object") {
    return expr;
  }
  const cloned = cloneAstNode(expr);

  const replace = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(replace);
    }
    const n = node as Record<string, unknown>;

    // For propsParam pattern: replace <paramName>.theme.X with theme.X
    if (info?.kind === "propsParam" && paramName && isMemberExpression(n)) {
      const obj = n.object as Record<string, unknown> | undefined;
      const prop = n.property as Record<string, unknown> | undefined;
      // Match: <paramName>.theme
      if (
        obj?.type === "Identifier" &&
        obj.name === paramName &&
        prop?.type === "Identifier" &&
        prop.name === "theme" &&
        n.computed === false
      ) {
        // Replace entire <paramName>.theme with just "theme" identifier
        return { type: "Identifier", name: "theme" };
      }
    }

    // For themeBinding pattern: the theme identifier is already directly accessible
    // Just ensure the binding name maps to "theme"
    if (info?.kind === "themeBinding" && n.type === "Identifier" && n.name === info.themeName) {
      return { type: "Identifier", name: "theme" };
    }

    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        n[key] = replace(child);
      }
    }
    return n;
  };

  return replace(cloned);
}
