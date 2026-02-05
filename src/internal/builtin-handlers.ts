/**
 * Built-in resolution handlers for dynamic interpolations.
 * Core concepts: adapter hooks, conditional splitting, and StyleX emission.
 */
import {
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isArrowFunctionExpression,
  isCallExpressionNode,
  isLogicalExpressionNode,
  resolveIdentifierToPropName,
} from "./utilities/jscodeshift-utils.js";
import { sanitizeIdentifier } from "./utilities/string-utils.js";
import { hasThemeAccessInArrowFn } from "./lower-rules/inline-styles.js";
import { styleFromSingleDeclaration } from "./builtin-handlers/css-parsing.js";
import {
  buildResolvedHandlerResult,
  buildUnresolvedHelperResult,
  getArrowFnThemeParamInfo,
  resolveImportedHelperCall,
  tryResolveCallExpression,
} from "./builtin-handlers/resolver-utils.js";
import {
  tryResolveConditionalCssBlock,
  tryResolveConditionalCssBlockTernary,
  tryResolveConditionalValue,
  tryResolveIndexedThemeWithPropFallback,
} from "./builtin-handlers/conditionals.js";
import type {
  ConditionalExpressionBody,
  DynamicNode,
  HandlerResult,
  InternalHandlerContext,
} from "./builtin-handlers/types.js";

// Re-export InternalHandlerContext so existing consumers don't need to change import paths
export type { InternalHandlerContext } from "./builtin-handlers/types.js";

/**
 * Internal dynamic resolution pipeline.
 * Order matters: more-specific transforms first, then fall back to prop-access emission.
 */
export function resolveDynamicNode(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  return (
    tryResolveThemeAccess(node, ctx) ??
    tryResolveCallExpression(node, ctx) ??
    tryResolveArrowFnHelperCallWithThemeArg(node, ctx) ??
    tryResolveConditionalValue(node, ctx) ??
    tryResolveIndexedThemeWithPropFallback(node, ctx) ??
    tryResolveConditionalCssBlockTernary(node) ??
    tryResolveConditionalCssBlock(node, ctx) ??
    tryResolveArrowFnCallWithSinglePropArg(node) ??
    // Detect theme-dependent template literals before trying to emit style functions
    tryResolveThemeDependentTemplateLiteral(node) ??
    tryResolveStyleFunctionFromTemplateLiteral(node) ??
    tryResolveInlineStyleValueForNestedPropAccess(node) ??
    tryResolvePropAccess(node) ??
    tryResolveInlineStyleValueForConditionalExpression(node) ??
    tryResolveInlineStyleValueForLogicalExpression(node) ??
    tryResolveInlineStyleValueFromArrowFn(node)
  );
}

// --- Non-exported handler functions ---

function tryResolveThemeAccess(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const info = getArrowFnThemeParamInfo(expr);
  if (!info) {
    return null;
  }
  const body = expr.body;
  if (body.type !== "MemberExpression") {
    return null;
  }
  const path = (() => {
    if (info.kind === "propsParam") {
      const parts = getMemberPathFromIdentifier(body, info.propsName);
      if (!parts || parts[0] !== "theme") {
        return null;
      }
      return parts.slice(1).join(".");
    }
    const parts = getMemberPathFromIdentifier(body, info.themeName);
    if (!parts) {
      return null;
    }
    return parts.join(".");
  })();
  if (!path) {
    return null;
  }

  const res = ctx.resolveValue({
    kind: "theme",
    path,
    filePath: ctx.filePath,
    loc: getNodeLocStart(body) ?? undefined,
  });
  if (!res) {
    return null;
  }
  return { type: "resolvedValue", expr: res.expr, imports: res.imports };
}

function tryResolveArrowFnHelperCallWithThemeArg(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr: any = node.expr as any;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const propsParamName = getArrowFnSingleParamName(expr);
  if (!propsParamName) {
    return null;
  }
  const body: any = expr.body as any;
  if (!isCallExpressionNode(body)) {
    return null;
  }
  const args = body.arguments ?? [];
  if (args.length !== 1) {
    return null;
  }
  const arg0 = args[0] as any;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return null;
  }
  const parts = getMemberPathFromIdentifier(arg0, propsParamName);
  if (!parts || parts[0] !== "theme" || parts.length <= 1) {
    return null;
  }

  const simple = resolveImportedHelperCall(body, ctx, propsParamName, node.css.property);
  if (simple.kind === "resolved") {
    return buildResolvedHandlerResult(simple.result, node.css.property, {
      resolveCallContext: simple.resolveCallContext,
      resolveCallResult: simple.resolveCallResult,
    });
  }

  if (simple.kind === "unresolved") {
    return buildUnresolvedHelperResult(body.callee, ctx);
  }

  return null;
}

function tryResolveArrowFnCallWithSinglePropArg(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr as any;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  const body = expr.body as any;
  if (!body || body.type !== "CallExpression") {
    return null;
  }
  // Only support: helper(props.foo)
  if (body.callee?.type !== "Identifier" || typeof body.callee.name !== "string") {
    return null;
  }
  const calleeIdent = body.callee.name as string;
  const args = body.arguments ?? [];
  if (args.length !== 1) {
    return null;
  }
  const arg0 = args[0] as any;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return null;
  }
  const path = getMemberPathFromIdentifier(arg0, paramName);
  const propName = path?.[0];
  if (!path || path.length !== 1 || !propName) {
    return null;
  }

  return {
    type: "emitStyleFunction",
    nameHint: `${sanitizeIdentifier(node.css.property)}FromProp`,
    params: "value: any",
    body: `{ ${Object.keys(styleFromSingleDeclaration(node.css.property, "value"))[0]}: value }`,
    call: propName,
    valueTransform: { kind: "call", calleeIdent },
  };
}

function tryResolveInlineStyleValueForConditionalExpression(
  node: DynamicNode,
): HandlerResult | null {
  // Conservative fallback for value expressions we can't safely resolve into StyleX
  // buckets/functions, but can preserve via a wrapper inline style.
  if (!node.css.property) {
    return null;
  }
  const expr: any = node.expr as any;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  // Use getFunctionBodyExpr to handle both expression-body and block-body arrow functions.
  // Block bodies with a single return statement (possibly with comments) are supported.
  const body = getFunctionBodyExpr(expr) as ConditionalExpressionBody | null;
  if (!body || body.type !== "ConditionalExpression") {
    return null;
  }
  // IMPORTANT: do not attempt to preserve `props.theme.* ? ... : ...` via inline styles.
  // StyleX output does not have `props.theme` at runtime (styled-components injects theme via context),
  // so this would produce incorrect output unless a project-specific hook (e.g. useTheme()) is wired in.
  //
  // Treat these as unsupported so the caller can bail and surface a warning.
  {
    const paramName = getArrowFnSingleParamName(expr);
    const test = body.test as any;
    const testPath =
      paramName && test?.type === "MemberExpression"
        ? getMemberPathFromIdentifier(test, paramName)
        : null;
    if (testPath && testPath[0] === "theme") {
      return {
        type: "keepOriginal",
        reason:
          "Theme-dependant call expression could not be resolved (e.g. theme helper calls like theme.highlight() are not supported)",
      };
    }
  }
  // IMPORTANT: boolean values in conditional branches are not valid CSS values.
  // In styled-components, falsy interpolations like `false` mean "omit this declaration",
  // so we should bail rather than emitting invalid CSS like `cursor: false`.
  {
    const consType = (body.consequent as { type?: string } | undefined)?.type;
    const altType = (body.alternate as { type?: string } | undefined)?.type;
    if (consType === "BooleanLiteral" || altType === "BooleanLiteral") {
      return null;
    }
    // Also check estree-style Literal with boolean value
    if (consType === "Literal") {
      const v = (body.consequent as { value?: unknown }).value;
      if (typeof v === "boolean") {
        return null;
      }
    }
    if (altType === "Literal") {
      const v = (body.alternate as { value?: unknown }).value;
      if (typeof v === "boolean") {
        return null;
      }
    }
  }
  // Signal to the caller that we can preserve this declaration as an inline style
  // by calling the function with `props`.
  return { type: "emitInlineStyleValueFromProps" };
}

function tryResolveInlineStyleValueForLogicalExpression(node: DynamicNode): HandlerResult | null {
  // Conservative fallback for logical expressions (e.g., props.$delay ?? 0)
  // that we can preserve via a wrapper inline style.
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const body = getFunctionBodyExpr(expr);
  if (!isLogicalExpressionNode(body)) {
    return null;
  }
  // Only handle nullish coalescing (??) and logical OR (||) operators
  if (body.operator !== "??" && body.operator !== "||") {
    return null;
  }
  // IMPORTANT: do not attempt to preserve `props.theme.*` via inline styles.
  const paramName = getArrowFnSingleParamName(expr);
  const leftType = (body.left as { type?: string }).type;
  const leftPath =
    paramName && leftType === "MemberExpression"
      ? getMemberPathFromIdentifier(body.left, paramName)
      : null;
  if (leftPath && leftPath[0] === "theme") {
    return {
      type: "keepOriginal",
      reason:
        "Theme value with fallback (props.theme.X ?? / || default) cannot be resolved statically — use adapter.resolveValue to map theme paths to StyleX tokens",
    };
  }
  // Signal to the caller that we can preserve this declaration as an inline style
  return { type: "emitInlineStyleValueFromProps" };
}

function tryResolveThemeDependentTemplateLiteral(node: DynamicNode): HandlerResult | null {
  // Detect theme-dependent template literals and return keepOriginal with a warning.
  // This catches cases like: ${props => `${props.theme.color.bg}px`}
  // StyleX output does not have `props.theme` at runtime.
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const body = getFunctionBodyExpr(expr);
  if (!body || (body as { type?: string }).type !== "TemplateLiteral") {
    return null;
  }
  // Use existing utility to check for theme access
  if (hasThemeAccessInArrowFn(expr)) {
    return {
      type: "keepOriginal",
      reason:
        "Theme-dependent template literals require a project-specific theme source (e.g. useTheme())",
    };
  }
  return null;
}

function tryResolveStyleFunctionFromTemplateLiteral(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  const body = getFunctionBodyExpr(expr) as {
    type?: string;
    expressions?: unknown[];
  } | null;
  if (!body || body.type !== "TemplateLiteral") {
    return null;
  }
  const expressions = body.expressions ?? [];
  if (expressions.length === 0) {
    return null;
  }
  const { hasUsableProps, hasNonTransientProps, props } = (() => {
    const seen = new Set<string>();
    const props: string[] = [];
    const addProp = (name: string): void => {
      if (seen.has(name)) {
        return;
      }
      seen.add(name);
      props.push(name);
    };
    const visit = (node: unknown): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          visit(child);
        }
        return;
      }
      const n = node as { type?: string };
      if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
        const path = getMemberPathFromIdentifier(node as any, paramName);
        const firstPathPart = path?.[0];
        if (path && path.length > 0 && firstPathPart) {
          addProp(firstPathPart);
          // Keep walking to collect other props.
        }
      }
      for (const key of Object.keys(n)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as Record<string, unknown>)[key];
        visit(child);
      }
    };
    for (const expr of expressions) {
      visit(expr);
    }
    return {
      hasUsableProps: props.length > 0,
      hasNonTransientProps: props.some((name) => !name.startsWith("$")),
      props,
    };
  })();
  if (!hasUsableProps) {
    return null;
  }
  // For non-transient props: if shouldForwardProp is configured, let the fallback in
  // lower-rules.ts handle it (creates style functions that take props as argument).
  // Otherwise, emit style functions here.
  if (hasNonTransientProps && node.component.withConfig?.shouldForwardProp) {
    return null;
  }
  return { type: "emitStyleFunctionFromPropsObject", props };
}

function tryResolveInlineStyleValueForNestedPropAccess(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  if (expr.body.type !== "MemberExpression") {
    return null;
  }
  const path = getMemberPathFromIdentifier(expr.body, paramName);
  if (!path || path.length <= 1) {
    return null;
  }
  // IMPORTANT: do not attempt to preserve `props.theme.*` via inline styles.
  // StyleX output does not have `props.theme` at runtime (styled-components injects theme via context),
  // so this would produce incorrect output unless a project-specific hook (e.g. useTheme()) is wired in.
  if (path[0] === "theme") {
    return {
      type: "keepOriginal",
      reason:
        "Theme-dependent nested prop access requires a project-specific theme source (e.g. useTheme())",
    };
  }
  return { type: "emitInlineStyleValueFromProps" };
}

function tryResolveInlineStyleValueFromArrowFn(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const hasMediaAtRule = (node.css.atRuleStack ?? []).some((rule) => rule.startsWith("@media"));
  const isMediaSelector = (node.css.selector ?? "").trim().startsWith("@media");
  if (!hasMediaAtRule && !isMediaSelector) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const body = getFunctionBodyExpr(expr);
  if (!body) {
    return null;
  }
  return { type: "emitInlineStyleValueFromProps" };
}

/**
 * Handles simple prop access patterns in interpolations.
 *
 * Supports both simple params and destructured params:
 * - `(props) => props.color` -> simple param with member access
 * - `({ color }) => color` -> shorthand destructuring
 * - `({ color: color_ }) => color_` -> renamed destructuring
 * - `({ color = "red" }) => color` -> destructuring with default (emits static base + dynamic override)
 *
 * Note: Destructured param support is currently limited to this handler.
 * Other handlers (theme access, conditionals, etc.) only support simple params.
 */
function tryResolvePropAccess(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }

  const bindings = getArrowFnParamBindings(expr);
  if (!bindings) {
    return null;
  }

  let propName: string | null = null;
  let defaultValue: unknown = null;

  if (bindings.kind === "simple") {
    // Original logic: (props) => props.color
    if (expr.body.type !== "MemberExpression") {
      return null;
    }
    const path = getMemberPathFromIdentifier(expr.body, bindings.paramName);
    if (!path || path.length !== 1) {
      return null;
    }
    propName = path[0]!;
  } else {
    // New logic: ({ color: color_ }) => color_
    // Body must be a direct identifier reference
    propName = resolveIdentifierToPropName(expr.body, bindings);
    if (!propName) {
      return null;
    }
    // Check if this prop has a default value
    if (bindings.defaults) {
      defaultValue = bindings.defaults.get(propName) ?? null;
    }
  }

  const cssProp = node.css.property;
  const nameHint = `${sanitizeIdentifier(cssProp)}FromProp`;

  // If there's a default value, emit both static base style and dynamic override
  if (defaultValue !== null) {
    return {
      type: "emitStyleFunctionWithDefault",
      nameHint,
      params: "value: string",
      body: `{ ${Object.keys(styleFromSingleDeclaration(cssProp, "value"))[0]}: value }`,
      call: propName,
      defaultValue,
    };
  }

  return {
    type: "emitStyleFunction",
    nameHint,
    params: "value: string",
    body: `{ ${Object.keys(styleFromSingleDeclaration(cssProp, "value"))[0]}: value }`,
    call: propName,
  };
}
