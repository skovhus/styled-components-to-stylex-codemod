/**
 * Built-in resolution handlers for dynamic interpolations.
 * Core concepts: adapter hooks, conditional splitting, and StyleX emission.
 */
import type { CallResolveContext } from "../adapter.js";
import {
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isArrowFunctionExpression,
  isCallExpressionNode,
  isLogicalExpressionNode,
  literalToStaticValue,
  resolveIdentifierToPropName,
} from "./utilities/jscodeshift-utils.js";
import { sanitizeIdentifier } from "./utilities/string-utils.js";
import { hasThemeAccessInArrowFn } from "./lower-rules/inline-styles.js";
import { styleFromSingleDeclaration } from "./builtin-handlers/css-parsing.js";
import {
  buildResolvedHandlerResult,
  buildUnresolvedHelperResult,
  getArrowFnThemeParamInfo,
  isAdapterResultCssValue,
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
    tryResolveArrowFnCallWithConditionalArgs(node, ctx) ??
    tryResolveConditionalValue(node, ctx) ??
    tryResolveIndexedThemeWithPropFallback(node, ctx) ??
    tryResolveConditionalCssBlockTernary(node, ctx) ??
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

  // Simple param: extract prop from member expression like `props.$oneLine`
  if (bindings.kind === "simple" && (test as { type?: string }).type === "MemberExpression") {
    const path = getMemberPathFromIdentifier(
      test as Parameters<typeof getMemberPathFromIdentifier>[0],
      bindings.paramName,
    );
    if (path && path.length === 1 && path[0]) {
      return path[0];
    }
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
