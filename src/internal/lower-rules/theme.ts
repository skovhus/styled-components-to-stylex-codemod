/**
 * Creates resolvers for theme value lookups used in inline styles.
 * Core concepts: theme binding detection and adapter value resolution.
 */
import {
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isLogicalExpressionNode,
  literalToStaticValue,
  unwrapLogicalFallback,
} from "../utilities/jscodeshift-utils.js";
import { isDirectionalResult } from "../../adapter.js";
import type { LowerRulesState } from "./state.js";

/**
 * Tagged result returned by `resolveThemeValue` / `resolveThemeValueFromFn`
 * when the adapter returns a directional expansion instead of a single value.
 */
type DirectionalThemeResult = {
  __directional: Array<{ prop: string; expr: unknown }>;
};

export function createThemeResolvers(
  args: Pick<
    LowerRulesState,
    | "root"
    | "j"
    | "filePath"
    | "resolveValue"
    | "resolveValueDirectional"
    | "parseExpr"
    | "resolverImports"
  >,
): {
  hasLocalThemeBinding: boolean;
  resolveThemeValue: (expr: any, cssProperty?: string) => unknown;
  resolveThemeValueFromFn: (expr: any, cssProperty?: string) => unknown;
} {
  const { root, j, filePath, resolveValue, resolveValueDirectional, parseExpr, resolverImports } =
    args;

  const hasLocalThemeBinding = (() => {
    let found = false;
    root.find(j.VariableDeclarator, { id: { type: "Identifier", name: "theme" } }).forEach(() => {
      found = true;
    });
    root.find(j.FunctionDeclaration, { id: { type: "Identifier", name: "theme" } }).forEach(() => {
      found = true;
    });
    root.find(j.ImportSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    root.find(j.ImportDefaultSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    root.find(j.ImportNamespaceSpecifier, { local: { name: "theme" } } as any).forEach(() => {
      found = true;
    });
    return found;
  })();

  /**
   * Resolves a theme path to a parsed AST expression or a directional result.
   * Centralizes the resolve → directional check → import registration → parseExpr pipeline.
   */
  const resolveThemePath = (
    path: string,
    loc: { line: number; column: number } | undefined,
    cssProperty: string | undefined,
  ): unknown => {
    const ctx = { kind: "theme" as const, path, filePath, loc, cssProperty };
    const resolved = cssProperty ? resolveValueDirectional(ctx) : resolveValue(ctx);
    if (!resolved) {
      return null;
    }
    if (isDirectionalResult(resolved)) {
      return handleDirectionalResult(resolved, resolverImports, parseExpr);
    }
    for (const imp of resolved.imports ?? []) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    return parseExpr(resolved.expr);
  };

  const resolveThemeValue = (expr: any, cssProperty?: string): unknown => {
    if (hasLocalThemeBinding) {
      return null;
    }
    if (!expr || typeof expr !== "object") {
      return null;
    }
    const parts = getMemberPathFromIdentifier(expr, "theme");
    if (!parts || !parts.length) {
      return null;
    }
    return resolveThemePath(parts.join("."), getNodeLocStart(expr) ?? undefined, cssProperty);
  };

  const resolveThemeValueFromFn = (expr: any, cssProperty?: string): unknown => {
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return null;
    }
    const bodyExpr = getFunctionBodyExpr(expr);
    if (!bodyExpr) {
      return null;
    }
    // Detect logical fallback patterns: `props.theme.X ?? "default"` / `|| "default"`.
    // The fallback is preserved so users can review and delete it if not needed.
    const unwrappedTheme = unwrapLogicalFallback(bodyExpr);
    const themeAccessExpr = unwrappedTheme ?? bodyExpr;
    const direct = resolveThemeValue(themeAccessExpr, cssProperty);
    if (direct) {
      // Directional results should not be wrapped with logical fallback
      if (isDirectionalThemeResult(direct)) {
        return direct;
      }
      return wrapWithLogicalFallback(direct, bodyExpr, j);
    }
    const paramName =
      expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
    const unwrap = (node: any): any => {
      let cur = node;
      while (cur) {
        if (cur.type === "ParenthesizedExpression") {
          cur = cur.expression;
          continue;
        }
        if (cur.type === "TSAsExpression" || cur.type === "TSNonNullExpression") {
          cur = cur.expression;
          continue;
        }
        if (cur.type === "ChainExpression") {
          cur = cur.expression;
          continue;
        }
        break;
      }
      return cur;
    };
    const unwrapped = unwrap(themeAccessExpr);
    if (
      !unwrapped ||
      (unwrapped.type !== "MemberExpression" && unwrapped.type !== "OptionalMemberExpression")
    ) {
      return null;
    }
    let themePath: string | null = null;
    const directPath = getMemberPathFromIdentifier(unwrapped as any, "theme");
    if (directPath && directPath.length > 0) {
      themePath = directPath.join(".");
    } else if (paramName) {
      const paramPath = getMemberPathFromIdentifier(unwrapped as any, paramName);
      if (paramPath && paramPath[0] === "theme") {
        themePath = paramPath.slice(1).join(".");
      }
    }
    if (!themePath) {
      return null;
    }
    const resolved = resolveThemePath(
      themePath,
      getNodeLocStart(unwrapped) ?? undefined,
      cssProperty,
    );
    if (!resolved) {
      return null;
    }
    if (isDirectionalThemeResult(resolved)) {
      return resolved;
    }
    return wrapWithLogicalFallback(resolved, bodyExpr, j);
  };

  return { hasLocalThemeBinding, resolveThemeValue, resolveThemeValueFromFn };
}

// --- Non-exported helpers ---

/**
 * If `originalExpr` was a logical fallback (`X ?? "default"` / `X || "default"`),
 * wraps the resolved AST node in a LogicalExpression preserving the original
 * operator and fallback value.
 *
 * Returns null if the fallback (RHS) is not a static literal, because dynamic
 * references (e.g., `props.fallbackColor`) would be invalid in a static
 * `stylex.create()` context where `props` is not in scope.
 */
function wrapWithLogicalFallback(
  resolved: unknown,
  originalExpr: unknown,
  j: LowerRulesState["j"],
): unknown {
  if (
    !isLogicalExpressionNode(originalExpr) ||
    (originalExpr.operator !== "??" && originalExpr.operator !== "||")
  ) {
    return resolved;
  }
  // Only preserve fallback if RHS is a static value (string/number/boolean literal).
  // Dynamic references like `props.fallbackColor` are not valid in static StyleX output.
  if (literalToStaticValue(originalExpr.right) === null) {
    return null;
  }
  return j.logicalExpression(
    originalExpr.operator as "??" | "||",
    resolved as Parameters<typeof j.logicalExpression>[1],
    originalExpr.right as Parameters<typeof j.logicalExpression>[2],
  );
}

/**
 * Type guard for the internal `__directional` tagged result.
 */
export function isDirectionalThemeResult(value: unknown): value is DirectionalThemeResult {
  return (
    value !== null &&
    typeof value === "object" &&
    "__directional" in (value as Record<string, unknown>)
  );
}

/**
 * Converts a `ResolveValueDirectionalResult` from the adapter into the internal
 * `DirectionalThemeResult` format, registering imports along the way.
 */
function handleDirectionalResult(
  resolved: import("../../adapter.js").ResolveValueDirectionalResult,
  resolverImports: Map<string, import("../../adapter.js").ImportSpec>,
  parseExpr: (exprSource: string) => unknown,
): DirectionalThemeResult {
  const entries: Array<{ prop: string; expr: unknown }> = [];
  for (const entry of resolved.directional) {
    for (const imp of entry.imports) {
      resolverImports.set(JSON.stringify(imp), imp);
    }
    entries.push({ prop: entry.prop, expr: parseExpr(entry.expr) });
  }
  return { __directional: entries };
}
