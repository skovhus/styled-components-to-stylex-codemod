/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import {
  callArgsFromNode,
  extractIndexedThemeLookupInfo,
} from "../builtin-handlers/resolver-utils.js";
import { cssDeclarationToStylexDeclarations, isCssShorthandProperty } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import {
  cloneAstNode,
  type ArrowFnParamBindings,
  extractRootAndPath,
  getArrowFnParamBindings,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isFunctionNode,
  isIdentifierNamed,
  isNumericTsType,
  patternBindsAnyName,
  resolveIdentifierToPropName,
} from "../utilities/jscodeshift-utils.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  buildStylexValueWithStaticParts,
  canOmitPxUnitForStylexNumber,
  hasThemeAccessInArrowFn,
  isNumericStylexExpression,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import { cssPropertyToIdentifier, makeCssPropKey } from "./shared.js";
import { ensureShouldForwardPropDrop, literalToStaticValue } from "./types.js";
import { isMemberExpression, mapAst } from "./utils.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import type { JSCodeshift } from "jscodeshift";
import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";

/**
 * Attempts to resolve an indexed theme lookup from an arrow function expression.
 * Pattern: `(props) => props.theme.color[props.$placeholderColor]`
 * Returns the resolved value expression and metadata, or null if not applicable.
 */
function tryResolveIndexedThemeForPseudoElement(
  expr: { type?: string },
  state: DeclProcessingState["state"],
): {
  valueExpr: ExpressionKind;
  indexPropName: string;
  paramName: string;
} | null {
  const { resolveValue, resolverImports, parseExpr, api } = state;
  const arrowExpr = expr as {
    type?: string;
    params?: Array<{ type?: string; name?: string }>;
    body?: unknown;
  };
  if (arrowExpr.type !== "ArrowFunctionExpression") {
    return null;
  }
  const paramName = arrowExpr.params?.[0]?.type === "Identifier" ? arrowExpr.params[0].name : null;
  if (!paramName) {
    return null;
  }

  const body = arrowExpr.body as { type?: string } | undefined;
  if (!body || body.type !== "MemberExpression") {
    return null;
  }

  const info = extractIndexedThemeLookupInfo(body, paramName);
  if (!info) {
    return null;
  }

  const resolved = resolveValue({
    kind: "theme",
    path: info.themeObjectPath,
    filePath: state.filePath,
    loc: getNodeLocStart(body as any) ?? undefined,
  });
  if (!resolved) {
    return null;
  }

  // Register theme imports
  if (resolved.imports) {
    for (const imp of resolved.imports) {
      resolverImports.set(
        JSON.stringify(imp),
        imp as typeof resolverImports extends Map<string, infer V> ? V : never,
      );
    }
  }

  // Build the indexed expression: resolvedExpr[paramName]
  const resolvedExprAst = parseExpr(resolved.expr);
  const safeParamName = buildSafeIndexedParamName(info.indexPropName, resolvedExprAst);
  const exprSource = `(${resolved.expr})[${safeParamName}]`;
  try {
    const jParse = api.jscodeshift.withParser("tsx");
    const program = jParse(`(${exprSource});`);
    const stmt = program.find(jParse.ExpressionStatement).nodes()[0];
    let parsedExpr = stmt?.expression ?? null;
    while (parsedExpr?.type === "ParenthesizedExpression") {
      parsedExpr = (parsedExpr as { expression: ExpressionKind }).expression;
    }
    // Remove extra.parenthesized flag that causes recast to add parentheses
    const exprWithExtra = parsedExpr as ExpressionKind & {
      extra?: { parenthesized?: boolean; parenStart?: number };
    };
    if (exprWithExtra?.extra?.parenthesized) {
      delete exprWithExtra.extra.parenthesized;
      delete exprWithExtra.extra.parenStart;
    }
    if (!parsedExpr) {
      return null;
    }
    return {
      valueExpr: parsedExpr as ExpressionKind,
      indexPropName: info.indexPropName,
      paramName: safeParamName,
    };
  } catch {
    return null;
  }
}

export function numericIdentifierSetForJsxProp(
  jsxProp: string,
  findJsxPropTsType: (propName: string) => unknown,
): ReadonlySet<string> {
  if (
    jsxProp === "__props" ||
    !isNumericTsType(findJsxPropTsType(jsxProp), { allowOptional: true })
  ) {
    return new Set();
  }
  const names = new Set([jsxProp]);
  if (jsxProp.startsWith("$")) {
    names.add(jsxProp.slice(1));
  }
  return names;
}

/**
 * Handles dynamic interpolations inside pseudo-elements (::before / ::after / ::placeholder)
 * by emitting a StyleX dynamic style function whose body wraps the value in the pseudo-element
 * selector. Also handles indexed theme lookups (e.g., props.theme.color[props.$bg]).
 *
 * Example transform:
 *   Input:  `&::after { background-color: ${(props) => props.$badgeColor}; }`
 *   Output: stylex.create →
 *             badgeAfterBackgroundColor: (backgroundColor: string) => ({
 *               "::after": { backgroundColor }
 *             })
 *           Usage → styles.badgeAfterBackgroundColor(badgeColor)
 *
 * Returns false for shapes it cannot handle (multi-slot interpolations,
 * theme access); callers fall through to other handlers.
 */
export function tryHandleDynamicPseudoElementStyleFunction(
  args: InterpolatedDeclarationContext,
): boolean {
  const { ctx, d, pseudoElement, pseudos, media } = args;
  const { state, decl, styleFnDecls, styleFnFromProps } = ctx;
  const {
    j,
    filePath,
    parseExpr,
    resolveCall,
    resolveImportForExpr,
    resolveImportInScope,
    resolverImports,
  } = state;
  const avoidNames = new Set(state.importMap.keys());
  const addResolverImports = (imports: Iterable<unknown> | undefined | null) => {
    if (!imports) {
      return;
    }
    for (const imp of imports) {
      resolverImports.set(
        JSON.stringify(imp),
        imp as typeof resolverImports extends Map<string, infer V> ? V : never,
      );
    }
  };

  if (!d.property || d.value.kind !== "interpolated" || !pseudoElement) {
    return false;
  }

  const parts: Array<{ kind?: string }> = d.value.parts ?? [];
  const slotParts = parts.filter((p): p is { kind: "slot"; slotId: number } => p.kind === "slot");

  if (slotParts.length !== 1) {
    return false;
  }

  const slotPart = slotParts[0]!;
  const expr = decl.templateExpressions[slotPart.slotId] as { type?: string } | undefined;
  if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
    return false;
  }

  // For indexed theme lookups (e.g., props.theme.color[props.$bg]), resolve the theme
  // reference and build the indexed expression so the function uses the resolved token.
  const indexedTheme = hasThemeAccessInArrowFn(expr)
    ? tryResolveIndexedThemeForPseudoElement(expr, state)
    : null;

  // Bail on non-indexed theme access (e.g., props.theme.color.primary) — handled elsewhere.
  if (hasThemeAccessInArrowFn(expr) && !indexedTheme) {
    return false;
  }

  // Bail on CSS shorthand properties for indexed theme lookups.
  // The indexed expression produces a single value that can't be expanded to longhands.
  if (indexedTheme && isCssShorthandProperty(d.property)) {
    return false;
  }

  // Bail when the interpolation has surrounding static text and it's an indexed theme lookup.
  // The indexed expression ($colors[param]) cannot be concatenated with a prefix.
  const { prefix, suffix } = extractStaticPartsForDecl(d);
  if (indexedTheme && (prefix || suffix)) {
    return false;
  }

  let inlineExpr: ExpressionKind;
  let propsUsed: Set<string>;
  let jsxProp: string;
  let isSimpleIdentity: boolean;
  let numericIdentifiers: ReadonlySet<string> = new Set();
  const stylexDecls = cssDeclarationToStylexDeclarations(d);
  const firstStylexProp = stylexDecls[0]?.prop ?? "";

  if (indexedTheme) {
    // Indexed theme: the value expression is the resolved indexed access (e.g., $colors[param]).
    inlineExpr = indexedTheme.valueExpr;
    propsUsed = new Set([indexedTheme.indexPropName]);
    jsxProp = indexedTheme.indexPropName;
    isSimpleIdentity = true;
  } else {
    const unwrapped = unwrapArrowFunctionToPropsExpr(j, expr);
    if (!unwrapped) {
      return false;
    }
    inlineExpr = unwrapped.expr;
    propsUsed = unwrapped.propsUsed;
    const candidateJsxProp = propsUsed.size === 1 ? [...propsUsed][0]! : "";
    numericIdentifiers = candidateJsxProp
      ? numericIdentifierSetForJsxProp(candidateJsxProp, ctx.findJsxPropTsType)
      : new Set();
    // Determine if the expression is a simple identity prop reference (e.g., just `badgeColor`)
    // vs a computed expression (e.g., `tipColor || "black"`, `size * 2`).
    isSimpleIdentity =
      propsUsed.size === 1 &&
      ((!prefix && !suffix) ||
        (canOmitPxUnitForStylexNumber(firstStylexProp, prefix, suffix) &&
          isNumericStylexExpression(inlineExpr, { numericIdentifiers }))) &&
      inlineExpr.type === "Identifier" &&
      propsUsed.has((inlineExpr as { name: string }).name);
    jsxProp = isSimpleIdentity ? [...propsUsed][0]! : "__props";
  }

  const pseudoLabel = pseudoElement.replace(/^:+/, "");
  const bindings =
    expr.type === "ArrowFunctionExpression"
      ? getArrowFnParamBindings(expr as Parameters<typeof getArrowFnParamBindings>[0])
      : null;
  const paramName = bindings?.kind === "simple" ? bindings.paramName : "props";

  for (const out of stylexDecls) {
    if (!out.prop) {
      continue;
    }
    const fnKey = styleKeyWithSuffix(styleKeyWithSuffix(decl.styleKey, pseudoLabel), out.prop);
    let helperCallArgs: DynamicHelperCallArgument[] = [];
    let needsOriginalParam = false;
    const valueExpr: ExpressionKind =
      prefix || suffix
        ? buildStylexValueWithStaticParts(
            j,
            inlineExpr,
            prefix,
            suffix,
            out.prop,
            false,
            undefined,
            numericIdentifiers,
          )
        : inlineExpr;
    if (!styleFnDecls.has(fnKey)) {
      const styleValueExpr = cloneAstNode(valueExpr) as ExpressionKind;
      if (!indexedTheme && bindings) {
        const helperResolution = resolveHelperCallsInDynamicValue({
          j,
          expr: styleValueExpr,
          cssProperty: out.prop,
          paramName,
          bindings,
          allowedPropIdentifiers: propsUsed,
          resolveImportForExpr,
          resolveImportInScope,
          resolveCall,
          parseExpr,
          filePath,
          loc: null,
          addResolverImports,
        });
        if (helperResolution === null) {
          return false;
        }
        helperCallArgs = dedupeDynamicHelperCallArguments(helperResolution.args);
      }
      needsOriginalParam =
        helperCallArgs.length > 0 && containsIdentifier(styleValueExpr, paramName);
      // Build parameter name — for indexed theme use the resolved param name,
      // for simple identity use the prop name (without $) for cleaner call sites.
      const outParamName = indexedTheme
        ? indexedTheme.paramName
        : helperCallArgs.length > 0
          ? helperCallArgs[0]!.paramName
          : isSimpleIdentity && jsxProp.startsWith("$")
            ? jsxProp.slice(1)
            : cssPropertyToIdentifier(out.prop, avoidNames);
      const paramNames =
        helperCallArgs.length > 0
          ? [
              ...(needsOriginalParam ? [paramName] : []),
              ...helperCallArgs.map((resolution) => resolution.paramName),
            ]
          : [outParamName];
      const params = paramNames.map((name) => j.identifier(name));
      const param = params[0]!;

      if (indexedTheme) {
        // Use the JSX prop's own type annotation (e.g., Color) when available.
        const propTsType = ctx.findJsxPropTsType(jsxProp);
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          propTsType && typeof propTsType === "object" && (propTsType as { type?: string }).type
            ? (propTsType as ReturnType<typeof j.tsStringKeyword>)
            : j.tsStringKeyword(),
        );
      } else if (helperCallArgs.length > 0) {
        for (const helperParam of params.slice(needsOriginalParam ? 1 : 0)) {
          if (/\.(ts|tsx)$/.test(filePath)) {
            (helperParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
              j.tsStringKeyword(),
            );
          }
        }
      } else if (isSimpleIdentity && jsxProp !== "__props") {
        ctx.annotateParamFromJsxProp(param, jsxProp);
      } else if (/\.(ts|tsx)$/.test(filePath)) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsStringKeyword(),
        );
      }

      // For indexed theme, use the resolved indexed expression directly.
      // For other cases, use the parameter name (potentially wrapped with pseudo/media).
      const innerValueExpr = indexedTheme
        ? (cloneAstNode(indexedTheme.valueExpr) as ExpressionKind)
        : helperCallArgs.length > 0
          ? styleValueExpr
          : j.identifier(outParamName);
      const innerValue = buildPseudoMediaPropValue({
        j,
        valueExpr: innerValueExpr,
        pseudos,
        media,
      });
      const innerPropKey = makeCssPropKey(j, out.prop);
      const innerProp = j.property("init", innerPropKey, innerValue) as ReturnType<
        typeof j.property
      > & { shorthand?: boolean };
      if (
        innerPropKey.type === "Identifier" &&
        innerValue.type === "Identifier" &&
        innerPropKey.name === (innerValue as { name: string }).name
      ) {
        innerProp.shorthand = true;
      }
      const innerObj = j.objectExpression([innerProp]);
      const outerProp = j.property("init", j.literal(pseudoElement), innerObj);
      const body = j.objectExpression([outerProp]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
    }

    if (isSimpleIdentity) {
      const isOptional = indexedTheme ? false : ctx.isJsxPropOptional(jsxProp);
      styleFnFromProps.push({
        fnKey,
        jsxProp,
        ...(isOptional ? {} : { condition: "always" as const }),
      });
    } else {
      if (helperCallArgs.length > 0 && !needsOriginalParam) {
        needsOriginalParam = containsIdentifier(styleFnDecls.get(fnKey), paramName);
      }
      const firstHelperCallArg = needsOriginalParam ? undefined : helperCallArgs[0];
      const extraHelperCallArgs = needsOriginalParam ? helperCallArgs : helperCallArgs.slice(1);
      styleFnFromProps.push({
        fnKey,
        jsxProp: "__props" as const,
        condition: "always" as const,
        callArg: firstHelperCallArg
          ? firstHelperCallArg.callArg
          : (cloneAstNode(valueExpr) as ExpressionKind),
        ...(extraHelperCallArgs.length > 0
          ? {
              extraCallArgs: extraHelperCallArgs.map((resolution) => ({
                jsxProp: "__props" as const,
                callArg: resolution.callArg,
              })),
            }
          : {}),
      });
    }
  }

  for (const propName of propsUsed) {
    ensureShouldForwardPropDrop(decl, propName);
  }

  decl.needsWrapperComponent = true;
  return true;
}

type DynamicHelperCallContext = {
  j: JSCodeshift;
  expr: ExpressionKind;
  cssProperty: string;
  paramName: string;
  bindings?: ArrowFnParamBindings;
  allowedPropIdentifiers?: ReadonlySet<string>;
  resolveImportForExpr: (expr: unknown, localName: string) => ImportMeta | null;
  resolveImportInScope: (localName: string, identNode?: unknown) => ImportMeta | null;
  resolveCall: InterpolatedDeclarationContext["ctx"]["state"]["resolveCall"];
  parseExpr: (expr: string) => unknown;
  filePath: string;
  loc: { line: number; column: number } | null;
  addResolverImports: (imports: Iterable<unknown> | undefined | null) => void;
};

export type DynamicHelperCallArgument = {
  callArg: ExpressionKind;
  paramName: string;
};

export function scalarizePropsObjectDynamicValue(args: {
  j: JSCodeshift;
  valueExpr: ExpressionKind;
  paramName: string;
  propNames: readonly string[];
  bindings?: ArrowFnParamBindings;
}): { valueExpr: ExpressionKind; paramNames: string[] } | null {
  const propNames = uniqueScalarPropNames(args.propNames);
  if (propNames.length === 0) {
    return null;
  }
  if (expressionContainsStringFragment(args.valueExpr, "var(")) {
    return null;
  }

  const propParams = new Map(propNames.map((propName) => [propName, propName]));
  const bindingNames = scalarReplacementBindingNames(args.bindings, propNames);
  bindingNames.add(args.paramName);
  if (expressionContainsFunctionBindingName(args.valueExpr, bindingNames)) {
    return null;
  }
  const rewritten = mapAst(cloneAstNode(args.valueExpr), (node, recurse) => {
    if (isMemberExpression(node)) {
      const object = node.object as { type?: string; name?: string } | undefined;
      const property = node.property as { type?: string; name?: string } | undefined;
      if (
        object?.type === "Identifier" &&
        object.name === args.paramName &&
        property?.type === "Identifier" &&
        node.computed === false
      ) {
        const paramName = propParams.get(property.name ?? "");
        if (paramName) {
          return args.j.identifier(paramName);
        }
      }
      node.object = recurse(node.object) as typeof node.object;
      if (node.computed) {
        node.property = recurse(node.property) as typeof node.property;
      }
      return node;
    }

    if (isObjectPropertyLike(node)) {
      if (node.computed) {
        node.key = recurse(node.key) as typeof node.key;
      }
      node.value = recurse(node.value) as typeof node.value;
      return node;
    }

    if (args.bindings?.kind === "destructured" && node.type === "Identifier") {
      const propName = args.bindings.bindings.get(node.name as string);
      const paramName = propName ? propParams.get(propName) : undefined;
      if (paramName) {
        return args.j.identifier(paramName);
      }
    }

    return undefined;
  }) as ExpressionKind;

  if (containsIdentifier(rewritten, args.paramName)) {
    return null;
  }
  return { valueExpr: rewritten, paramNames: propNames };
}

export function scalarStyleFnEntryFromProps(args: {
  j: JSCodeshift;
  fnKey: string;
  propNames: readonly string[];
  conditionWhen?: string;
  sourceOrder?: number;
}): NonNullable<StyledDecl["styleFnFromProps"]>[number] | null {
  const propNames = uniqueScalarPropNames(args.propNames);
  const [jsxProp, ...extraProps] = propNames;
  if (!jsxProp) {
    return null;
  }
  return {
    fnKey: args.fnKey,
    jsxProp,
    callArg: args.j.identifier(jsxProp) as ExpressionKind,
    ...(args.conditionWhen
      ? { conditionWhen: args.conditionWhen }
      : { condition: "always" as const }),
    ...(args.sourceOrder !== undefined ? { sourceOrder: args.sourceOrder } : {}),
    forceScalarArgs: true,
    ...(extraProps.length > 0
      ? {
          extraCallArgs: extraProps.map((propName) => ({
            jsxProp: propName,
            callArg: args.j.identifier(propName) as ExpressionKind,
          })),
        }
      : {}),
  };
}

export function printScalarizedExpression(args: {
  j: JSCodeshift;
  expr: ExpressionKind;
  paramName: string;
  propNames: readonly string[];
  bindings?: ArrowFnParamBindings;
}): string | null {
  const scalar = scalarizePropsObjectDynamicValue({
    j: args.j,
    valueExpr: args.expr,
    paramName: args.paramName,
    propNames: args.propNames,
    ...(args.bindings ? { bindings: args.bindings } : {}),
  });
  const expr = scalar?.valueExpr ?? args.expr;
  try {
    return args.j(expr).toSource();
  } catch {
    return null;
  }
}

function uniqueScalarPropNames(propNames: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const propName of propNames) {
    if (propName === "theme" || seen.has(propName) || !isValidStyleFnParamName(propName)) {
      continue;
    }
    seen.add(propName);
    result.push(propName);
  }
  return result;
}

function isValidStyleFnParamName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

export function styleFnParamNameForJsxProp(
  jsxProp: string,
  stylexProp: string,
  avoidNames: Set<string>,
): string {
  return jsxProp !== "__props" &&
    !jsxProp.startsWith("$") &&
    jsxProp !== "className" &&
    isValidStyleFnParamName(jsxProp)
    ? jsxProp
    : cssPropertyToIdentifier(stylexProp, avoidNames);
}

export function scalarCallArgForParamName(
  j: JSCodeshift,
  jsxProp: string,
  paramName: string,
  renamedJsxProp?: string,
): ExpressionKind | undefined {
  const effectiveJsxProp = renamedJsxProp ?? jsxProp;
  return jsxProp !== "__props" && effectiveJsxProp !== paramName && isValidStyleFnParamName(jsxProp)
    ? (j.identifier(jsxProp) as ExpressionKind)
    : undefined;
}

function expressionContainsStringFragment(node: unknown, fragment: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((item) => expressionContainsStringFragment(item, fragment));
  }
  const record = node as Record<string, unknown>;
  if (
    (typeof record.value === "string" && record.value.includes(fragment)) ||
    (typeof record.raw === "string" && record.raw.includes(fragment)) ||
    (typeof record.cooked === "string" && record.cooked.includes(fragment))
  ) {
    return true;
  }
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    if (expressionContainsStringFragment(record[key], fragment)) {
      return true;
    }
  }
  return false;
}

function isObjectPropertyLike(
  node: Record<string, unknown>,
): node is Record<string, unknown> & { computed?: boolean; key?: unknown; value?: unknown } {
  return node.type === "Property" || node.type === "ObjectProperty";
}

function scalarReplacementBindingNames(
  bindings: ArrowFnParamBindings | undefined,
  propNames: readonly string[],
): Set<string> {
  const names = new Set<string>();
  if (bindings?.kind !== "destructured") {
    return names;
  }
  const props = new Set(propNames);
  for (const [bindingName, propName] of bindings.bindings) {
    if (props.has(propName)) {
      names.add(bindingName);
    }
  }
  return names;
}

function expressionContainsFunctionBindingName(node: unknown, names: ReadonlySet<string>): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((item) => expressionContainsFunctionBindingName(item, names));
  }

  const record = node as Record<string, unknown>;
  if (isFunctionNode(record)) {
    const params = record.params;
    if (Array.isArray(params) && params.some((param) => patternBindsAnyName(param, names))) {
      return true;
    }
  }

  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    if (expressionContainsFunctionBindingName(record[key], names)) {
      return true;
    }
  }
  return false;
}

type DynamicHelperCallResult = {
  value: ExpressionKind;
  binding: DynamicHelperCallArgument;
};

type DynamicHelperCallResolution = {
  expr: ExpressionKind;
  args: DynamicHelperCallArgument[];
};

type StyledHelperCall =
  | {
      kind: "curried";
      innerCall: CallExpressionLike;
      dynamicArg: ExpressionKind;
      outerArg: ExpressionKind;
    }
  | {
      kind: "direct";
      innerCall: CallExpressionLike;
      dynamicArg: ExpressionKind;
    };

type ImportMeta = {
  importedName: string;
  source: { kind: "absolutePath"; value: string } | { kind: "specifier"; value: string };
};

type CallExpressionLike = {
  type: "CallExpression";
  callee?: unknown;
  arguments?: unknown[];
};

export function resolveHelperCallsInDynamicValue(
  ctx: DynamicHelperCallContext,
): DynamicHelperCallResolution | null {
  if (!ctx.expr || typeof ctx.expr !== "object") {
    return { expr: ctx.expr, args: [] };
  }

  let failed = false;
  const resolutions: DynamicHelperCallArgument[] = [];
  const registeredBindings = new Map<string, Array<{ callArgKey: string; paramName: string }>>();
  const registerBinding = (
    binding: DynamicHelperCallArgument,
  ): { binding: DynamicHelperCallArgument; isNew: boolean } => {
    const callArgKey = astShapeKey(binding.callArg);
    const existing = registeredBindings.get(binding.paramName) ?? [];
    const sameArg = existing.find((entry) => entry.callArgKey === callArgKey);
    if (sameArg) {
      return {
        binding: { ...binding, paramName: sameArg.paramName },
        isNew: false,
      };
    }

    let paramName = binding.paramName;
    if (existing.length > 0) {
      let suffix = existing.length + 1;
      const used = new Set(existing.map((entry) => entry.paramName));
      do {
        paramName = `${binding.paramName}${suffix}`;
        suffix++;
      } while (used.has(paramName));
    }

    existing.push({ callArgKey, paramName });
    registeredBindings.set(binding.paramName, existing);
    return {
      binding: { ...binding, paramName },
      isNew: true,
    };
  };
  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== "object" || failed) {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(visit);
    }

    const record = node as Record<string, unknown>;
    if (record.type === "CallExpression") {
      if (isUnsupportedCurriedHelperCall(record as CallExpressionLike, ctx)) {
        failed = true;
        return node;
      }
      const resolved = tryResolveDynamicHelperCall(record as CallExpressionLike, ctx);
      if (resolved === null) {
        failed = true;
        return node;
      }
      if (resolved) {
        const registered = registerBinding(resolved.binding);
        if (registered.isNew) {
          resolutions.push(registered.binding);
        }
        return ctx.j.identifier(registered.binding.paramName);
      }
      const directResolved = tryResolveDirectHelperCall(record as CallExpressionLike, ctx);
      if (directResolved === null) {
        failed = true;
        return node;
      }
      if (directResolved) {
        const registered = registerBinding(directResolved.binding);
        if (registered.isNew) {
          resolutions.push(registered.binding);
        }
        return ctx.j.identifier(registered.binding.paramName);
      }
    }

    for (const key of Object.keys(record)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const value = record[key];
      if (value && typeof value === "object") {
        record[key] = visit(value);
      }
    }
    return node;
  };

  const expr = visit(ctx.expr) as ExpressionKind;
  if (failed) {
    return null;
  }
  return { expr, args: resolutions };
}

function astShapeKey(node: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (key, value) => {
    if (
      key === "loc" ||
      key === "comments" ||
      key === "tokens" ||
      key === "start" ||
      key === "end"
    ) {
      return undefined;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  });
}

function isUnsupportedCurriedHelperCall(
  callExpr: CallExpressionLike,
  ctx: DynamicHelperCallContext,
): boolean {
  if (!callExpr.callee || typeof callExpr.callee !== "object") {
    return false;
  }
  if ((callExpr.callee as { type?: string }).type !== "CallExpression") {
    return false;
  }

  const innerCall = callExpr.callee as CallExpressionLike;
  const calleeInfo = extractRootAndPath(innerCall.callee);
  if (!calleeInfo) {
    return false;
  }
  const imp = ctx.resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode);
  if (!imp) {
    return false;
  }

  const innerArgs = innerCall.arguments ?? [];
  const outerArgs = callExpr.arguments ?? [];
  return (
    innerArgs.length !== 1 ||
    outerArgs.length !== 1 ||
    !isIdentifierNamed(outerArgs[0] as ExpressionKind, ctx.paramName)
  );
}

function tryResolveDynamicHelperCall(
  callExpr: CallExpressionLike,
  ctx: DynamicHelperCallContext,
): DynamicHelperCallResult | false | null {
  const helperCall = getStyledHelperCall(callExpr);
  if (!helperCall) {
    return false;
  }
  if (helperCall.kind === "curried" && !isIdentifierNamed(helperCall.outerArg, ctx.paramName)) {
    return null;
  }

  const { innerCall, dynamicArg } = helperCall;
  const calleeInfo = extractRootAndPath(innerCall.callee);
  if (!calleeInfo) {
    return false;
  }

  const imp = ctx.resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode);
  if (!imp) {
    return false;
  }

  const result = ctx.resolveCall({
    callSiteFilePath: ctx.filePath,
    calleeImportedName: imp.importedName,
    calleeSource: imp.source,
    args: callArgsFromNode(innerCall.arguments),
    ...(calleeInfo.path.length > 0 ? { calleeMemberPath: calleeInfo.path } : {}),
    ...(ctx.loc ? { loc: ctx.loc } : {}),
    cssProperty: ctx.cssProperty,
  });
  if (!result || !("expr" in result)) {
    return false;
  }

  const dynamicProp = unwrapParamMemberArg(
    ctx.j,
    dynamicArg,
    ctx.paramName,
    ctx.bindings,
    ctx.allowedPropIdentifiers,
  );
  if (!dynamicProp) {
    return false;
  }

  const resolvedExpr = ctx.parseExpr(result.expr) as ExpressionKind | null;
  if (!resolvedExpr) {
    return null;
  }

  ctx.addResolverImports(result.imports);
  const helperValue =
    result.dynamicArgUsage === "memberAccess"
      ? ctx.j.memberExpression(resolvedExpr, dynamicProp.arg, true)
      : ctx.j.callExpression(resolvedExpr, [dynamicProp.arg]);

  const paramName =
    helperCall.kind === "curried"
      ? `resolved${helperNameSuffix(calleeInfo)}${capitalizeIdentifier(dynamicProp.propName)}`
      : `${helperNameSuffix(calleeInfo, { lowerFirst: true })}${capitalizeIdentifier(dynamicProp.propName)}`;
  return {
    value: ctx.j.identifier(paramName),
    binding: {
      callArg: helperValue as ExpressionKind,
      paramName,
    },
  };
}

function tryResolveDirectHelperCall(
  callExpr: CallExpressionLike,
  ctx: DynamicHelperCallContext,
): DynamicHelperCallResult | false | null {
  const calleeInfo = extractRootAndPath(callExpr.callee);
  if (!calleeInfo) {
    return false;
  }

  const imp = ctx.resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode);
  if (!imp) {
    return false;
  }

  const result = ctx.resolveCall({
    callSiteFilePath: ctx.filePath,
    calleeImportedName: imp.importedName,
    calleeSource: imp.source,
    args: callArgsFromNode(callExpr.arguments),
    ...(calleeInfo.path.length > 0 ? { calleeMemberPath: calleeInfo.path } : {}),
    ...(ctx.loc ? { loc: ctx.loc } : {}),
    cssProperty: ctx.cssProperty,
  });
  if (!result || !("expr" in result)) {
    return false;
  }

  const args = callExpr.arguments ?? [];
  if (args.length !== 1) {
    return false;
  }

  const dynamicProp = unwrapParamMemberArg(
    ctx.j,
    args[0] as ExpressionKind,
    ctx.paramName,
    ctx.bindings,
    ctx.allowedPropIdentifiers,
  );
  if (!dynamicProp) {
    return false;
  }

  const resolvedExpr = ctx.parseExpr(result.expr) as ExpressionKind | null;
  if (!resolvedExpr) {
    return null;
  }

  ctx.addResolverImports(result.imports);
  const paramName = `${helperNameSuffix(calleeInfo, {
    lowerFirst: true,
  })}${capitalizeIdentifier(dynamicProp.propName)}`;
  return {
    value: ctx.j.identifier(paramName),
    binding: {
      callArg:
        result.dynamicArgUsage === "memberAccess"
          ? ctx.j.memberExpression(resolvedExpr, dynamicProp.arg, true)
          : ctx.j.callExpression(resolvedExpr, [dynamicProp.arg]),
      paramName,
    },
  };
}

function getStyledHelperCall(callExpr: CallExpressionLike): StyledHelperCall | null {
  if (callExpr.callee && typeof callExpr.callee === "object") {
    const callee = callExpr.callee as { type?: string };
    if (callee.type === "CallExpression") {
      const innerCall = callExpr.callee as CallExpressionLike;
      const innerArgs = innerCall.arguments ?? [];
      const outerArgs = callExpr.arguments ?? [];
      if (innerArgs.length !== 1 || outerArgs.length !== 1) {
        return null;
      }
      return {
        kind: "curried",
        innerCall,
        dynamicArg: innerArgs[0] as ExpressionKind,
        outerArg: outerArgs[0] as ExpressionKind,
      };
    }
  }

  const args = callExpr.arguments ?? [];
  if (args.length !== 1) {
    return null;
  }
  return {
    kind: "direct",
    innerCall: callExpr,
    dynamicArg: args[0] as ExpressionKind,
  };
}

type NullishLogicalExpression = ExpressionKind & {
  type: "LogicalExpression";
  operator: "??";
  left: ExpressionKind;
  right: ExpressionKind;
};

function isNullishLogicalExpression(arg: ExpressionKind): arg is NullishLogicalExpression {
  return arg?.type === "LogicalExpression" && (arg as { operator?: unknown }).operator === "??";
}

function unwrapParamMemberArg(
  j: JSCodeshift,
  arg: ExpressionKind,
  paramName: string,
  bindings?: ArrowFnParamBindings,
  allowedPropIdentifiers?: ReadonlySet<string>,
): { arg: ExpressionKind; propName: string } | null {
  if (isNullishLogicalExpression(arg)) {
    const left = unwrapParamMemberArg(j, arg.left, paramName, bindings, allowedPropIdentifiers);
    if (!left || literalToStaticValue(arg.right) === null) {
      return null;
    }
    return {
      arg: j.logicalExpression("??", left.arg, cloneAstNode(arg.right)),
      propName: left.propName,
    };
  }
  if (bindings?.kind === "destructured") {
    const propName = resolveIdentifierToPropName(arg, bindings);
    if (propName) {
      return {
        arg: {
          type: "Identifier",
          name: propName,
        } as ExpressionKind,
        propName,
      };
    }
  }
  if (
    arg?.type === "Identifier" &&
    arg.name !== paramName &&
    (allowedPropIdentifiers?.has(arg.name) ?? false)
  ) {
    return {
      arg: cloneAstNode(arg) as ExpressionKind,
      propName: arg.name,
    };
  }
  if (arg?.type !== "MemberExpression" && arg?.type !== "OptionalMemberExpression") {
    return null;
  }
  const parts = getMemberPathFromIdentifier(arg as any, paramName);
  const propName = parts?.[0];
  if (!parts || parts.length !== 1 || !propName) {
    return null;
  }
  return {
    arg: j.identifier(propName),
    propName,
  };
}

export function dedupeDynamicHelperCallArguments(
  args: DynamicHelperCallArgument[],
): DynamicHelperCallArgument[] {
  const result: DynamicHelperCallArgument[] = [];
  const seen = new Set<string>();
  for (const arg of args) {
    const key = arg.paramName;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(arg);
  }
  return result;
}

export function containsIdentifier(node: unknown, name: string): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (Array.isArray(node)) {
    return node.some((item) => containsIdentifier(item, name));
  }
  const record = node as Record<string, unknown>;
  if (record.type === "Identifier" && record.name === name) {
    return true;
  }
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    if (containsIdentifier(record[key], name)) {
      return true;
    }
  }
  return false;
}

function helperNameSuffix(
  calleeInfo: { rootName: string; path: string[] },
  opts: { lowerFirst?: boolean } = {},
): string {
  const parts = [calleeInfo.rootName, ...calleeInfo.path].filter(Boolean);
  const suffix = parts.map(capitalizeIdentifier).join("");
  if (!opts.lowerFirst || !suffix) {
    return suffix;
  }
  return suffix.charAt(0).toLowerCase() + suffix.slice(1);
}

function capitalizeIdentifier(name: string): string {
  const normalized = name.startsWith("$") ? name.slice(1) : name;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}
