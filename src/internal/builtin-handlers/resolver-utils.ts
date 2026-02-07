/**
 * Adapter resolution utilities for the built-in handler system.
 * Core concepts: theme member resolution, helper call dispatch, and template literal interpolation.
 */
import type { CallResolveContext, CallResolveResult, ImportSpec } from "../../adapter.js";
import {
  type CallExpressionNode,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isCallExpressionNode,
} from "../utilities/jscodeshift-utils.js";
import type {
  DynamicNode,
  HandlerResult,
  InternalHandlerContext,
  ResolveImportedHelperCallResult,
  ThemeParamInfo,
} from "./types.js";

// --- Exports (public API for other builtin-handler modules) ---

/**
 * Determines if an adapter's CallResolveResult should be treated as a CSS value.
 *
 * Resolution priority:
 * 1. Adapter's explicit `usage` field takes precedence
 * 2. Otherwise, infer from context: cssProperty present -> CSS value, absent -> StyleX reference
 */
export function isAdapterResultCssValue(result: CallResolveResult, cssProperty?: string): boolean {
  return result.usage === "create" || (result.usage === undefined && Boolean(cssProperty));
}

/**
 * Builds a HandlerResult from an adapter's resolved call expression.
 *
 * Returns "resolvedValue" for CSS values (to be used in stylex.create property values)
 * or "resolvedStyles" for StyleX references (to be used in stylex.props arguments).
 */
export function buildResolvedHandlerResult(
  result: CallResolveResult,
  cssProperty: string | undefined,
  payload: { resolveCallContext: CallResolveContext; resolveCallResult: CallResolveResult },
): HandlerResult {
  const isCssValue = isAdapterResultCssValue(result, cssProperty);
  return isCssValue
    ? {
        type: "resolvedValue",
        expr: result.expr,
        imports: result.imports,
        ...payload,
      }
    : {
        type: "resolvedStyles",
        expr: result.expr,
        imports: result.imports,
        style: result.style,
        ...payload,
      };
}

/**
 * Builds a "keepOriginal" HandlerResult for when the adapter returns undefined for a helper call.
 * Resolves the import name for better error context.
 */
export function buildUnresolvedHelperResult(
  callee: unknown,
  ctx: InternalHandlerContext,
): HandlerResult {
  const calleeIdent = getCalleeIdentName(callee);
  const imp = typeof calleeIdent === "string" ? ctx.resolveImport(calleeIdent, callee) : null;
  const importedName = imp?.importedName ?? calleeIdent ?? "unknown";
  return {
    type: "keepOriginal",
    reason: `Adapter resolveCall returned undefined for helper call`,
    context: { importedName },
  };
}

export function getArrowFnThemeParamInfo(fn: any): ThemeParamInfo | null {
  if (!fn || fn.params?.length !== 1) {
    return null;
  }
  const p = fn.params[0];
  if (p?.type === "Identifier" && typeof p.name === "string") {
    return { kind: "propsParam", propsName: p.name };
  }
  if (p?.type !== "ObjectPattern" || !Array.isArray(p.properties)) {
    return null;
  }
  for (const prop of p.properties) {
    if (!prop || (prop.type !== "Property" && prop.type !== "ObjectProperty")) {
      continue;
    }
    const key = prop.key;
    if (!key || key.type !== "Identifier" || key.name !== "theme") {
      continue;
    }
    const value = prop.value;
    if (value?.type === "Identifier" && typeof value.name === "string") {
      return { kind: "themeBinding", themeName: value.name };
    }
    if (
      value?.type === "AssignmentPattern" &&
      value.left?.type === "Identifier" &&
      typeof value.left.name === "string"
    ) {
      return { kind: "themeBinding", themeName: value.left.name };
    }
  }
  return null;
}

/**
 * Shared helper to resolve a template literal with interpolated expressions.
 *
 * @param node - The AST node to check (must be a TemplateLiteral)
 * @param resolveExpr - Callback to resolve each interpolated expression.
 *                      Returns { expr, imports } on success, null to bail.
 * @returns The resolved template literal expression string and merged imports, or null if resolution fails.
 */
export function resolveTemplateLiteralExpressions(
  node: unknown,
  resolveExpr: (expr: unknown) => { expr: string; imports: ImportSpec[] } | null,
): { expr: string; imports: ImportSpec[] } | null {
  if (!node || typeof node !== "object" || (node as { type?: string }).type !== "TemplateLiteral") {
    return null;
  }

  const tl = node as {
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
  };
  const expressions = tl.expressions ?? [];
  const quasis = tl.quasis ?? [];

  // Must have at least one expression (otherwise literalToStaticValue would have handled it)
  if (expressions.length === 0) {
    return null;
  }

  // Resolve all expressions using the provided callback
  const resolvedExprs: Array<{ expr: string; imports: ImportSpec[] }> = [];
  for (const expr of expressions) {
    const resolved = resolveExpr(expr);
    if (!resolved) {
      return null;
    }
    resolvedExprs.push(resolved);
  }

  // Build the template literal expression string
  // quasis and expressions interleave: quasi0 ${expr0} quasi1 ${expr1} quasi2
  const parts: string[] = [];
  for (let i = 0; i < quasis.length; i++) {
    const quasi = quasis[i];
    const raw = quasi?.value?.raw ?? quasi?.value?.cooked ?? "";
    parts.push(raw);
    const resolvedExpr = resolvedExprs[i];
    if (i < resolvedExprs.length && resolvedExpr) {
      parts.push("${" + resolvedExpr.expr + "}");
    }
  }

  // Merge all imports
  const allImports: ImportSpec[] = [];
  for (const r of resolvedExprs) {
    allImports.push(...r.imports);
  }

  // Simplify trivial template literals: `${expr}` → expr
  // Avoids TS2731 when expr is a symbol type (e.g. StyleXVar<string>)
  if (
    resolvedExprs.length === 1 &&
    quasis.every((q) => !(q?.value?.raw ?? "") && !(q?.value?.cooked ?? ""))
  ) {
    return {
      expr: resolvedExprs[0]!.expr,
      imports: allImports,
    };
  }

  return {
    expr: "`" + parts.join("") + "`",
    imports: allImports,
  };
}

/**
 * Resolves a template literal with theme interpolations.
 * Handles patterns like: `inset 0 0 0 1px ${props.theme.color.primaryColor}`
 *
 * Returns the resolved template literal expression string and required imports,
 * or null if the template cannot be resolved (e.g., contains non-theme expressions).
 */
export function resolveTemplateLiteralWithTheme(
  node: unknown,
  paramName: string,
  ctx: InternalHandlerContext,
): { expr: string; imports: ImportSpec[] } | null {
  return resolveTemplateLiteralExpressions(node, (expr) => {
    // Check if expression is a theme member access: props.theme.xxx
    if (
      !expr ||
      typeof expr !== "object" ||
      (expr as { type?: string }).type !== "MemberExpression"
    ) {
      return null;
    }
    const parts = getMemberPathFromIdentifier(
      expr as Parameters<typeof getMemberPathFromIdentifier>[0],
      paramName,
    );
    if (!parts || parts[0] !== "theme" || parts.length <= 1) {
      return null;
    }
    const themePath = parts.slice(1).join(".");

    const res = ctx.resolveValue({
      kind: "theme",
      path: themePath,
      filePath: ctx.filePath,
      loc: getNodeLocStart(expr) ?? undefined,
    });
    return res ?? null;
  });
}

/**
 * Extract indexed theme lookup info from a computed member expression like:
 *   props.theme.color[props.textColor]
 * Returns the theme object path (e.g., "color") and the index prop name if valid.
 */
export function extractIndexedThemeLookupInfo(
  node: unknown,
  paramName: string,
): { themeObjectPath: string; indexPropName: string } | null {
  const n = node as { type?: string; computed?: boolean; object?: unknown; property?: unknown };
  if (!n || n.type !== "MemberExpression" || n.computed !== true) {
    return null;
  }

  // Extract index prop name from the computed property
  const p = n.property as { type?: string; name?: string };
  let indexPropName: string | null = null;

  if (p?.type === "Identifier" && typeof p.name === "string") {
    // Simple identifier: props.theme.color[textColor] (unusual but possible)
    indexPropName = p.name;
  } else if (p?.type === "MemberExpression") {
    // Member expression: props.theme.color[props.textColor]
    const path = getMemberPathFromIdentifier(p as any, paramName);
    const firstPathPart = path?.[0];
    if (path && path.length === 1 && firstPathPart) {
      indexPropName = firstPathPart;
    }
  }

  if (!indexPropName) {
    return null;
  }

  // Extract theme object path from the base object (e.g., props.theme.color -> "color")
  const obj = n.object as { type?: string };
  if (!obj || obj.type !== "MemberExpression") {
    return null;
  }
  const parts = getMemberPathFromIdentifier(obj as any, paramName);
  if (!parts || parts.length < 2 || parts[0] !== "theme") {
    return null;
  }
  const themeObjectPath = parts.slice(1).join(".");

  return { themeObjectPath, indexPropName };
}

export function resolveImportedHelperCall(
  callExpr: CallExpressionNode,
  ctx: InternalHandlerContext,
  propsParamName?: string,
  cssProperty?: string,
): ResolveImportedHelperCallResult {
  const callee = callExpr.callee;
  if (!callee || typeof callee !== "object") {
    return { kind: "keepOriginal" };
  }
  const calleeType = (callee as { type?: string }).type;
  if (calleeType !== "Identifier") {
    return { kind: "keepOriginal" };
  }
  const calleeIdent = (callee as { name?: string }).name;
  if (typeof calleeIdent !== "string") {
    return { kind: "keepOriginal" };
  }
  const imp = ctx.resolveImport(calleeIdent, callee);
  const calleeImportedName = imp?.importedName;
  const calleeSource = imp?.source;
  if (!calleeImportedName || !calleeSource) {
    return { kind: "keepOriginal" };
  }
  const args = callArgsFromNode(callExpr.arguments, propsParamName);
  const loc = callExpr.loc?.start;
  const resolveCallContext: CallResolveContext = {
    callSiteFilePath: ctx.filePath,
    calleeImportedName,
    calleeSource,
    args,
    ...(loc ? { loc: { line: loc.line, column: loc.column } } : {}),
    ...(cssProperty ? { cssProperty } : {}),
  };
  const res = ctx.resolveCall(resolveCallContext);
  return res
    ? {
        kind: "resolved",
        result: res,
        resolveCallContext,
        resolveCallResult: res,
      }
    : { kind: "unresolved", resolveCallContext, resolveCallResult: undefined };
}

/**
 * Resolves a DynamicNode whose expression is a direct (non-arrow) call expression.
 * Handles both simple `helper(...)` and curried `helper(...)(props)` patterns.
 */
export function tryResolveCallExpression(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isCallExpressionNode(expr)) {
    return null;
  }

  const simple = resolveImportedHelperCall(expr, ctx, undefined, node.css.property);
  if (simple.kind === "resolved") {
    return buildResolvedHandlerResult(simple.result, node.css.property, {
      resolveCallContext: simple.resolveCallContext,
      resolveCallResult: simple.resolveCallResult,
    });
  }

  // Support helper calls that return a function which is immediately invoked with the props param:
  //   helper("key")(props)
  // The adapter receives cssProperty context and decides what to return:
  // - With CSS property context: returns a CSS value expression
  // - Without CSS property context: returns a StyleX style reference
  if (isCallExpressionNode(expr.callee)) {
    const outerArgs = expr.arguments ?? [];
    if (outerArgs.length === 1) {
      const innerCall = expr.callee;
      const innerRes = resolveImportedHelperCall(innerCall, ctx, undefined, node.css.property);
      if (innerRes.kind === "resolved") {
        return buildResolvedHandlerResult(innerRes.result, node.css.property, {
          resolveCallContext: innerRes.resolveCallContext,
          resolveCallResult: innerRes.resolveCallResult,
        });
      }
    }
  }

  if (simple.kind === "unresolved") {
    return buildUnresolvedHelperResult(expr.callee, ctx);
  }

  // For shadowed imports (import exists but is overridden by a local variable in a nested scope),
  // we must use inline styles because StyleX styles are at module level and can't access
  // the shadowed local function. Emit as inline style to preserve the local function call.
  if (simple.kind === "keepOriginal" && node.css.property) {
    const calleeIdent = getCalleeIdentName(expr.callee);
    if (typeof calleeIdent === "string" && ctx.hasImportIgnoringShadowing?.(calleeIdent)) {
      return { type: "emitInlineStyleValueFromProps" };
    }
  }

  // If we got here, it's a call expression we don't understand.
  return {
    type: "keepOriginal",
    reason:
      "Unsupported call expression (expected imported helper(...) or imported helper(...)(...))",
  };
}

// --- Non-exported helpers ---

/**
 * Extracts the identifier name from a call expression's callee.
 * Returns null if the callee is not a simple identifier.
 */
function getCalleeIdentName(callee: unknown): string | null {
  if (!callee || typeof callee !== "object") {
    return null;
  }
  if ((callee as { type?: string }).type !== "Identifier") {
    return null;
  }
  return (callee as { name?: string }).name ?? null;
}

function callArgFromNode(
  node: unknown,
  propsParamName?: string,
): CallResolveContext["args"][number] {
  if (!node || typeof node !== "object") {
    return { kind: "unknown" };
  }
  const type = (node as { type?: string }).type;
  if (type === "MemberExpression" && typeof propsParamName === "string" && propsParamName) {
    const parts = getMemberPathFromIdentifier(node as any, propsParamName);
    if (parts && parts[0] === "theme" && parts.length > 1) {
      return { kind: "theme", path: parts.slice(1).join(".") };
    }
  }
  if (type === "StringLiteral") {
    return { kind: "literal", value: (node as { value: string }).value };
  }
  if (type === "NumericLiteral") {
    return { kind: "literal", value: (node as { value: number }).value };
  }
  if (type === "BooleanLiteral") {
    return { kind: "literal", value: (node as { value: boolean }).value };
  }
  if (type === "NullLiteral") {
    return { kind: "literal", value: null };
  }
  if (type === "Literal") {
    const v = (node as { value?: unknown }).value;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) {
      return { kind: "literal", value: v };
    }
  }
  return { kind: "unknown" };
}

function callArgsFromNode(args: unknown, propsParamName?: string): CallResolveContext["args"] {
  if (!Array.isArray(args)) {
    return [];
  }
  return args.map((arg) => callArgFromNode(arg, propsParamName));
}
