import type { API, JSCodeshift, TemplateLiteral } from "jscodeshift";
import type {
  CallResolveContext,
  CallResolveResult,
  ImportSource,
  ImportSpec,
  ResolveValueContext,
  ResolveValueResult,
} from "../adapter.js";
import {
  type CallExpressionNode,
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isArrowFunctionExpression,
  isCallExpressionNode,
  isConditionalExpressionNode,
  isLogicalExpressionNode,
  literalToStaticValue,
  literalToString,
  resolveIdentifierToPropName,
} from "./utilities/jscodeshift-utils.js";
import { escapeRegex, sanitizeIdentifier } from "./utilities/string-utils.js";
import { hasThemeAccessInArrowFn } from "./lower-rules/inline-styles.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  parseInterpolatedBorderStaticParts,
} from "./css-prop-mapping.js";
import type { WarningType } from "./logger.js";

export type DynamicNode = {
  slotId: number;
  expr: unknown;
  css: DynamicNodeCssContext;
  component: DynamicNodeComponentContext;
  usage: DynamicNodeUsageContext;
  loc?: DynamicNodeLoc;
};

export type HandlerResult =
  | {
      /**
       * The node was resolved to a JS expression string that can be directly inlined into
       * generated output (typically for a single CSS property value).
       *
       * Example: `props.theme.color.bgBase` -> `themeVars.bgBase`
       *
       * The caller is responsible for:
       * - parsing `expr` into an AST
       * - adding `imports`
       */
      type: "resolvedValue";
      expr: string;
      imports: ImportSpec[];
      resolveCallContext?: CallResolveContext;
      resolveCallResult?: CallResolveResult;
    }
  | {
      /**
       * The node was resolved to a StyleX style object expression suitable for passing to
       * `stylex.props(...)` (NOT to be used as a single CSS property value).
       *
       * Example: `themedBorder("labelMuted")(props)` -> `borders.labelMuted`
       */
      type: "resolvedStyles";
      expr: string;
      imports: ImportSpec[];
      resolveCallContext?: CallResolveContext;
      resolveCallResult?: CallResolveResult;
    }
  | {
      /**
       * Emit a wrapper inline style from a raw CSS string snippet.
       *
       * This is intentionally narrow and primarily used for keeping runtime parity
       * when the codemod cannot safely lower to StyleX (e.g. complex dynamic blocks).
       */
      type: "emitInlineStyle";
      style: string;
    }
  | {
      /**
       * Preserve the dynamic value by emitting a wrapper inline style:
       *   style={{ ..., prop: expr(props) }}
       *
       * This is used for cases where we can't (or don't want to) lower into StyleX
       * buckets, but can safely keep parity with styled-components at runtime.
       */
      type: "emitInlineStyleValueFromProps";
    }
  | {
      /**
       * Emit a StyleX style function that takes an object of transient props.
       * This preserves complex template literals while keeping styles in StyleX.
       */
      type: "emitStyleFunctionFromPropsObject";
      props: string[];
    }
  | {
      /**
       * Emit a StyleX style function keyed off a single JSX prop.
       *
       * The caller uses this to generate a helper like:
       *   const styles = stylex.create({
       *     boxShadowFromProp: (shadow) => ({ boxShadow: shadow })
       *   })
       *
       * And apply it conditionally in the wrapper:
       *   shadow != null && styles.boxShadowFromProp(shadow)
       */
      type: "emitStyleFunction";
      nameHint: string;
      params: string;
      body: string;
      call: string;
      /**
       * Optional value transform to apply to the param before assigning to the style prop.
       * This allows supporting patterns like:
       *   box-shadow: ${(props) => shadow(props.shadow)};
       * by emitting a style function that computes: `shadow(value)`.
       */
      valueTransform?: { kind: "call"; calleeIdent: string };
      /**
       * Wrap the computed value in a template literal (e.g. `${expr}`) to satisfy
       * StyleX lint rules that require string literals.
       */
      wrapValueInTemplateLiteral?: boolean;
    }
  | {
      /**
       * Like `emitStyleFunction`, but also emit a static base style with the default value.
       *
       * This supports destructuring defaults like `({ padding = "16px" }) => padding`.
       *
       * The caller uses this to generate:
       *   const styles = stylex.create({
       *     card: { padding: "16px" },  // static base with default
       *     cardPadding: (padding) => ({ padding })  // dynamic override
       *   })
       *
       * And apply it:
       *   stylex.props(styles.card, padding != null && styles.cardPadding(padding))
       */
      type: "emitStyleFunctionWithDefault";
      nameHint: string;
      params: string;
      body: string;
      call: string;
      defaultValue: unknown;
      valueTransform?: { kind: "call"; calleeIdent: string };
      wrapValueInTemplateLiteral?: boolean;
    }
  | {
      /**
       * Split a dynamic interpolation into one or more variant buckets.
       *
       * Each variant contains a static StyleX-style object. The caller is responsible for
       * wiring these into `stylex.create(...)` keys and applying them under the `when` condition.
       */
      type: "splitVariants";
      variants: Array<{
        nameHint: string;
        when: string;
        style: Record<string, unknown>;
        imports?: ImportSpec[];
      }>;
    }
  | {
      /**
       * Like `splitVariants`, but each branch produces a JS expression string
       * (which may come from adapter theme resolution) rather than a static literal.
       */
      type: "splitVariantsResolvedValue";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Like `splitVariantsResolvedValue`, but each branch yields a StyleX style object expression
       * intended for `stylex.props(...)` arguments.
       */
      type: "splitVariantsResolvedStyles";
      variants: Array<{
        nameHint: string;
        when: string;
        expr: string;
        imports: ImportSpec[];
      }>;
    }
  | {
      /**
       * Split a multi-prop nested ternary like `outer ? A : inner ? B : C` where
       * outer and inner test different boolean props.
       *
       * Example: `disabled ? bgBase : checked ? bgSub : bgBase`
       *
       * The caller emits variant buckets for each branch and wires them into a
       * compound ternary at usage time:
       *   `disabled ? styles.xDisabled : checked ? styles.xCheckedTrue : styles.xCheckedFalse`
       */
      type: "splitMultiPropVariantsResolvedValue";
      outerProp: string;
      outerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerProp: string;
      innerTruthyBranch: { expr: string; imports: ImportSpec[] };
      innerFalsyBranch: { expr: string; imports: ImportSpec[] };
    }
  | {
      /**
       * Signal that this handler does not know how to transform the node.
       *
       * The caller typically falls back to other strategies (or drops the declaration)
       * and may surface `reason` as a warning.
       */
      type: "keepOriginal";
      reason: WarningType;
      context?: Record<string, unknown>;
    }
  | {
      /**
       * Emit a conditional StyleX style function where a prop is used both as
       * the truthy condition and as an index into a resolved theme object.
       *
       * Pattern: `props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle`
       *
       * Output: `(textColor: Colors | undefined) => ({ color: textColor ? themeVars[textColor] : themeVars.labelTitle })`
       */
      type: "emitConditionalIndexedThemeFunction";
      /** The prop name used in both the condition and as the index (e.g., "textColor") */
      propName: string;
      /** The prop's TypeScript type annotation (e.g., "Colors"), or null if unknown */
      propType: string | null;
      /** Resolved theme object expression (e.g., "themeVars") */
      themeObjectExpr: string;
      /** Imports required for themeObjectExpr */
      themeObjectImports: ImportSpec[];
      /** Resolved fallback expression (e.g., "themeVars.labelTitle") */
      fallbackExpr: string;
      /** Imports required for fallbackExpr */
      fallbackImports: ImportSpec[];
    }
  | {
      /**
       * Emit a StyleX style function that uses an indexed theme lookup with the prop itself as fallback.
       *
       * Pattern: `props.theme.color[props.backgroundColor] || props.backgroundColor`
       *
       * Output: `(backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] || backgroundColor })`
       */
      type: "emitIndexedThemeFunctionWithPropFallback";
      /** The prop name used as the index (e.g., "backgroundColor") */
      propName: string;
      /** Resolved theme object expression (e.g., "$colors") */
      themeObjectExpr: string;
      /** Imports required for themeObjectExpr */
      themeObjectImports: ImportSpec[];
      /** The original operator from the input ("||" or "??") */
      operator: "||" | "??";
    };

export type InternalHandlerContext = {
  api: API;
  filePath: string;
  resolveValue: (context: ResolveValueContext) => ResolveValueResult | undefined;
  resolveCall: (context: CallResolveContext) => CallResolveResult | undefined;
  resolveImport: (
    localName: string,
    identNode?: unknown,
  ) => {
    importedName: string;
    source: ImportSource;
  } | null;
};

type ThemeParamInfo =
  | { kind: "propsParam"; propsName: string }
  | { kind: "themeBinding"; themeName: string };

/**
 * Narrow type for extracted function body when checking for conditional expressions.
 * Used with `getFunctionBodyExpr` results when we need to access ConditionalExpression properties.
 */
type ConditionalExpressionBody = {
  type?: string;
  test?: unknown;
  consequent?: unknown;
  alternate?: unknown;
};

/**
 * Determines if an adapter's CallResolveResult should be treated as a CSS value.
 *
 * Resolution priority:
 * 1. Adapter's explicit `usage` field takes precedence
 * 2. Otherwise, infer from context: cssProperty present → CSS value, absent → StyleX reference
 */
function isAdapterResultCssValue(result: CallResolveResult, cssProperty?: string): boolean {
  return result.usage === "create" || (result.usage === undefined && Boolean(cssProperty));
}

/**
 * Builds a HandlerResult from an adapter's resolved call expression.
 *
 * Returns "resolvedValue" for CSS values (to be used in stylex.create property values)
 * or "resolvedStyles" for StyleX references (to be used in stylex.props arguments).
 */
function buildResolvedHandlerResult(
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
        ...payload,
      };
}

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

/**
 * Builds a "keepOriginal" HandlerResult for when the adapter returns undefined for a helper call.
 * Resolves the import name for better error context.
 */
function buildUnresolvedHelperResult(callee: unknown, ctx: InternalHandlerContext): HandlerResult {
  const calleeIdent = getCalleeIdentName(callee);
  const imp = typeof calleeIdent === "string" ? ctx.resolveImport(calleeIdent, callee) : null;
  const importedName = imp?.importedName ?? calleeIdent ?? "unknown";
  return {
    type: "keepOriginal",
    reason: `Adapter resolveCall returned undefined for helper call`,
    context: { importedName },
  };
}

function getArrowFnThemeParamInfo(fn: any): ThemeParamInfo | null {
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
function resolveTemplateLiteralExpressions(
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
function resolveTemplateLiteralWithTheme(
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

type CssNodeKind = "declaration" | "selector" | "atRule" | "keyframes";

type DynamicNodeCssContext = {
  kind: CssNodeKind;
  selector: string;
  atRuleStack: string[];
  property?: string;
  valueRaw?: string;
};

type DynamicNodeComponentContext = {
  localName: string;
  base: "intrinsic" | "component";
  tagOrIdent: string;
  withConfig?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
};

type DynamicNodeUsageContext = {
  jsxUsages: number;
  hasPropsSpread: boolean;
};

type DynamicNodeLoc = {
  line?: number;
  column?: number;
};

/**
 * Extract indexed theme lookup info from a computed member expression like:
 *   props.theme.color[props.textColor]
 * Returns the theme object path (e.g., "color") and the index prop name if valid.
 */
function extractIndexedThemeLookupInfo(
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

type ResolveImportedHelperCallResult =
  | {
      kind: "resolved";
      result: CallResolveResult;
      resolveCallContext: CallResolveContext;
      resolveCallResult: CallResolveResult;
    }
  | { kind: "unresolved"; resolveCallContext: CallResolveContext; resolveCallResult: undefined }
  | { kind: "keepOriginal" };

function resolveImportedHelperCall(
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

function tryResolveCallExpression(
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

  // If we got here, it's a call expression we don't understand.
  return {
    type: "keepOriginal",
    reason:
      "Unsupported call expression (expected imported helper(...) or imported helper(...)(...))",
  };
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

function tryResolveConditionalValue(
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
  const info = getArrowFnThemeParamInfo(expr);
  const paramName = info?.kind === "propsParam" ? info.propsName : null;

  // Use getFunctionBodyExpr to handle both expression-body and block-body arrow functions.
  // Block bodies with a single return statement (possibly with comments) are supported.
  const body = getFunctionBodyExpr(expr) as ConditionalExpressionBody | null;
  if (!body || body.type !== "ConditionalExpression") {
    return null;
  }

  type BranchUsage = "props" | "create";
  type Branch = { usage: BranchUsage; expr: string; imports: ImportSpec[] } | null;

  // Determine expected usage from context:
  // - Has CSS property → "create" (CSS value)
  // - No CSS property → "props" (StyleX reference)
  const expectedUsage: BranchUsage = node.css.property ? "create" : "props";

  // Helper to resolve a MemberExpression as a theme path
  const resolveThemeFromMemberExpr = (node: unknown): { path: string } | null => {
    if (
      !node ||
      typeof node !== "object" ||
      (node as { type?: string }).type !== "MemberExpression"
    ) {
      return null;
    }
    if (info?.kind === "propsParam" && paramName) {
      const parts = getMemberPathFromIdentifier(
        node as Parameters<typeof getMemberPathFromIdentifier>[0],
        paramName,
      );
      if (!parts || parts[0] !== "theme") {
        return null;
      }
      return { path: parts.slice(1).join(".") };
    }
    if (info?.kind === "themeBinding") {
      const parts = getMemberPathFromIdentifier(
        node as Parameters<typeof getMemberPathFromIdentifier>[0],
        info.themeName,
      );
      if (!parts) {
        return null;
      }
      return { path: parts.join(".") };
    }
    return null;
  };

  const branchToExpr = (b: unknown): Branch => {
    const v = literalToStaticValue(b);
    if (v !== null) {
      // Booleans are not valid CSS values; styled-components treats falsy
      // interpolations as "omit this declaration", so bail instead of emitting
      // invalid CSS like `cursor: false`.
      if (typeof v === "boolean") {
        return null;
      }
      return {
        usage: "create",
        expr: typeof v === "string" ? JSON.stringify(v) : String(v),
        imports: [],
      };
    }
    if (!b || typeof b !== "object") {
      return null;
    }

    // Helper to resolve call expressions (simple or curried) via adapter.
    // Preserves the full CallResolveResult including `kind` for proper CSS value vs StyleX ref detection.
    const resolveCallExpr = (
      call: CallExpressionNode,
      cssProperty: string | undefined,
    ): CallResolveResult | null => {
      const res = resolveImportedHelperCall(call, ctx, undefined, cssProperty);
      if (res.kind === "resolved") {
        return res.result;
      }
      // Try curried pattern: helper(...)(propsParam)
      if (isCallExpressionNode(call.callee)) {
        const inner = call.callee;
        const outerArgs = call.arguments ?? [];
        if (outerArgs.length === 1 && outerArgs[0] && typeof outerArgs[0] === "object") {
          const innerRes = resolveImportedHelperCall(inner, ctx, undefined, cssProperty);
          if (innerRes.kind === "resolved") {
            return innerRes.result;
          }
        }
      }
      return null;
    };

    // Handle template literals with theme or call interpolations
    // e.g., `inset 0 0 0 1px ${props.theme.color.primaryColor}, 0px 1px 2px rgba(0, 0, 0, 0.06)`
    // e.g., `linear-gradient(to bottom, ${color("bgSub")(props)} 70%, rgba(0, 0, 0, 0) 100%)`
    // Template literals always need CSS values, so always pass cssProperty
    const templateResult = resolveTemplateLiteralExpressions(b, (expr) => {
      // First try theme member expression
      const themeInfo = resolveThemeFromMemberExpr(expr);
      if (themeInfo) {
        const res = ctx.resolveValue({
          kind: "theme",
          path: themeInfo.path,
          filePath: ctx.filePath,
          loc: getNodeLocStart(expr) ?? undefined,
        });
        return res ?? null;
      }
      // Then try call expression (simple or curried)
      // Template literals need CSS values, so pass cssProperty
      if (isCallExpressionNode(expr)) {
        const callRes = resolveCallExpr(expr, node.css.property);
        return callRes ? { expr: callRes.expr, imports: callRes.imports } : null;
      }
      return null;
    });
    if (templateResult) {
      return { usage: "create", ...templateResult };
    }

    if (isCallExpressionNode(b)) {
      // helper(...) or helper(...)(props)
      // Pass cssProperty to let the adapter decide based on context
      const resolved = resolveCallExpr(b, node.css.property);
      if (resolved) {
        // Use adapter's explicit `kind` if provided, otherwise infer from cssProperty context
        const isCssValue = isAdapterResultCssValue(resolved, node.css.property);
        const usage: BranchUsage = isCssValue ? "create" : "props";
        return { usage, expr: resolved.expr, imports: resolved.imports };
      }
      return null;
    }

    // Handle direct MemberExpression theme access (reuse the helper)
    const themeInfo = resolveThemeFromMemberExpr(b);
    if (!themeInfo) {
      return null;
    }
    const res = ctx.resolveValue({
      kind: "theme",
      path: themeInfo.path,
      filePath: ctx.filePath,
      loc: getNodeLocStart(b) ?? undefined,
    });
    if (!res) {
      return null;
    }
    return { usage: expectedUsage, expr: res.expr, imports: res.imports };
  };

  const getBranch = (value: unknown): Branch => {
    return branchToExpr(value);
  };

  // Helper to extract condition info from a binary expression test
  type CondInfo = { propName: string; rhsValue: string; rhsRaw: unknown; cond: string } | null;
  const extractConditionInfo = (test: any): CondInfo => {
    if (
      !paramName ||
      test.type !== "BinaryExpression" ||
      (test.operator !== "===" && test.operator !== "!==") ||
      test.left.type !== "MemberExpression"
    ) {
      return null;
    }
    const leftPath = getMemberPathFromIdentifier(test.left, paramName);
    const firstLeftPath = leftPath?.[0];
    if (!leftPath || leftPath.length !== 1 || !firstLeftPath) {
      return null;
    }
    const propName = firstLeftPath;
    const rhsRaw = literalToStaticValue(test.right as any);
    if (rhsRaw === null) {
      return null;
    }
    const rhsValue = JSON.stringify(rhsRaw);
    const cond = `${propName} ${test.operator} ${rhsValue}`;
    return { propName, rhsValue, rhsRaw, cond };
  };

  // Recursively extract variants from nested ternaries
  // e.g., prop === "a" ? valA : prop === "b" ? valB : defaultVal
  type Variant = {
    nameHint: string;
    when: string;
    usage: BranchUsage;
    expr: string;
    imports: ImportSpec[];
  };
  const extractNestedTernaryVariants = (
    condExpr: any,
    expectedPropName?: string,
  ): { variants: Variant[]; defaultBranch: NonNullable<Branch> } | null => {
    if (condExpr.type !== "ConditionalExpression") {
      // Base case: not a conditional, this is the default value
      const branch = getBranch(condExpr);
      if (!branch) {
        return null;
      }
      return { variants: [], defaultBranch: branch };
    }

    const { test, consequent, alternate } = condExpr;
    const condInfo = extractConditionInfo(test);
    if (!condInfo) {
      return null;
    }

    // Ensure all conditions test the same property
    if (expectedPropName && condInfo.propName !== expectedPropName) {
      return null;
    }

    const consExpr = getBranch(consequent);
    if (!consExpr) {
      return null;
    }

    // Extract the RHS value for nameHint (e.g., "large" from variant === "large")
    const rhsNameHint =
      typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw);

    // Recursively process the alternate branch
    const nested = extractNestedTernaryVariants(alternate, condInfo.propName);
    if (!nested) {
      return null;
    }

    // Add this condition's variant
    const thisVariant: Variant = {
      nameHint: rhsNameHint,
      when: condInfo.cond,
      usage: consExpr.usage,
      expr: consExpr.expr,
      imports: consExpr.imports,
    };

    return {
      variants: [thisVariant, ...nested.variants],
      defaultBranch: nested.defaultBranch,
    };
  };

  // Helper: Extract indexed theme lookup from a computed member expression like:
  //   props.theme.color[props.textColor]
  // Returns the theme object path (e.g., "color") and the index prop name if valid.
  // Uses shared helper but adds expectedIndexProp validation.
  const tryExtractIndexedThemeLookup = (
    branch: unknown,
    expectedIndexProp: string,
  ): { themeObjectPath: string; indexPropName: string } | null => {
    if (!paramName) {
      return null;
    }
    const result = extractIndexedThemeLookupInfo(branch, paramName);
    if (!result || result.indexPropName !== expectedIndexProp) {
      return null;
    }
    return result;
  };

  // Helper: Extract static theme value from a non-computed member expression like:
  //   props.theme.color.labelTitle
  const tryExtractStaticThemeValue = (
    branch: unknown,
  ): { expr: string; imports: ImportSpec[] } | null => {
    const n = branch as { type?: string; computed?: boolean };
    if (!n || n.type !== "MemberExpression" || n.computed === true || !paramName) {
      return null;
    }
    const path = getMemberPathFromIdentifier(n as any, paramName);
    if (!path || path[0] !== "theme" || path.length < 2) {
      return null;
    }
    const themePath = path.slice(1).join(".");
    const resolved = ctx.resolveValue({
      kind: "theme",
      path: themePath,
      filePath: ctx.filePath,
      loc: getNodeLocStart(n) ?? undefined,
    });
    return resolved ? { expr: resolved.expr, imports: resolved.imports } : null;
  };

  const { test, consequent, alternate } = body as {
    test: any;
    consequent: any;
    alternate: any;
  };

  // 1) props.foo ? a : b (simple boolean test)
  const testPath =
    paramName && test.type === "MemberExpression"
      ? getMemberPathFromIdentifier(test, paramName)
      : null;
  const outerProp = testPath?.[0];
  if (testPath && testPath.length === 1 && outerProp) {
    const cons = getBranch(consequent);
    const alt = getBranch(alternate);

    // Check for multi-prop nested ternary: outerProp ? A : innerProp ? B : C
    // where alternate is a conditional testing a different boolean prop
    if (cons && !alt && alternate.type === "ConditionalExpression" && paramName) {
      const innerTest = (alternate as any).test;
      const innerTestPath =
        innerTest?.type === "MemberExpression"
          ? getMemberPathFromIdentifier(innerTest, paramName)
          : null;
      const innerProp = innerTestPath?.[0];
      // Only handle when inner tests a different single-level prop
      if (innerTestPath && innerTestPath.length === 1 && innerProp && innerProp !== outerProp) {
        const innerCons = getBranch((alternate as any).consequent);
        const innerAlt = getBranch((alternate as any).alternate);
        if (innerCons && innerAlt) {
          // All branches must use "create" usage (not "props")
          if (
            cons.usage === "create" &&
            innerCons.usage === "create" &&
            innerAlt.usage === "create"
          ) {
            return {
              type: "splitMultiPropVariantsResolvedValue",
              outerProp,
              outerTruthyBranch: { expr: cons.expr, imports: cons.imports },
              innerProp,
              innerTruthyBranch: { expr: innerCons.expr, imports: innerCons.imports },
              innerFalsyBranch: { expr: innerAlt.expr, imports: innerAlt.imports },
            };
          }
        }
      }
    }

    // Check for conditional indexed theme lookup:
    //   props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle
    // Where the test prop is also used as the index into a theme object.
    if (!cons) {
      const indexedResult = tryExtractIndexedThemeLookup(consequent, outerProp);
      if (indexedResult) {
        // Resolve the theme object (e.g., "color" -> "themeVars")
        const themeObjResolved = ctx.resolveValue({
          kind: "theme",
          path: indexedResult.themeObjectPath,
          filePath: ctx.filePath,
          loc: getNodeLocStart(consequent) ?? undefined,
        });
        if (themeObjResolved) {
          // Extract static fallback from alternate branch
          const fallbackResult = tryExtractStaticThemeValue(alternate);
          if (fallbackResult) {
            return {
              type: "emitConditionalIndexedThemeFunction",
              propName: outerProp,
              propType: null, // Type will be inferred from component props in lower-rules.ts
              themeObjectExpr: themeObjResolved.expr,
              themeObjectImports: themeObjResolved.imports,
              fallbackExpr: fallbackResult.expr,
              fallbackImports: fallbackResult.imports,
            };
          }
        }
      }
    }

    if (!cons || !alt) {
      return null;
    }
    const allUsages = new Set([cons.usage, alt.usage]);
    if (allUsages.size !== 1) {
      return null;
    }
    const usage = cons.usage;
    const variants = [
      { nameHint: "truthy", when: outerProp, expr: cons.expr, imports: cons.imports },
      { nameHint: "falsy", when: `!${outerProp}`, expr: alt.expr, imports: alt.imports },
    ];
    return usage === "props"
      ? { type: "splitVariantsResolvedStyles", variants }
      : { type: "splitVariantsResolvedValue", variants };
  }

  // 2) Handle nested ternaries: prop === "a" ? valA : prop === "b" ? valB : defaultVal
  // This also handles the simple case: prop === "a" ? valA : defaultVal
  const condInfo = extractConditionInfo(test);
  if (condInfo) {
    const consExpr = getBranch(consequent);
    if (!consExpr) {
      return null;
    }

    // If the consequent is styles and the alternate is a literal that effectively means "nothing",
    // we can model this as a single variant in stylex.props.
    const altLiteral = literalToString(alternate);
    const altIsEmptyish =
      altLiteral !== null && (altLiteral.trim() === "" || altLiteral === "none");
    if (consExpr.usage === "props" && altIsEmptyish) {
      return {
        type: "splitVariantsResolvedStyles",
        variants: [
          {
            nameHint:
              typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw),
            when: condInfo.cond,
            expr: consExpr.expr,
            imports: consExpr.imports,
          },
        ],
      };
    }

    // Check if alternate is a nested ternary testing the same property
    const nested = extractNestedTernaryVariants(alternate, condInfo.propName);
    if (nested) {
      const rhsNameHint =
        typeof condInfo.rhsRaw === "string" ? condInfo.rhsRaw : String(condInfo.rhsRaw);

      const thisVariant: Variant = {
        nameHint: rhsNameHint,
        when: condInfo.cond,
        usage: consExpr.usage,
        expr: consExpr.expr,
        imports: consExpr.imports,
      };

      const allVariants = [thisVariant, ...nested.variants];

      // Build the default condition: negation of all positive conditions
      const allConditions = allVariants.map((v) => v.when).join(" || ");

      // For now, only support nested-ternary variant extraction for value results.
      // (Styles results would need an explicit “no style” default semantics.)
      const usageSet = new Set<BranchUsage>([
        nested.defaultBranch.usage,
        ...allVariants.map((v) => v.usage),
      ]);
      if (usageSet.size !== 1 || usageSet.has("props")) {
        return null;
      }
      return {
        type: "splitVariantsResolvedValue",
        variants: [
          {
            nameHint: "default",
            when: `!(${allConditions})`,
            expr: nested.defaultBranch.expr,
            imports: nested.defaultBranch.imports,
          },
          ...allVariants.map((v) => ({
            nameHint: v.nameHint,
            when: v.when,
            expr: v.expr,
            imports: v.imports,
          })),
        ],
      };
    }
  }

  return null;
}

/**
 * Handle indexed theme lookup with prop fallback:
 *   props.theme.color[props.backgroundColor] || props.backgroundColor
 *
 * Output: (backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] ?? backgroundColor })
 */
function tryResolveIndexedThemeWithPropFallback(
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
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }

  const body = expr.body as {
    type?: string;
    operator?: string;
    left?: unknown;
    right?: unknown;
  } | null;

  // Must be a LogicalExpression with || or ??
  if (
    !body ||
    body.type !== "LogicalExpression" ||
    (body.operator !== "||" && body.operator !== "??")
  ) {
    return null;
  }

  // Right side must be a simple prop access: props.propName
  const rightPath = getMemberPathFromIdentifier(body.right as any, paramName);
  const fallbackPropName = rightPath?.[0];
  if (!rightPath || rightPath.length !== 1 || !fallbackPropName) {
    return null;
  }

  // Left side must be an indexed theme lookup: props.theme.color[props.propName]
  const indexedResult = extractIndexedThemeLookupInfo(body.left, paramName);
  if (!indexedResult) {
    return null;
  }

  // The index prop and fallback prop must be the same
  if (indexedResult.indexPropName !== fallbackPropName) {
    return null;
  }

  // Resolve the theme object (e.g., "color" -> "$colors")
  const themeObjResolved = ctx.resolveValue({
    kind: "theme",
    path: indexedResult.themeObjectPath,
    filePath: ctx.filePath,
    loc: getNodeLocStart(body.left) ?? undefined,
  });
  if (!themeObjResolved) {
    return null;
  }

  return {
    type: "emitIndexedThemeFunctionWithPropFallback",
    propName: indexedResult.indexPropName,
    themeObjectExpr: themeObjResolved.expr,
    themeObjectImports: themeObjResolved.imports,
    operator: body.operator as "||" | "??",
  };
}

function tryResolveConditionalCssBlock(
  node: DynamicNode,
  ctx: InternalHandlerContext,
): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }

  // Support patterns like:
  //   ${(props) => props.$upsideDown && "transform: rotate(180deg);"}
  //   ${(props) => props.$upsideDown && `box-shadow: ${props.theme.color.x};`}
  // Also supports arrow functions with a block body containing only a return statement:
  //   ${(props) => { return props.$upsideDown && "transform: rotate(180deg);"; }}
  const body = getFunctionBodyExpr(expr) as {
    type?: string;
    operator?: string;
    left?: unknown;
    right?: unknown;
  } | null;
  if (!body || body.type !== "LogicalExpression" || body.operator !== "&&") {
    return null;
  }
  const { left, right } = body;
  const testPath =
    (left as { type?: string })?.type === "MemberExpression"
      ? getMemberPathFromIdentifier(
          left as Parameters<typeof getMemberPathFromIdentifier>[0],
          paramName,
        )
      : null;
  const testProp = testPath?.[0];
  if (!testPath || testPath.length !== 1 || !testProp) {
    return null;
  }

  // Try static string/template literal first
  const cssText = literalToString(right);
  if (cssText !== null && cssText !== undefined) {
    const style = parseCssDeclarationBlock(cssText);
    if (!style) {
      return null;
    }
    return {
      type: "splitVariants",
      variants: [{ nameHint: "truthy", when: testProp, style }],
    };
  }

  // Try template literal with theme expressions
  const templateResult = resolveTemplateLiteralWithTheme(right, paramName, ctx);
  if (templateResult) {
    // Extract CSS text from the resolved template to get property names
    // The template looks like: `property: value ${resolved};`
    // We need to parse it to build the style object
    const templateText = templateResult.expr.slice(1, -1); // Remove backticks
    const parsed = parseCssDeclarationBlockWithTemplateExpr(templateText, ctx.api);
    if (!parsed) {
      return null;
    }
    return {
      type: "splitVariants",
      variants: [
        {
          nameHint: "truthy",
          when: testProp,
          style: parsed.styleObj,
          imports: templateResult.imports,
        },
      ],
    };
  }

  return null;
}

function tryResolveConditionalCssBlockTernary(node: DynamicNode): HandlerResult | null {
  const expr = node.expr;
  if (!isArrowFunctionExpression(expr)) {
    return null;
  }
  const paramName = getArrowFnSingleParamName(expr);
  if (!paramName) {
    return null;
  }
  // Support both expression bodies and block bodies with a single return statement
  const body = getFunctionBodyExpr(expr);
  if (!isConditionalExpressionNode(body)) {
    return null;
  }

  // Helper to parse a condition test and extract propName + when condition
  type ConditionInfo =
    | { kind: "boolean"; propName: string; isNegated: boolean }
    | {
        kind: "comparison";
        propName: string;
        operator: "===" | "!==";
        rhsValue: string;
        rhsRaw: unknown;
      };

  const parseConditionTest = (test: unknown): ConditionInfo | null => {
    if (!test || typeof test !== "object") {
      return null;
    }
    const t = test as {
      type?: string;
      operator?: string;
      argument?: unknown;
      left?: unknown;
      right?: unknown;
    };

    // Simple prop access: props.$dim
    if (t.type === "MemberExpression") {
      const testPath = getMemberPathFromIdentifier(t as any, paramName);
      const firstProp = testPath?.[0];
      if (!testPath || testPath.length !== 1 || !firstProp) {
        return null;
      }
      return { kind: "boolean", propName: firstProp, isNegated: false };
    }

    // Negated prop access: !props.$open
    if (t.type === "UnaryExpression" && t.operator === "!") {
      const arg = t.argument as { type?: string } | undefined;
      if (arg?.type === "MemberExpression") {
        const testPath = getMemberPathFromIdentifier(arg as any, paramName);
        const firstProp = testPath?.[0];
        if (!testPath || testPath.length !== 1 || !firstProp) {
          return null;
        }
        return { kind: "boolean", propName: firstProp, isNegated: true };
      }
      return null;
    }

    // Comparison: props.variant === "micro" or props.variant !== "micro"
    if (t.type === "BinaryExpression" && (t.operator === "===" || t.operator === "!==")) {
      const left = t.left as { type?: string } | undefined;
      if (left?.type !== "MemberExpression") {
        return null;
      }
      const testPath = getMemberPathFromIdentifier(left as any, paramName);
      const firstProp = testPath?.[0];
      if (!testPath || testPath.length !== 1 || !firstProp) {
        return null;
      }
      const rhsRaw = literalToStaticValue(t.right);
      if (rhsRaw === null) {
        return null;
      }
      return {
        kind: "comparison",
        propName: firstProp,
        operator: t.operator as "===" | "!==",
        rhsValue: JSON.stringify(rhsRaw),
        rhsRaw,
      };
    }

    return null;
  };

  // Helper to build `when` string from condition info
  const buildWhenCondition = (cond: ConditionInfo, isTruthyBranch: boolean): string => {
    if (cond.kind === "boolean") {
      // For boolean tests:
      // - truthy branch: propName (or !propName if negated test)
      // - falsy branch: !propName (or propName if negated test)
      if (isTruthyBranch) {
        return cond.isNegated ? `!${cond.propName}` : cond.propName;
      } else {
        return cond.isNegated ? cond.propName : `!${cond.propName}`;
      }
    }
    // For comparison tests:
    // - truthy branch: propName === value (or propName !== value)
    // - falsy branch: the negation
    if (isTruthyBranch) {
      return `${cond.propName} ${cond.operator} ${cond.rhsValue}`;
    } else {
      const inverseOp = cond.operator === "===" ? "!==" : "===";
      return `${cond.propName} ${inverseOp} ${cond.rhsValue}`;
    }
  };

  // Helper to build nameHint from condition info
  const buildNameHint = (cond: ConditionInfo, isTruthyBranch: boolean): string => {
    if (cond.kind === "boolean") {
      return isTruthyBranch ? "truthy" : "falsy";
    }
    // For comparison tests, use the RHS value as hint (e.g., "micro", "small")
    if (isTruthyBranch) {
      return typeof cond.rhsRaw === "string" ? cond.rhsRaw : String(cond.rhsRaw);
    }
    return "default";
  };

  type VariantWithStyle = { nameHint: string; when: string; style: Record<string, unknown> };

  // Recursively extract variants from nested ternaries
  // e.g., variant === "micro" ? "..." : variant === "small" ? "..." : "..."
  const extractVariantsFromTernary = (
    condExpr: unknown,
    expectedPropName?: string,
  ): { variants: VariantWithStyle[]; defaultStyle: Record<string, unknown> | null } | null => {
    if (!condExpr || typeof condExpr !== "object") {
      return null;
    }
    const ce = condExpr as ConditionalExpressionBody;

    // Base case: not a conditional, this is the default value (a CSS string)
    if (ce.type !== "ConditionalExpression") {
      const cssText = literalToString(condExpr);
      if (cssText !== null) {
        const style = cssText.trim() ? parseCssDeclarationBlock(cssText) : null;
        return { variants: [], defaultStyle: style };
      }

      // Try template literal with prop-based ternary: `background: ${props.$x ? "a" : "b"}`
      const parsed = parseCssTemplateLiteralWithTernary(condExpr);
      if (parsed) {
        // Use parseConditionTest to validate and extract prop info from inner ternary
        const innerCondInfo = parseConditionTest(parsed.innerTest);
        if (!innerCondInfo) {
          return null;
        }

        // Build CSS text for each branch and parse into styles
        const truthyCss = `${parsed.prefix}${parsed.truthyValue}${parsed.suffix}`;
        const falsyCss = `${parsed.prefix}${parsed.falsyValue}${parsed.suffix}`;
        const truthyStyle = truthyCss.trim() ? parseCssDeclarationBlock(truthyCss) : null;
        const falsyStyle = falsyCss.trim() ? parseCssDeclarationBlock(falsyCss) : null;

        // Use existing helpers for consistency
        const innerVariants: VariantWithStyle[] = [];
        if (truthyStyle) {
          innerVariants.push({
            nameHint: buildNameHint(innerCondInfo, true),
            when: buildWhenCondition(innerCondInfo, true),
            style: truthyStyle,
          });
        }
        if (falsyStyle) {
          innerVariants.push({
            nameHint: buildNameHint(innerCondInfo, false),
            when: buildWhenCondition(innerCondInfo, false),
            style: falsyStyle,
          });
        }
        // All cases are covered by the inner ternary, so no defaultStyle
        return { variants: innerVariants, defaultStyle: null };
      }

      return null;
    }

    const condInfo = parseConditionTest(ce.test);
    if (!condInfo) {
      return null;
    }

    // Ensure all conditions in the chain test the same property
    if (expectedPropName && condInfo.propName !== expectedPropName) {
      return null;
    }

    const consText = literalToString(ce.consequent);
    if (consText === null) {
      return null;
    }
    const consStyle = consText.trim() ? parseCssDeclarationBlock(consText) : null;

    // Recursively process the alternate branch
    const nested = extractVariantsFromTernary(ce.alternate, condInfo.propName);
    if (!nested) {
      return null;
    }

    const variants: VariantWithStyle[] = [];

    // Add the consequent as a variant
    if (consStyle) {
      variants.push({
        nameHint: buildNameHint(condInfo, true),
        when: buildWhenCondition(condInfo, true),
        style: consStyle,
      });
    }

    // Add nested variants, combining with outer condition's falsy branch
    // All nested variants are in the else branch, so they need the outer falsy guard.
    // This is always correct, even for enum chains where conditions are mutually exclusive.
    const outerFalsyCondition = buildWhenCondition(condInfo, false);
    for (const nestedVariant of nested.variants) {
      variants.push({
        ...nestedVariant,
        when: `${outerFalsyCondition} && ${nestedVariant.when}`,
      });
    }

    return { variants, defaultStyle: nested.defaultStyle };
  };

  // Extract variants from the ternary expression
  const result = extractVariantsFromTernary(body);
  if (!result) {
    return null;
  }

  const { variants, defaultStyle } = result;

  // For single-level ternaries with a non-empty default (alternate), add it as a variant
  // This handles cases like: props.$dim ? "opacity: 0.5;" : "opacity: 1;"
  if (defaultStyle && Object.keys(defaultStyle).length > 0) {
    // Need to determine the condition for the default branch
    if (variants.length > 0) {
      // Build the "else" condition by negating all positive conditions
      const allConditions = variants.map((v) => v.when).join(" || ");
      let defaultWhen = `!(${allConditions})`;

      // Normalize double negation: !(!prop) → prop
      // This happens when the original test was negated: !props.$x ? A : B
      // Without this, both variants would start with "!" and fall through the
      // lower-rules processing logic, silently dropping the styles.
      const firstVariant = variants[0];
      if (variants.length === 1 && firstVariant) {
        const singleWhen = firstVariant.when;
        // Check for simple negated prop (e.g., "!$open") without operators
        if (singleWhen.startsWith("!") && !singleWhen.includes(" ")) {
          defaultWhen = singleWhen.slice(1); // "!$open" → "$open"
        }
      }

      variants.push({
        nameHint: "default",
        when: defaultWhen,
        style: defaultStyle,
      });
    } else {
      // Handle case where truthy branch is empty: props.$x ? "" : "css"
      // The default style applies when the condition is false.
      // Parse the condition from the body to determine the falsy condition.
      const condInfo = parseConditionTest(body.test);
      if (condInfo) {
        const falsyWhen = buildWhenCondition(condInfo, false);
        variants.push({
          nameHint: "default",
          when: falsyWhen,
          style: defaultStyle,
        });
      }
    }
  }

  if (variants.length === 0) {
    return null;
  }

  return { type: "splitVariants", variants };
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
    ...(node.css.property === "box-shadow" || node.css.property === "boxShadow"
      ? { wrapValueInTemplateLiteral: true }
      : {}),
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
          "Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())",
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
        "Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())",
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
 * - `(props) => props.color` → simple param with member access
 * - `({ color }) => color` → shorthand destructuring
 * - `({ color: color_ }) => color_` → renamed destructuring
 * - `({ color = "red" }) => color` → destructuring with default (emits static base + dynamic override)
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

/**
 * Parses a template literal that contains a simple prop-based ternary expression.
 * Supports patterns like: `background: ${props.$primary ? "red" : "blue"}`
 *
 * Returns the static parts (prefix/suffix), the inner conditional's test node,
 * and the truthy/falsy values, or null if not a supported pattern.
 */
function parseCssTemplateLiteralWithTernary(node: unknown): {
  prefix: string;
  suffix: string;
  innerTest: unknown;
  truthyValue: string;
  falsyValue: string;
} | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    type?: string;
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
  };

  // Must be a TemplateLiteral with exactly 1 expression
  if (n.type !== "TemplateLiteral") {
    return null;
  }
  if (!n.expressions || n.expressions.length !== 1) {
    return null;
  }
  if (!n.quasis || n.quasis.length !== 2) {
    return null;
  }

  // Extract the static parts (quasis)
  const prefix = n.quasis[0]?.value?.cooked ?? n.quasis[0]?.value?.raw ?? "";
  const suffix = n.quasis[1]?.value?.cooked ?? n.quasis[1]?.value?.raw ?? "";

  // The expression must be a ConditionalExpression
  const expr = n.expressions[0] as ConditionalExpressionBody;
  if (!expr || expr.type !== "ConditionalExpression") {
    return null;
  }

  // Extract truthy and falsy values - they must be string literals
  const truthyValue = literalToString(expr.consequent);
  const falsyValue = literalToString(expr.alternate);
  if (truthyValue === null || falsyValue === null) {
    return null;
  }

  return { prefix, suffix, innerTest: expr.test, truthyValue, falsyValue };
}

function styleFromSingleDeclaration(
  property: string,
  value: string | number,
): Record<string, unknown> {
  const valueRaw = typeof value === "number" ? String(value) : value;
  const decl = {
    property,
    value: { kind: "static" as const, value: valueRaw },
    important: false,
    valueRaw,
  };
  const style: Record<string, unknown> = {};
  for (const out of cssDeclarationToStylexDeclarations(decl)) {
    // Keep numbers as numbers if the source literal was numeric (e.g. opacity: 1)
    style[out.prop] = typeof value === "number" ? value : coerceStaticCss(out.value);
  }
  return style;
}

function parseCssDeclarationBlock(cssText: string): Record<string, unknown> | null {
  // Very small parser for blocks like `transform: rotate(180deg); color: red;`
  // This is intentionally conservative: only supports static values.
  const chunks = cssText
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }

  const style: Record<string, unknown> = {};
  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m || !m[1] || !m[2]) {
      return null;
    }
    const property = m[1].trim();
    const valueRaw = m[2].trim();
    const decl = {
      property,
      value: { kind: "static" as const, value: valueRaw },
      important: false,
      valueRaw,
    };
    for (const out of cssDeclarationToStylexDeclarations(decl)) {
      style[out.prop] = coerceStaticCss(out.value);
    }
  }
  return style;
}

function coerceStaticCss(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const v = value as { kind?: string; value?: unknown };
  if (v.kind === "static" && typeof v.value === "string") {
    if (/^-?\d+(\.\d+)?$/.test(v.value)) {
      return Number(v.value);
    }
    return v.value;
  }
  return value;
}

/**
 * Parses a CSS declaration block where values may contain template expressions.
 * Input: "box-shadow: inset 0 0 0 1px ${$colors.primaryColor};"
 *
 * Returns the style object with property names mapped to their values.
 * Values containing ${...} are stored as template literal AST nodes.
 *
 * IMPORTANT - StyleX Shorthand Handling:
 * StyleX does NOT support CSS shorthand properties like `border`. They must be expanded
 * to longhand properties (borderWidth, borderStyle, borderColor). This function handles
 * border expansion via `expandBorderShorthandWithTemplateExpr`. When adding support for
 * new shorthand properties, follow the same pattern:
 * 1. Check for the shorthand property
 * 2. Use helpers from css-prop-mapping.ts (e.g., parseInterpolatedBorderStaticParts)
 * 3. Return expanded longhand properties
 *
 * @see cssDeclarationToStylexDeclarations in css-prop-mapping.ts for the authoritative
 *      list of shorthand properties that need expansion.
 */
function parseCssDeclarationBlockWithTemplateExpr(
  cssText: string,
  api: API,
): { styleObj: Record<string, unknown>; hasTemplateValues: boolean } | null {
  const j = api.jscodeshift;
  const chunks = cssText
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }

  const styleObj: Record<string, unknown> = {};
  let hasTemplateValues = false;

  for (const chunk of chunks) {
    const m = chunk.match(/^([^:]+):([\s\S]+)$/);
    if (!m || !m[1] || !m[2]) {
      return null;
    }
    const property = m[1].trim();
    const valueRaw = m[2].trim();

    // Check if value contains template expressions
    if (valueRaw.includes("${")) {
      hasTemplateValues = true;

      // Handle border shorthands specially - expand to longhand properties
      const borderMatch = property.match(/^border(-top|-right|-bottom|-left)?$/);
      if (borderMatch) {
        const expanded = expandBorderShorthandWithTemplateExpr(property, valueRaw, j);
        if (!expanded) {
          return null;
        }
        Object.assign(styleObj, expanded);
        continue;
      }

      // Bail on other shorthand properties with template expressions
      // StyleX doesn't support shorthands, and we can't safely expand these without
      // knowing the runtime value (e.g., margin: ${spacing} could be 1-4 values)
      if (isUnsupportedShorthandForTemplateExpr(property)) {
        return null;
      }

      // For non-shorthand properties, build a template literal AST node
      const templateAst = parseValueAsTemplateLiteral(valueRaw, j);
      if (!templateAst) {
        return null;
      }
      // Map CSS property to StyleX property
      const stylexProp = cssPropertyToStylexProp(property);
      styleObj[stylexProp] = templateAst;
    } else {
      // Static value - use existing logic
      const decl = {
        property,
        value: { kind: "static" as const, value: valueRaw },
        important: false,
        valueRaw,
      };
      for (const out of cssDeclarationToStylexDeclarations(decl)) {
        styleObj[out.prop] = coerceStaticCss(out.value);
      }
    }
  }

  return { styleObj, hasTemplateValues };
}

/**
 * Expands a border shorthand with template expressions into longhand properties.
 * Input: property="border", value="1px solid ${$colors.primaryColor}"
 * Output: { borderWidth: "1px", borderStyle: "solid", borderColor: <TemplateLiteral AST> }
 */
function expandBorderShorthandWithTemplateExpr(
  property: string,
  valueRaw: string,
  j: API["jscodeshift"],
): Record<string, unknown> | null {
  // Extract direction from property (e.g., "border-top" -> "Top")
  const borderMatch = property.match(/^border(-top|-right|-bottom|-left)?$/);
  if (!borderMatch) {
    return null;
  }
  const directionRaw = borderMatch[1] ?? "";
  const direction = directionRaw
    ? directionRaw.slice(1).charAt(0).toUpperCase() + directionRaw.slice(2)
    : "";

  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;

  // Extract static parts (prefix/suffix) around template expressions
  // For "1px solid ${color}", prefix="1px solid ", suffix=""
  const regex = /\$\{([^}]+)\}/g;
  let match;
  let prefix = "";
  let suffix = "";
  const expressions: Array<{ text: string; start: number; end: number }> = [];

  let lastIndex = 0;
  while ((match = regex.exec(valueRaw)) !== null) {
    if (expressions.length === 0) {
      prefix = valueRaw.slice(0, match.index);
    }
    expressions.push({
      text: (match[1] ?? "").trim(),
      start: match.index,
      end: regex.lastIndex,
    });
    lastIndex = regex.lastIndex;
  }
  suffix = valueRaw.slice(lastIndex);

  // Use existing helper to parse static parts
  const borderParts = parseInterpolatedBorderStaticParts({ prop: property, prefix, suffix });
  if (!borderParts) {
    // If we can't parse, bail
    return null;
  }

  const result: Record<string, unknown> = {};

  // Add static width/style if present
  if (borderParts.width) {
    result[widthProp] = borderParts.width;
  }
  if (borderParts.style) {
    result[styleProp] = borderParts.style;
  }

  // Build template literal for color (the dynamic part)
  // If there are expressions but no static prefix/suffix for them, the whole value is the color
  if (expressions.length > 0) {
    const colorTemplateAst = parseValueAsTemplateLiteralForColor(valueRaw, prefix, suffix, j);
    if (colorTemplateAst) {
      result[colorProp] = colorTemplateAst;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Builds a template literal AST for the color portion of a border value.
 * For "1px solid ${color}", returns just the template literal for "${color}".
 */
function parseValueAsTemplateLiteralForColor(
  fullValue: string,
  prefix: string,
  suffix: string,
  j: JSCodeshift,
): TemplateLiteral | null {
  // The color part is the value minus the static prefix/suffix (width/style tokens)
  // For simple cases like "1px solid ${color}", the color is just "${color}"
  // For "${color}" alone, return just that

  // Parse out expressions from fullValue, keeping only what's between prefix and suffix
  const regex = /\$\{([^}]+)\}/g;
  const quasis: Array<{ raw: string; cooked: string }> = [];
  const expressions: ExpressionKind[] = [];

  // Find where the prefix ends and extract remaining value
  const prefixTokens = prefix.trim().split(/\s+/).filter(Boolean);
  const fullTokens = fullValue.split(/\s+/);

  // Find the start of the dynamic part
  let dynamicStart = 0;
  for (let i = 0; i < prefixTokens.length && i < fullTokens.length; i++) {
    const fullToken = fullTokens[i];
    if (fullToken && fullToken === prefixTokens[i]) {
      dynamicStart += fullToken.length + 1; // +1 for space
    }
  }

  // Escape suffix for safe use in regex (handles special chars like $, ., etc.)
  const escapedSuffix = escapeRegex(suffix.trim());
  const dynamicPart = fullValue
    .slice(dynamicStart)
    .replace(new RegExp(`${escapedSuffix}$`), "")
    .trim();

  // Parse the dynamic part into template literal
  let lastIndex = 0;
  let match;
  regex.lastIndex = 0;

  while ((match = regex.exec(dynamicPart)) !== null) {
    const beforeExpr = dynamicPart.slice(lastIndex, match.index);
    quasis.push({ raw: beforeExpr, cooked: beforeExpr });

    const exprText = (match[1] ?? "").trim();
    const exprAst = parseSimpleExpression(exprText, j);
    if (!exprAst) {
      return null;
    }
    expressions.push(exprAst);
    lastIndex = regex.lastIndex;
  }

  const afterLast = dynamicPart.slice(lastIndex);
  quasis.push({ raw: afterLast, cooked: afterLast });

  if (expressions.length === 0) {
    return null;
  }

  const quasisAst = quasis.map((q, i) =>
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1),
  );

  return j.templateLiteral(quasisAst, expressions);
}

/**
 * Parses a value string containing ${...} expressions into a template literal AST.
 * Input: "inset 0 0 0 1px ${$colors.primaryColor}"
 * Output: TemplateLiteral AST node
 *
 * Note: Only handles simple dot-notation member expressions (e.g., "$colors.primaryColor").
 * More complex expressions (computed properties, function calls) are not supported and will
 * cause this function to return null.
 */
function parseValueAsTemplateLiteral(value: string, j: JSCodeshift): TemplateLiteral | null {
  // Split by ${...} patterns
  const regex = /\$\{([^}]+)\}/g;
  const quasis: Array<{ raw: string; cooked: string }> = [];
  const expressions: ExpressionKind[] = [];

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(value)) !== null) {
    // Add the static part before this expression
    const raw = value.slice(lastIndex, match.index);
    quasis.push({ raw, cooked: raw });

    // Add the expression (as an identifier for now - will be parsed later if needed)
    const exprText = (match[1] ?? "").trim();
    // Parse the expression text into AST
    // For simple cases like "$colors.primaryColor", create a member expression
    const exprAst = parseSimpleExpression(exprText, j);
    if (!exprAst) {
      return null;
    }
    expressions.push(exprAst);

    lastIndex = regex.lastIndex;
  }

  // Add the final static part
  const finalRaw = value.slice(lastIndex);
  quasis.push({ raw: finalRaw, cooked: finalRaw });

  // Build template literal AST
  const quasisAst = quasis.map((q, i) =>
    j.templateElement({ raw: q.raw, cooked: q.cooked }, i === quasis.length - 1),
  );

  return j.templateLiteral(quasisAst, expressions);
}

/**
 * Parses a simple expression string into AST.
 * Supports: identifiers and dot-notation member expressions like "$colors.primaryColor".
 *
 * Does NOT support:
 * - Computed properties: obj["key"]
 * - Function calls: fn()
 * - Operators: a + b
 */
function parseSimpleExpression(exprText: string, j: JSCodeshift): ExpressionKind | null {
  // Handle member expression like "$colors.primaryColor"
  const parts = exprText.split(".");
  if (parts.length === 0 || !parts[0]) {
    return null;
  }

  let ast: ExpressionKind = j.identifier(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part) {
      ast = j.memberExpression(ast, j.identifier(part));
    }
  }

  return ast;
}

/**
 * CSS shorthand properties that cannot be safely expanded when they contain template expressions.
 * StyleX doesn't support shorthands, and we can't determine how to expand these without
 * knowing the runtime value.
 *
 * Examples of why we bail:
 * - `margin: ${spacing}` - could be 1-4 values, can't know which directions
 * - `padding: ${p}` - same issue
 * - `background: ${bg}` - could be color or image, can't determine at compile time
 */
const UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR = new Set([
  "margin",
  "padding",
  "background",
  "scroll-margin",
]);

function isUnsupportedShorthandForTemplateExpr(property: string): boolean {
  return UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has(property);
}
