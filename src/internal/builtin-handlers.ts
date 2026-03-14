/**
 * Built-in resolution handlers for dynamic interpolations.
 * Core concepts: adapter hooks, conditional splitting, and StyleX emission.
 */
import { type CallResolveContext, type ImportSpec, isDirectionalResult } from "../adapter.js";
import {
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  getSinglePropFromMemberExpr,
  isArrowFunctionExpression,
  isCallExpressionNode,
  hasNonLiteralLogicalFallback,
  isLogicalExpressionNode,
  literalToStaticValue,
  resolveIdentifierToPropName,
  unwrapLogicalFallback,
} from "./utilities/jscodeshift-utils.js";
import { sanitizeIdentifier } from "./utilities/string-utils.js";
import { hasThemeAccessInArrowFn } from "./lower-rules/inline-styles.js";
import { isMemberExpression, isSupportedAtRule } from "./lower-rules/utils.js";
import { styleFromSingleDeclaration } from "./builtin-handlers/css-parsing.js";
import {
  buildResolvedHandlerResult,
  buildUnresolvedHelperResult,
  getArrowFnThemeParamInfo,
  isAdapterResultCssValue,
  resolveImportedHelperCall,
  resolveTemplateLiteralWithTheme,
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
    tryResolveArrowFnCallWithConditionalArgs(node, ctx) ??
    tryResolveConditionalValue(node, ctx) ??
    tryResolveIndexedThemeWithPropFallback(node, ctx) ??
    tryResolveConditionalCssBlockTernary(node, ctx) ??
    tryResolveConditionalCssBlock(node, ctx) ??
    tryResolveArrowFnCallWithSinglePropArg(node, ctx) ??
    // Resolve or detect theme-dependent template literals before trying to emit style functions
    tryResolveThemeDependentTemplateLiteral(node, ctx) ??
    tryResolveStyleFunctionFromTemplateLiteral(node) ??
    tryResolveInlineStyleValueForNestedPropAccess(node) ??
    tryResolvePropAccess(node) ??
    tryResolveConditionalPropStyleFunction(node) ??
    tryResolveArrowFnPropExpression(node) ??
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
  // Extract the theme member expression from the body.
  // Handles both direct member access (`props.theme.X`) and logical fallback
  // patterns (`props.theme.X ?? "default"` / `props.theme.X || "default"`).
  const themeExpr = extractThemeMemberExpression(expr.body);
  if (!themeExpr) {
    return null;
  }
  const path = extractThemePath(themeExpr, info);
  if (!path) {
    return null;
  }

  const cssProperty = node.css.property;
  // Use directional-aware resolver when a CSS property is available,
  // so the adapter can return directional results for shorthand properties.
  const res = cssProperty
    ? ctx.resolveValueDirectional({
        kind: "theme",
        path,
        filePath: ctx.filePath,
        loc: getNodeLocStart(themeExpr) ?? undefined,
        cssProperty,
      })
    : ctx.resolveValue({
        kind: "theme",
        path,
        filePath: ctx.filePath,
        loc: getNodeLocStart(themeExpr) ?? undefined,
      });
  if (!res) {
    return null;
  }
  // Handle directional results: return a special result that the caller
  // can use to emit multiple longhand properties instead of a single shorthand.
  if (isDirectionalResult(res)) {
    return {
      type: "resolvedDirectional",
      directional: res.directional,
    };
  }
  // The adapter resolved the theme path to a concrete StyleX token expression
  // (e.g., `$colors.labelBase`). StyleX `defineVars` tokens always resolve at
  // runtime, so literal fallbacks (`?? "default"`) are unnecessary and dropped.
  // However, non-literal fallbacks (e.g., `?? props.fallbackColor`) reference
  // runtime values the user depends on — bail so a downstream handler can emit
  // keepOriginal or an inline style instead of silently dropping them.
  if (hasNonLiteralLogicalFallback(expr.body)) {
    return null;
  }
  return { type: "resolvedValue", expr: res.expr, imports: res.imports };
}

/**
 * Extracts the theme member expression from an arrow function body.
 *
 * Supports:
 * - Direct: `props.theme.color.labelBase` (MemberExpression)
 * - Logical fallback: `props.theme.color.labelBase ?? "black"` or `|| "default"`
 *   (LogicalExpression with `??` or `||` and theme access on the left)
 *
 * Returns the MemberExpression node, or null if the pattern doesn't match.
 * The fallback (right side of `??`/`||`) is dropped because StyleX `defineVars`
 * tokens always resolve at runtime.
 */
function extractThemeMemberExpression(body: unknown): { type: "MemberExpression" } | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  // Try unwrapping logical fallback (e.g., `theme.X ?? "default"`)
  const unwrapped = unwrapLogicalFallback(body);
  if (unwrapped && (unwrapped as { type?: string }).type === "MemberExpression") {
    return unwrapped as { type: "MemberExpression" };
  }
  // Direct member expression
  if ((body as { type?: string }).type === "MemberExpression") {
    return body as { type: "MemberExpression" };
  }
  return null;
}

/**
 * Extracts the theme path (e.g., "color.labelBase") from a member expression,
 * accounting for whether the arrow function uses `props.theme.X` or `{ theme }` destructuring.
 */
function extractThemePath(
  memberExpr: { type: "MemberExpression" },
  info: ReturnType<typeof getArrowFnThemeParamInfo> & {},
): string | null {
  // getMemberPathFromIdentifier performs duck-typed AST traversal; the runtime
  // type check in extractThemeMemberExpression guarantees this is a MemberExpression.
  const exprAsAny = memberExpr as Parameters<typeof getMemberPathFromIdentifier>[0];
  if (info.kind === "propsParam") {
    const parts = getMemberPathFromIdentifier(exprAsAny, info.propsName);
    if (!parts || parts[0] !== "theme") {
      return null;
    }
    return parts.slice(1).join(".");
  }
  const parts = getMemberPathFromIdentifier(exprAsAny, info.themeName);
  if (!parts) {
    return null;
  }
  return parts.join(".");
}

function tryResolveArrowFnHelperCallWithThemeArg(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }

  // Support both (props) => ... and ({ theme }) => ...
  const info = getArrowFnThemeParamInfo(expr);
  if (!info) {
    return null;
  }

  // Use getFunctionBodyExpr to also handle block-body arrows with single return
  const body = getFunctionBodyExpr(expr);
  if (!isCallExpressionNode(body)) {
    return null;
  }
  const args = body.arguments ?? [];
  if (args.length === 0) {
    return null;
  }

  // Determine param names based on parameter style
  const propsParamName = info.kind === "propsParam" ? info.propsName : undefined;
  const themeBindingName = info.kind === "themeBinding" ? info.themeName : undefined;

  // Verify at least one arg is a theme member access
  const hasThemeArg = args.some((arg: any) => {
    if (!arg || arg.type !== "MemberExpression") {
      return false;
    }
    if (propsParamName) {
      const parts = getMemberPathFromIdentifier(arg, propsParamName);
      return parts !== null && parts[0] === "theme" && parts.length > 1;
    }
    if (themeBindingName) {
      const parts = getMemberPathFromIdentifier(arg, themeBindingName);
      return parts !== null && parts.length > 0;
    }
    return false;
  });
  if (!hasThemeArg) {
    return null;
  }

  const simple = resolveImportedHelperCall(
    body,
    ctx,
    propsParamName,
    node.css.property,
    themeBindingName,
  );
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

/**
 * Handles arrow functions whose body is a call expression with one conditional argument.
 *
 * Pattern: `({ $oneLine }) => truncateMultiline($oneLine ? 1 : 2)`
 *
 * The conditional argument must have a prop-based test and literal branches.
 * All other arguments must be literals. Each branch is resolved independently
 * via the adapter's resolveCall, and the result is split into conditional variants.
 */
function tryResolveArrowFnCallWithConditionalArgs(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }

  const body = getFunctionBodyExpr(expr);
  if (!isCallExpressionNode(body)) {
    return null;
  }

  const callee = body.callee as { type?: string; name?: string } | undefined;
  if (!callee || callee.type !== "Identifier" || typeof callee.name !== "string") {
    return null;
  }
  const calleeIdent = callee.name;

  const bindings = getArrowFnParamBindings(expr);
  if (!bindings) {
    return null;
  }

  // Inspect arguments: exactly one must be a ConditionalExpression with
  // a prop-based test and literal branches; remaining args must be literals.
  const args = body.arguments ?? [];
  if (args.length === 0) {
    return null;
  }

  let conditionalArgIndex = -1;
  let propName: string | null = null;
  let consequentValue: StaticLiteralValue | undefined;
  let alternateValue: StaticLiteralValue | undefined;
  let conditionalDefaultTruthy: boolean | null = null;
  // Pre-resolved static values for non-conditional args (avoids callArgFromNode mismatch
  // with literalToStaticValue, which handles TemplateLiterals/TaggedTemplateExpressions/etc.)
  const staticArgValues = new Map<number, StaticLiteralValue>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as
      | { type?: string; test?: unknown; consequent?: unknown; alternate?: unknown }
      | undefined;
    if (!arg) {
      continue;
    }

    if (arg.type === "ConditionalExpression") {
      // Only one conditional arg is supported
      if (conditionalArgIndex !== -1) {
        return null;
      }
      conditionalArgIndex = i;

      // Extract prop name from the conditional test
      propName = extractPropNameFromCondTest(arg.test, bindings);
      if (!propName) {
        return null;
      }

      // Bail if the conditional test depends on `theme` — styled-components theme
      // context is not a regular component prop and is unavailable after migration.
      if (propName === "theme") {
        return null;
      }

      // Support destructured defaults when we can statically determine their truthiness.
      // Destructuring defaults only apply when the prop is `undefined`, so we must
      // preserve that distinction in the emitted condition.
      if (
        bindings.kind === "destructured" &&
        bindings.defaults &&
        bindings.defaults.has(propName)
      ) {
        const defaultValue = extractStaticLiteralValue(bindings.defaults.get(propName));
        if (defaultValue === undefined) {
          return null;
        }
        conditionalDefaultTruthy = Boolean(defaultValue);
      }

      // Both branches must be static literals (use extractStaticLiteralValue
      // to distinguish null literals from extraction failure)
      consequentValue = extractStaticLiteralValue(arg.consequent);
      alternateValue = extractStaticLiteralValue(arg.alternate);
      if (consequentValue === undefined || alternateValue === undefined) {
        return null;
      }
    } else {
      // Non-conditional args must be static literals
      const v = extractStaticLiteralValue(arg);
      if (v === undefined) {
        return null;
      }
      staticArgValues.set(i, v);
    }
  }

  if (
    conditionalArgIndex === -1 ||
    !propName ||
    consequentValue === undefined ||
    alternateValue === undefined
  ) {
    return null;
  }

  // Resolve the callee's import
  const imp = ctx.resolveImport(calleeIdent, callee);
  if (!imp) {
    return null;
  }

  // Build a CallResolveContext for each branch, replacing the conditional arg
  // with the branch's literal value and using pre-resolved values for other args.
  const consValue = consequentValue;
  const altValue = alternateValue;
  const buildBranchContext = (branchValue: StaticLiteralValue): CallResolveContext => {
    const syntheticArgs: CallResolveContext["args"] = args.map((_arg, i) => {
      if (i === conditionalArgIndex) {
        return { kind: "literal" as const, value: branchValue };
      }
      const v = staticArgValues.get(i);
      return v !== undefined
        ? { kind: "literal" as const, value: v }
        : { kind: "unknown" as const };
    });

    const loc = body.loc?.start;
    return {
      callSiteFilePath: ctx.filePath,
      calleeImportedName: imp.importedName,
      calleeSource: imp.source,
      args: syntheticArgs,
      ...(loc ? { loc: { line: loc.line, column: loc.column } } : {}),
      ...(node.css.property ? { cssProperty: node.css.property } : {}),
    };
  };

  const consResult = ctx.resolveCall(buildBranchContext(consValue));
  if (!consResult) {
    return null;
  }

  const altResult = ctx.resolveCall(buildBranchContext(altValue));
  if (!altResult) {
    return null;
  }
  if (!("expr" in consResult) || !("expr" in altResult)) {
    return null;
  }

  // Both branches must agree on usage type
  const consIsCss = isAdapterResultCssValue(consResult, node.css.property);
  const altIsCss = isAdapterResultCssValue(altResult, node.css.property);
  if (consIsCss !== altIsCss) {
    return null;
  }

  const truthyWhen =
    conditionalDefaultTruthy === true ? `${propName} === undefined || ${propName}` : propName;
  const falsyWhen = conditionalDefaultTruthy === true ? `!(${truthyWhen})` : `!${propName}`;

  const variants = [
    { nameHint: "truthy", when: truthyWhen, expr: consResult.expr, imports: consResult.imports },
    {
      nameHint: "falsy",
      when: falsyWhen,
      expr: altResult.expr,
      imports: altResult.imports,
    },
  ];

  return consIsCss
    ? { type: "splitVariantsResolvedValue", variants }
    : { type: "splitVariantsResolvedStyles", variants };
}

type StaticLiteralValue = string | number | boolean | null;

/**
 * Extracts a static literal value from an AST node, distinguishing null literals
 * from extraction failure. Returns `undefined` when the node is not a recognized
 * static literal, and the actual value (including `null`) otherwise.
 */
function extractStaticLiteralValue(node: unknown): StaticLiteralValue | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const type = (node as { type?: string }).type;
  // Reject function-like nodes — literalToStaticValue coerces zero-arg arrows
  // to their body's value, but helper call arguments should not undergo that
  // transformation (the original code passes a function, not a primitive).
  if (type === "ArrowFunctionExpression" || type === "FunctionExpression") {
    return undefined;
  }
  // Handle NullLiteral and Literal-with-null-value explicitly since
  // literalToStaticValue uses null as its failure sentinel.
  if (type === "NullLiteral") {
    return null;
  }
  if (type === "Literal" && (node as { value?: unknown }).value === null) {
    return null;
  }
  const v = literalToStaticValue(node);
  return v !== null ? v : undefined;
}

/**
 * Extracts the prop name from a conditional expression's test node.
 *
 * Supports:
 * - Simple param: `props.$oneLine` → `$oneLine`
 * - Destructured param: `$oneLine` (identifier) → `$oneLine`
 */
function extractPropNameFromCondTest(
  test: unknown,
  bindings: ReturnType<typeof getArrowFnParamBindings>,
): string | null {
  if (!test || typeof test !== "object" || !bindings) {
    return null;
  }

  // Destructured params: resolveIdentifierToPropName handles the binding lookup
  const resolved = resolveIdentifierToPropName(test, bindings);
  if (resolved !== null) {
    return resolved;
  }

  if (bindings.kind === "simple") {
    const prop = getSinglePropFromMemberExpr(test, bindings.paramName);
    if (prop) {
      return prop;
    }
  }

  return null;
}

function tryResolveArrowFnCallWithSinglePropArg(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
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

  // Try to resolve the callee through the adapter so imports can be remapped
  const adapterResolution = tryResolveCalleeViaAdapter(calleeIdent, body.callee, node, ctx);

  return {
    type: "emitStyleFunction",
    nameHint: `${sanitizeIdentifier(node.css.property)}FromProp`,
    params: "value: any",
    body: `{ ${Object.keys(styleFromSingleDeclaration(node.css.property, "value"))[0]}: value }`,
    call: propName,
    valueTransform: {
      kind: "call",
      calleeIdent,
      ...adapterResolution,
    },
  };
}

/**
 * Attempts to resolve a callee identifier through the adapter's resolveCall hook.
 * Uses `resolveCallOptional` (non-bailing) so that an unhandled helper does NOT
 * trigger the global bail flag — the caller falls back to preserving the original call.
 * Returns resolved expression and imports if the adapter handles it,
 * or an empty object to fall back to preserving the original helper call.
 */
function tryResolveCalleeViaAdapter(
  calleeIdent: string,
  calleeNode: unknown,
  node: DynamicNode,
  ctx: InternalHandlerContext,
):
  | {
      resolvedExpr: string;
      resolvedImports: ImportSpec[];
      resolvedUsage?: "call" | "memberAccess";
    }
  | Record<string, never> {
  const resolveCall = ctx.resolveCallOptional;
  if (!resolveCall) {
    return {};
  }
  const imp = ctx.resolveImport(calleeIdent, calleeNode);
  if (!imp) {
    return {};
  }
  try {
    const result = resolveCall({
      callSiteFilePath: ctx.filePath,
      calleeImportedName: imp.importedName,
      calleeSource: imp.source,
      args: [{ kind: "unknown" }],
      cssProperty: node.css.property,
    });
    if (result && "expr" in result) {
      return {
        resolvedExpr: result.expr,
        resolvedImports: result.imports,
        ...(result.dynamicArgUsage ? { resolvedUsage: result.dynamicArgUsage } : {}),
      };
    }
  } catch {
    // Adapter threw — fall back to preserving the original call
  }
  return {};
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
  if (hasBooleanBranch(body.consequent) || hasBooleanBranch(body.alternate)) {
    return null;
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

function tryResolveThemeDependentTemplateLiteral(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  // Handles cases like: ${props => `${props.theme.color.bg}px`}
  // Tries to resolve theme interpolations via the adapter; bails if unresolvable.
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
  if (!hasThemeAccessInArrowFn(expr)) {
    return null;
  }
  // Try to resolve theme interpolations via the adapter
  const paramName = getArrowFnSingleParamName(expr);
  if (paramName) {
    const resolved = resolveTemplateLiteralWithTheme(body, paramName, ctx);
    if (resolved) {
      return { type: "resolvedValue", expr: resolved.expr, imports: resolved.imports };
    }
  }
  // Adapter couldn't resolve — bail with a warning
  return {
    type: "keepOriginal",
    reason:
      "Theme-dependent template literals require a project-specific theme source (e.g. useTheme())",
  };
}

/**
 * Walks AST nodes and collects prop names accessed via `paramName.X` member
 * expressions. Shared by template-literal and conditional prop style function handlers.
 */
function collectPropsFromExprTree(
  nodes: Iterable<unknown>,
  paramName: string,
): { hasUsableProps: boolean; hasNonTransientProps: boolean; props: string[] } {
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
    if (isMemberExpression(n)) {
      const path = getMemberPathFromIdentifier(node as any, paramName);
      const firstPathPart = path?.[0];
      if (path && path.length > 0 && firstPathPart) {
        addProp(firstPathPart);
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
  for (const expr of nodes) {
    visit(expr);
  }
  return {
    hasUsableProps: props.length > 0,
    hasNonTransientProps: props.some((name) => !name.startsWith("$")),
    props,
  };
}

/**
 * Checks whether the param name is used as a bare identifier anywhere in the
 * expression tree (i.e., not as the `object` of a non-computed MemberExpression
 * like `props.X`). This detects patterns like `helper(props)` or computed access
 * `props[expr]` where the full props object is needed, which would break
 * `emitStyleFunctionFromPropsObject` since that handler only forwards a subset
 * of collected prop names.
 */
function hasBareParamUsage(root: unknown, paramName: string): boolean {
  const visit = (node: unknown, skipIdent: boolean): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    if (Array.isArray(node)) {
      return node.some((child) => visit(child, false));
    }
    const n = node as Record<string, unknown> & {
      type?: string;
      name?: string;
      computed?: boolean;
    };
    if (n.type === "Identifier" && n.name === paramName && !skipIdent) {
      return true;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      const isMember = isMemberExpression(n);
      const childSkip = isMember && !n.computed && (key === "object" || key === "property");
      if (visit(child, childSkip)) {
        return true;
      }
    }
    return false;
  };
  return visit(root, false);
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
  const { hasUsableProps, hasNonTransientProps, props } = collectPropsFromExprTree(
    expressions,
    paramName,
  );
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

/**
 * Handles arrow functions with conditional expression bodies that reference props.
 *
 * Pattern: `(props) => (props.$open ? props.$delay : 0)`
 *
 * When the conditional branches contain prop references that can't be resolved
 * statically (e.g., `props.$delay`), this emits a StyleX style function instead
 * of falling through to the inline style fallback.
 */
function tryResolveConditionalPropStyleFunction(node: DynamicNode): HandlerResult | null {
  if (!node.css.property) {
    return null;
  }
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  // Only support simple Identifier params — bail on destructured ObjectPattern
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  const body = getFunctionBodyExpr(expr);
  if (!body || (body as { type?: string }).type !== "ConditionalExpression") {
    return null;
  }
  // Bail if the expression references theme — theme is unavailable at runtime after migration
  if (hasThemeAccessInArrowFn(expr)) {
    return null;
  }
  // Bail if either branch is a boolean literal — in styled-components, falsy interpolations
  // like `false` mean "omit this declaration", which can't be expressed as a StyleX style function.
  const condBody = body as {
    test?: unknown;
    consequent?: { type?: string; value?: unknown };
    alternate?: { type?: string; value?: unknown };
  };
  if (hasBooleanBranch(condBody.consequent) || hasBooleanBranch(condBody.alternate)) {
    return null;
  }

  // Try to decompose: one branch is static, the other is dynamic.
  // This enables merging the dynamic branch with an existing variant bucket
  // instead of emitting a redundant style function that passes the condition prop.
  // Skip when pseudo/media context is present — the decomposed handler writes to
  // base styleObj and emits style functions without buildPseudoMediaPropValue wrapping.
  // Falling through to emitStyleFunctionFromPropsObject handles pseudo/media correctly.
  const hasPseudoOrMedia =
    node.css.selector !== "&" || node.css.atRuleStack.some((a) => a.startsWith("@"));
  if (!hasPseudoOrMedia) {
    const decomposed = tryDecomposeConditionalBranches(condBody, paramName);
    if (decomposed) {
      return decomposed;
    }
  }

  const { hasUsableProps, hasNonTransientProps, props } = collectPropsFromExprTree(
    [body],
    paramName,
  );
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

/**
 * Attempts to decompose a conditional expression into a static branch and a dynamic branch.
 *
 * When exactly one branch is a static literal and the other references props, returns
 * `splitConditionalWithDynamicBranch` so the caller can merge the dynamic branch with
 * existing variant buckets instead of emitting a separate style function.
 *
 * Returns null if both branches are dynamic or the pattern doesn't match.
 */
function tryDecomposeConditionalBranches(
  condBody: {
    test?: unknown;
    consequent?: unknown;
    alternate?: unknown;
  },
  paramName: string,
): HandlerResult | null {
  // Extract condition prop from the test expression
  const test = condBody.test;
  if (!test || typeof test !== "object") {
    return null;
  }
  const conditionProp = getSinglePropFromMemberExpr(test, paramName);
  if (!conditionProp) {
    return null;
  }

  // Try to extract a static value from each branch
  const consStatic = literalToStaticValue(condBody.consequent);
  const altStatic = literalToStaticValue(condBody.alternate);

  // We need exactly one static branch and one dynamic branch
  const consIsStatic = consStatic !== null;
  const altIsStatic = altStatic !== null;
  if (consIsStatic === altIsStatic) {
    // Both static (handled by splitVariants) or both dynamic (fall through)
    return null;
  }

  const staticValue = consIsStatic ? consStatic : altStatic;
  const dynamicBranch = consIsStatic ? condBody.alternate : condBody.consequent;
  const isStaticWhenFalse = !consIsStatic; // static is in the alternate (false) branch

  if (staticValue === undefined || staticValue === null) {
    return null;
  }
  // Only support string/number static values (not booleans)
  if (typeof staticValue !== "string" && typeof staticValue !== "number") {
    return null;
  }

  // Collect props from the dynamic branch (excluding the condition prop)
  const { hasUsableProps, props: dynamicProps } = collectPropsFromExprTree(
    [dynamicBranch],
    paramName,
  );
  if (!hasUsableProps) {
    return null;
  }
  // Ensure there's at least one prop beyond the condition for a useful decomposition.
  // Don't filter conditionProp — it may be referenced in the dynamic branch expression
  // (e.g., nested ternary `props.$open ? props.$delay * (props.$open ? 1 : 2) : 0`).
  const hasNonConditionProp = dynamicProps.some((p) => p !== conditionProp);
  if (!hasNonConditionProp) {
    return null;
  }

  return {
    type: "splitConditionalWithDynamicBranch",
    conditionProp,
    staticValue,
    dynamicBranchExpr: dynamicBranch,
    dynamicProps,
    isStaticWhenFalse,
  };
}

/**
 * Handles arrow functions whose body is a computational expression referencing props.
 *
 * Catches expression types not covered by specific handlers (e.g. BinaryExpression,
 * UnaryExpression) and emits a StyleX style function that takes the props object.
 *
 * Pattern: `(props) => props.$depth * 16 + 4`
 * Output:  `(props) => ({ paddingLeft: \`${props.$depth * 16 + 4}px\` })`
 */
function tryResolveArrowFnPropExpression(node: DynamicNode): HandlerResult | null {
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
  const body = getFunctionBodyExpr(expr);
  if (!body) {
    return null;
  }
  const bodyType = (body as { type?: string }).type;
  if (bodyType !== "BinaryExpression" && bodyType !== "UnaryExpression") {
    return null;
  }
  if (hasThemeAccessInArrowFn(expr)) {
    return null;
  }
  if (hasBareParamUsage(body, paramName)) {
    return null;
  }
  const { hasUsableProps, hasNonTransientProps, props } = collectPropsFromExprTree(
    [body],
    paramName,
  );
  if (!hasUsableProps) {
    return null;
  }
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
  const hasMediaAtRule = (node.css.atRuleStack ?? []).some(isSupportedAtRule);
  const isMediaSelector = isSupportedAtRule((node.css.selector ?? "").trim());
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

/**
 * Checks whether an AST node is a boolean literal (`true`/`false`).
 * Handles both BooleanLiteral (Babel AST) and Literal with boolean value (estree).
 */
function hasBooleanBranch(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; value?: unknown };
  if (n.type === "BooleanLiteral") {
    return true;
  }
  if (n.type === "Literal" && typeof n.value === "boolean") {
    return true;
  }
  return false;
}
