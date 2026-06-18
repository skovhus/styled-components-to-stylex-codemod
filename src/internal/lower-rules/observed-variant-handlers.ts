/**
 * Observed-variant emission handlers extracted from
 * handleInterpolatedDeclaration in rule-interpolated-declaration.ts.
 *
 * These closures emit StyleX variant buckets / style functions for props whose
 * concrete runtime values were observed at call sites. They are produced by a
 * factory so they can continue to share the mutable `flags.bail` holder and the
 * captured declaration state exactly as they did when inlined.
 */
import type { JSCodeshift } from "jscodeshift";
import type { CallResolveResult } from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  cssDeclarationToStylexDeclarations,
  isUnsupportedBackgroundShorthandValue,
} from "../css-prop-mapping.js";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getNodeLocStart,
} from "../utilities/jscodeshift-utils.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import { ensureShouldForwardPropDrop, markDeclNeedsUseThemeHook } from "./types.js";
import {
  evaluateLocalCallValueTransform,
  evaluateObservedDynamicExpression,
} from "./static-evaluator.js";
import { formatObservedVariantCondition } from "../utilities/prop-usage.js";
import {
  emitObservedVariantBuckets,
  resolveObservedVariantValues,
} from "./observed-variant-buckets.js";
import {
  buildTemplateWithStaticParts,
  collectDollarParamBindingIdentifiers,
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
  getImportedStylexIdentifiers,
  hasFunctionParamReferenceInArrowFn,
  hasThemeAccessInArrowFn,
  hasThemeReferenceInExpression,
  invokeKnownCurriedHelperBranchesWithPropsTheme,
  inlineArrowFunctionBody,
  normalizeDollarProps,
  rewritePropsReferencesToPropsWithTheme,
  rewritePropsThemeToThemeVar,
} from "./inline-styles.js";
import { extractUnionLiteralValues } from "./variants.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import { subtractLaterStaticOverrides } from "./directional-props.js";
import {
  numericIdentifierSetForJsxProp,
  printScalarizedExpression,
} from "./dynamic-helper-call.js";
import {
  applyBackgroundShorthandLayerReset,
  resolveRuntimeBackgroundStylexProp,
} from "./runtime-background.js";
import { hasAdjacentUnitInInterpolatedParts } from "./interpolated-calc.js";
import {
  buildObservedExpressionFallbackValueExpr,
  buildRuntimeObservedValueExpr,
  emitStaticObservedValue,
  getNumericCssEmissionMode,
  getSingleSlotStaticParts,
  isNumberLikeTsType,
  staticVariantStyleObject,
} from "./numeric-css-props.js";
import { extractGuardedDynamicBranch } from "./interpolated-decl-helpers.js";
import type {
  InterpolatedDeclarationContext,
  ResolveImportedValueExpr,
} from "./interpolated-declaration-context.js";

type ObservedVariantHandlersContext = Pick<
  InterpolatedDeclarationContext,
  | "ctx"
  | "rule"
  | "allRules"
  | "d"
  | "media"
  | "pseudos"
  | "pseudoElement"
  | "attrTarget"
  | "resolvedSelectorMedia"
> & {
  avoidNames: Set<string>;
  addResolverImports: (imports: Iterable<unknown> | undefined | null) => void;
  flags: { bail: boolean };
};

export function createObservedVariantHandlers(c: ObservedVariantHandlersContext) {
  const {
    ctx,
    rule,
    allRules,
    d,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    avoidNames,
    addResolverImports,
    flags,
  } = c;
  const {
    state,
    decl,
    observedVariantFallbackFns,
    styleFnFromProps,
    styleFnDecls,
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    isJsxPropOptional,
    applyVariant,
  } = ctx;
  const { j, filePath, warnings, resolverImports, importMap } = state;

  const getObservedStaticVariantValues = (jsxProp: string): Array<string | number> | null => {
    const usage = state.propUsageByComponent.get(decl.localName);
    const propUsage = usage?.props[jsxProp];
    if (!propUsage || propUsage.values.length < 2) {
      return null;
    }
    const values = propUsage.values.filter(
      (value: string | number | boolean): value is string | number =>
        typeof value === "string" || typeof value === "number",
    );
    if (values.length !== propUsage.values.length) {
      return null;
    }
    return values;
  };

  const observedNumericCssTextProps = new Set<string>();

  const tryHandleMultiSlotRuntimeValue = (
    resolveImportedValueExprArg: ResolveImportedValueExpr,
  ): boolean => {
    if (!d.property || d.value.kind !== "interpolated") {
      return false;
    }
    const cssProperty = d.property.trim();
    if (media || attrTarget || pseudos?.length || pseudoElement || resolvedSelectorMedia) {
      return false;
    }

    const parts = d.value.parts ?? [];
    const slotParts = parts.filter(
      (part: { kind?: string }): part is { kind: "slot"; slotId: number } => part.kind === "slot",
    );
    if (slotParts.length < 2) {
      return false;
    }
    if (
      cssProperty !== "background" &&
      cssProperty !== "background-image" &&
      cssProperty !== "box-shadow" &&
      cssProperty !== "transform"
    ) {
      return false;
    }
    const stylexDecls = cssDeclarationToStylexDeclarations(d);
    if (stylexDecls.length !== 1 || !stylexDecls[0]?.prop) {
      return false;
    }
    if (cssProperty === "background" && isUnsupportedBackgroundShorthandValue(d.valueRaw ?? "")) {
      state.bailUnsupported(
        decl,
        "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand",
      );
      return true;
    }

    const propsUsed = new Set<string>();
    const expressions: ExpressionKind[] = [];
    const quasis: Array<ReturnType<JSCodeshift["templateElement"]>> = [];
    let currentStaticPart = "";
    let needsTheme = false;

    for (let partIndex = 0; partIndex < parts.length; partIndex++) {
      const part = parts[partIndex]!;
      if (part.kind === "static") {
        currentStaticPart += part.value ?? "";
        continue;
      }
      if (part.kind !== "slot") {
        return false;
      }

      const rawExpr = decl.templateExpressions[part.slotId] as ExpressionKind | undefined;
      if (!rawExpr || rawExpr.type === "FunctionExpression") {
        return false;
      }

      let slotExpr: ExpressionKind | null =
        rawExpr.type === "ArrowFunctionExpression"
          ? inlineArrowFunctionBody(j, rawExpr)
          : (cloneAstNode(rawExpr) as ExpressionKind);
      if (!slotExpr) {
        return false;
      }

      const importedValueResolution = resolveImportedValueExprArg(slotExpr);
      if (importedValueResolution && "bail" in importedValueResolution) {
        return true;
      }
      if (importedValueResolution) {
        if (hasAdjacentUnitInInterpolatedParts(parts, partIndex)) {
          warnings.push({
            severity: "warning",
            type: "Unsupported interpolation: call expression",
            loc: getNodeLocStart(slotExpr) ?? decl.loc,
          });
          flags.bail = true;
          return true;
        }
        addResolverImports(importedValueResolution.imports);
        slotExpr = importedValueResolution.resolved;
      }

      if (rawExpr.type === "ArrowFunctionExpression") {
        for (const propName of collectPropsFromArrowFnDestructured(rawExpr)) {
          if (propName !== "theme") {
            propsUsed.add(propName);
          }
        }
        if (hasThemeAccessInArrowFn(rawExpr)) {
          needsTheme = true;
          slotExpr = rewritePropsThemeToThemeVar(slotExpr);
        }
      } else if (hasThemeReferenceInExpression(slotExpr)) {
        needsTheme = true;
      }

      quasis.push(j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, false));
      currentStaticPart = "";
      const importedStylexIdentifiers = getImportedStylexIdentifiers(importMap, resolverImports);
      const localDollarIdentifiers =
        rawExpr.type === "ArrowFunctionExpression"
          ? collectDollarParamBindingIdentifiers(rawExpr)
          : undefined;
      expressions.push(
        normalizeDollarProps(j, slotExpr, {
          skipIdentifiers: importedStylexIdentifiers,
          localDollarIdentifiers,
        }),
      );
    }

    quasis.push(j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, true));

    const valueExpr = j.templateLiteral(quasis, expressions) as ExpressionKind;
    const normalizedPropNames = [...propsUsed].map((propName) =>
      propName.startsWith("$") ? propName.slice(1) : propName,
    );
    const propsCallArg =
      normalizedPropNames.length > 0
        ? (j.objectExpression(
            normalizedPropNames.map((propName) => {
              const id = j.identifier(propName);
              const prop = j.property("init", id, id) as ReturnType<typeof j.property> & {
                shorthand?: boolean;
              };
              prop.shorthand = true;
              return prop;
            }),
          ) as ExpressionKind)
        : undefined;

    for (const out of stylexDecls) {
      if (!out.prop) {
        continue;
      }
      const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
      if (!styleFnDecls.has(fnKey)) {
        const params = [j.identifier("props")];
        if (needsTheme) {
          params.push(j.identifier("theme"));
        }
        const body = j.objectExpression([
          j.property("init", makeCssPropKey(j, out.prop), valueExpr),
        ]);
        styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
      }
      styleFnFromProps.push({
        fnKey,
        jsxProp: "__props" as const,
        condition: "always" as const,
        ...(propsCallArg ? { callArg: propsCallArg } : {}),
        ...(needsTheme
          ? {
              extraCallArgs: [
                {
                  jsxProp: "__helper" as const,
                  callArg: j.identifier("theme") as ExpressionKind,
                },
              ],
            }
          : {}),
      });
    }

    for (const propName of propsUsed) {
      ensureShouldForwardPropDrop(decl, propName);
    }
    if (needsTheme) {
      decl.needsUseThemeHook ??= [];
      if (!decl.needsUseThemeHook.some((entry) => entry.themeProp === "__runtime")) {
        decl.needsUseThemeHook.push({
          themeProp: "__runtime",
          trueStyleKey: null,
          falseStyleKey: null,
        });
      }
    }
    decl.needsWrapperComponent = true;
    return true;
  };

  /**
   * Try to convert an identity prop with a finite string union type into static variant
   * buckets. Returns true if the optimization applied and the caller should `continue`.
   * @param skipValue — For props with a default, the default value is handled as base style
   *   and should be skipped in the variant buckets.
   */
  const tryEmitIdentityVariantBuckets = (
    jsxProp: string,
    stylexProp: string,
    skipValue?: string | number,
  ): boolean => {
    const staticParts = getSingleSlotStaticParts(d, decl);
    if (!staticParts) {
      return false;
    }
    const propType = findJsxPropTsTypeForVariantExtraction(jsxProp);
    const unionValues = extractUnionLiteralValues(propType);
    const observedValues = unionValues ? null : getObservedStaticVariantValues(jsxProp);
    const hasStaticText = staticParts.prefix !== "" || staticParts.suffix !== "";
    if (
      observedValues &&
      observedValues.some((value) => typeof value === "number") &&
      getNumericCssEmissionMode(stylexProp) === "cssText" &&
      !hasStaticText
    ) {
      observedNumericCssTextProps.add(jsxProp);
      return false;
    }
    const values = unionValues ?? observedValues;
    if (!values || values.length < 2 || values.length > 20) {
      return false;
    }
    for (const value of values) {
      if (value === skipValue) {
        continue;
      }
      applyVariant(
        { when: formatObservedVariantCondition(jsxProp, value), propName: jsxProp },
        staticVariantStyleObject(
          stylexProp,
          emitStaticObservedValue(value, stylexProp, observedValues !== null, staticParts),
        ),
      );
    }
    if (observedValues) {
      const numericIdentifiers = numericIdentifierSetForJsxProp(jsxProp, ctx.findJsxPropTsType);
      const fallbackFnKey = ensureObservedVariantFallbackFn(jsxProp, stylexProp, (param) =>
        buildRuntimeObservedValueExpr(j, stylexProp, param, staticParts, numericIdentifiers),
      );
      if (fallbackFnKey) {
        observedVariantFallbackFns.set(jsxProp, fallbackFnKey);
        markStyleValueVariantProp(jsxProp);
      }
    }
    ensureObservedVariantPropDrop(jsxProp);
    return true;
  };

  const tryEmitTransformedObservedVariantBuckets = (
    jsxProp: string,
    stylexProp: string,
    valueTransform: CallValueTransform | undefined,
  ): boolean => {
    if (
      !valueTransform ||
      valueTransform.kind !== "call" ||
      valueTransform.resolvedExpr ||
      valueTransform.resolvedUsage ||
      media ||
      pseudos?.length
    ) {
      return false;
    }
    const observedValues = getObservedStaticVariantValues(jsxProp);
    if (!observedValues || observedValues.length < 2 || observedValues.length > 20) {
      return false;
    }

    const transformedValues: Array<{ propValue: string | number; cssValue: string | number }> = [];
    for (const propValue of observedValues) {
      const cssValue = evaluateLocalCallValueTransform({
        j,
        root: state.root,
        calleeName: valueTransform.calleeIdent,
        argValue: propValue,
      });
      if (typeof cssValue !== "string" && typeof cssValue !== "number") {
        return false;
      }
      transformedValues.push({ propValue, cssValue });
    }

    for (const { propValue, cssValue } of transformedValues) {
      applyVariant(
        { when: formatObservedVariantCondition(jsxProp, propValue), propName: jsxProp },
        {
          [stylexProp]: cssValue,
        },
      );
    }
    const fallbackFnKey = ensureObservedVariantFallbackFn(
      jsxProp,
      stylexProp,
      (param) =>
        j.callExpression(j.identifier(valueTransform.calleeIdent), [param]) as ExpressionKind,
    );
    if (!fallbackFnKey) {
      return false;
    }
    observedVariantFallbackFns.set(jsxProp, fallbackFnKey);
    markStyleValueVariantProp(jsxProp);
    ensureObservedVariantPropDrop(jsxProp);
    return true;
  };

  const tryEmitObservedExpressionVariantBuckets = (
    jsxProp: string,
    stylexProp: string,
    expression: ExpressionKind,
    paramName: string,
    conditionWhen: string,
    conditionProp: string,
    prefix: string,
    suffix: string,
  ): boolean => {
    if (media || pseudos?.length) {
      return false;
    }
    const observedValues = getObservedStaticVariantValues(jsxProp);
    if (!observedValues || observedValues.length < 2 || observedValues.length > 20) {
      return false;
    }

    const transformedValues: Array<{ propValue: string | number; cssValue: string | number }> = [];
    for (const propValue of observedValues) {
      const evaluatedValue = evaluateObservedDynamicExpression({
        j,
        root: state.root,
        expression,
        propName: jsxProp,
        propValue,
        paramName,
      });
      if (typeof evaluatedValue !== "string" && typeof evaluatedValue !== "number") {
        return false;
      }
      const cssValue =
        prefix || suffix ? `${prefix}${String(evaluatedValue)}${suffix}` : evaluatedValue;
      transformedValues.push({ propValue, cssValue });
    }

    const fallbackFnKey = observedExpressionFallbackFnKey(jsxProp, conditionWhen);
    const ensuredFallbackFnKey = ensureObservedVariantFallbackFn(
      jsxProp,
      stylexProp,
      (param) =>
        buildObservedExpressionFallbackValueExpr({
          j,
          expression,
          jsxProp,
          stylexProp,
          paramName,
          param,
          prefix,
          suffix,
        }),
      fallbackFnKey,
    );
    if (!ensuredFallbackFnKey) {
      return false;
    }
    if (
      !styleFnFromProps.some(
        (entry) =>
          entry.fnKey === ensuredFallbackFnKey &&
          entry.jsxProp === jsxProp &&
          entry.conditionWhen === conditionWhen,
      )
    ) {
      styleFnFromProps.push({
        fnKey: ensuredFallbackFnKey,
        jsxProp,
        conditionWhen,
      });
    }

    for (const { propValue, cssValue } of transformedValues) {
      const when = `${conditionWhen} && ${formatObservedVariantCondition(jsxProp, propValue)}`;
      applyVariant(
        { when, propName: jsxProp, allPropNames: [conditionProp, jsxProp] },
        {
          [stylexProp]: cssValue,
        },
      );
    }
    markStyleValueVariantProp(jsxProp);
    ensureObservedVariantPropDrop(jsxProp);
    return true;
  };

  const tryEmitObservedCssBlockVariantBuckets = (expr: unknown): boolean => {
    if (
      media ||
      pseudos?.length ||
      attrTarget ||
      resolvedSelectorMedia ||
      !expr ||
      typeof expr !== "object" ||
      ((expr as { type?: string }).type !== "ArrowFunctionExpression" &&
        (expr as { type?: string }).type !== "FunctionExpression")
    ) {
      return false;
    }
    if (hasThemeAccessInArrowFn(expr)) {
      return false;
    }
    const fnExpr = expr as Parameters<typeof getArrowFnSingleParamName>[0];
    const paramName = getArrowFnSingleParamName(fnExpr);
    const bodyExpr = getFunctionBodyExpr(fnExpr);
    if (!paramName || !bodyExpr) {
      return false;
    }
    const propsUsed = [
      ...new Set([
        ...collectPropsFromArrowFn(fnExpr),
        ...collectPropsFromArrowFnDestructured(fnExpr),
      ]),
    ];
    if (propsUsed.length !== 1) {
      return false;
    }
    const jsxProp = propsUsed[0]!;
    const componentUsage = state.propUsageByComponent.get(decl.localName);
    const observedValues = resolveObservedVariantValues({
      usage: componentUsage,
      propName: jsxProp,
      isOptional: isJsxPropOptional(jsxProp),
      isExported: state.exportedComponentNames.has(decl.localName),
      escapesAsValue: state.componentsUsedAsValue.has(decl.localName),
      minValues: 2,
    });
    if (!observedValues) {
      return false;
    }

    const bindings = getArrowFnParamBindings(fnExpr);
    const guarded = extractGuardedDynamicBranch(j, bodyExpr);
    const conditionWhen = guarded
      ? printScalarizedExpression({
          j,
          expr: guarded.test,
          paramName,
          propNames: propsUsed,
          ...(bindings ? { bindings } : {}),
        })
      : null;
    if (guarded && !conditionWhen) {
      return false;
    }

    return emitObservedVariantBuckets({
      decl,
      propName: jsxProp,
      observedValues,
      applyVariant,
      ensurePropDrop: ensureObservedVariantPropDrop,
      buildBucket: (propValue) => {
        const evaluatedValue = evaluateObservedDynamicExpression({
          j,
          root: state.root,
          expression: bodyExpr,
          propName: jsxProp,
          propValue,
          paramName,
        });
        if (typeof evaluatedValue !== "string") {
          return { kind: "bail" };
        }
        const cssText = evaluatedValue.trim();
        if (!cssText) {
          return { kind: "skip" };
        }
        const parsedStyle = parseCssDeclarationBlock(cssText);
        if (!parsedStyle || Object.keys(parsedStyle).length === 0) {
          return { kind: "bail" };
        }
        return {
          kind: "emit",
          style: parsedStyle,
          ...(conditionWhen ? { whenPrefix: conditionWhen } : {}),
        };
      },
    });
  };

  const observedExpressionFallbackFnKey = (jsxProp: string, conditionWhen: string): string => {
    const normalizedJsxProp = jsxProp.startsWith("$") ? jsxProp.slice(1) : jsxProp;
    const baseFnKey = styleKeyWithSuffix(decl.styleKey, normalizedJsxProp);
    const existingForCondition = styleFnFromProps.find(
      (entry) => entry.jsxProp === jsxProp && entry.conditionWhen === conditionWhen,
    );
    if (existingForCondition) {
      return existingForCondition.fnKey;
    }
    const baseKeyHasDifferentCondition = styleFnFromProps.some(
      (entry) =>
        entry.fnKey === baseFnKey &&
        entry.jsxProp === jsxProp &&
        entry.conditionWhen !== conditionWhen,
    );
    return baseKeyHasDifferentCondition ? styleKeyWithSuffix(baseFnKey, conditionWhen) : baseFnKey;
  };

  const ensureObservedVariantPropDrop = (jsxProp: string): void => {
    if (jsxProp.startsWith("$") || decl.base.kind !== "component") {
      ensureShouldForwardPropDrop(decl, jsxProp);
    }
  };

  const markStyleValueVariantProp = (jsxProp: string): void => {
    decl.styleValueVariantProps ??= new Set<string>();
    decl.styleValueVariantProps.add(jsxProp);
  };

  const ensureObservedVariantFallbackFn = (
    jsxProp: string,
    stylexProp: string,
    buildValueExpr: (param: ExpressionKind, paramName: string) => ExpressionKind | null,
    fnKeyOverride?: string,
  ): string | null => {
    const normalizedJsxProp = jsxProp.startsWith("$") ? jsxProp.slice(1) : jsxProp;
    const fnKey = fnKeyOverride ?? styleKeyWithSuffix(decl.styleKey, normalizedJsxProp);
    const paramName = cssPropertyToIdentifier(normalizedJsxProp || stylexProp, avoidNames);
    const valueExpr = buildValueExpr(j.identifier(paramName) as ExpressionKind, paramName);
    if (!valueExpr) {
      return null;
    }
    const property = j.property("init", makeCssPropKey(j, stylexProp), valueExpr);
    const existing = styleFnDecls.get(fnKey);
    if (
      existing?.type === "ArrowFunctionExpression" &&
      existing.body?.type === "ObjectExpression"
    ) {
      existing.body.properties.push(property);
      return fnKey;
    }
    if (!styleFnDecls.has(fnKey)) {
      const param = j.identifier(paramName);
      if (jsxProp !== "__props") {
        annotateParamFromJsxProp(param, jsxProp);
      }
      const body = j.objectExpression([property]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
    }
    return fnKey;
  };

  const shouldPreserveNumericCssTextForProp = (jsxProp: string, stylexProp: string): boolean => {
    return (
      (observedNumericCssTextProps.has(jsxProp) ||
        isNumberLikeTsType(findJsxPropTsType(jsxProp))) &&
      getNumericCssEmissionMode(stylexProp) === "cssText"
    );
  };

  const maybeEmitPreservedRuntimeCallOverride = (args: {
    resolveCallResult: CallResolveResult | undefined;
    originalExpr: unknown;
    loc: { line: number; column: number } | null | undefined;
    cssValueText?: string;
  }): "not-requested" | "emitted" | "suppressed" | "failed" => {
    const { resolveCallResult, originalExpr, loc, cssValueText } = args;
    if (
      !resolveCallResult ||
      !("preserveRuntimeCall" in resolveCallResult) ||
      !resolveCallResult.preserveRuntimeCall
    ) {
      return "not-requested";
    }
    if (!d.property) {
      warnings.push({
        severity: "error",
        type: "Unsupported interpolation: call expression",
        loc,
      });
      flags.bail = true;
      return "failed";
    }
    if (
      !originalExpr ||
      typeof originalExpr !== "object" ||
      ((originalExpr as { type?: string }).type !== "ArrowFunctionExpression" &&
        (originalExpr as { type?: string }).type !== "FunctionExpression")
    ) {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      flags.bail = true;
      return "failed";
    }

    const fnExpr = originalExpr as Parameters<typeof inlineArrowFunctionBody>[1];
    const inlinedExpr = inlineArrowFunctionBody(j, fnExpr);
    if (!inlinedExpr) {
      warnings.push({
        severity: "error",
        type: "Unsupported prop-based inline style expression cannot be safely inlined",
        loc,
      });
      flags.bail = true;
      return "failed";
    }

    const hasThemeAccess = hasThemeAccessInArrowFn(fnExpr);
    const usesFunctionParam = hasFunctionParamReferenceInArrowFn(fnExpr);
    let baseRuntimeExpr = inlinedExpr as ExpressionKind;
    if (hasThemeAccess) {
      baseRuntimeExpr = rewritePropsThemeToThemeVar(baseRuntimeExpr);
    }
    if (usesFunctionParam) {
      baseRuntimeExpr = rewritePropsReferencesToPropsWithTheme(j, baseRuntimeExpr);
      baseRuntimeExpr = invokeKnownCurriedHelperBranchesWithPropsTheme(j, baseRuntimeExpr);
    }
    const runtimeExprNeedsTheme = hasThemeReferenceInExpression(baseRuntimeExpr);

    // P1 fix: Wrap with static prefix/suffix and !important (same as static branch)
    const { prefix, suffix } = extractStaticPartsForDecl(d);
    const effectiveSuffix = d.important ? `${suffix} !important` : suffix;
    const runtimeCallArg =
      prefix || effectiveSuffix
        ? buildTemplateWithStaticParts(j, baseRuntimeExpr, prefix, effectiveSuffix)
        : baseRuntimeExpr;

    if (runtimeExprNeedsTheme) {
      markDeclNeedsUseThemeHook(decl);
    }

    const runtimeBackgroundProp =
      d.property === "background"
        ? resolveRuntimeBackgroundStylexProp(baseRuntimeExpr, cssValueText)
        : null;
    if (runtimeBackgroundProp === "unsupported") {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      flags.bail = true;
      return "failed";
    }

    const outs = runtimeBackgroundProp
      ? [{ prop: runtimeBackgroundProp }]
      : cssDeclarationToStylexDeclarations(d);
    if (outs.length !== 1 || !outs[0]?.prop) {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      flags.bail = true;
      return "failed";
    }

    const out = outs[0]!;
    const runtimeProp = out.prop;
    const runtimeStyle = { [runtimeProp]: runtimeCallArg } as Record<string, unknown>;
    if (runtimeBackgroundProp) {
      applyBackgroundShorthandLayerReset(j, runtimeStyle, runtimeBackgroundProp, d.important);
    }
    if (
      !subtractLaterStaticOverrides({
        rule,
        allRules,
        currentDecl: d,
        branchStyles: [runtimeStyle],
        ignoreUnsafeOverlaps: true,
      })
    ) {
      warnings.push({
        severity: "error",
        type: "Arrow function: helper call body is not supported",
        loc,
      });
      flags.bail = true;
      return "failed";
    }
    const runtimeProps = Object.keys(runtimeStyle);
    if (runtimeProps.length === 0) {
      return "suppressed";
    }

    const fnKey = styleKeyWithSuffix(decl.styleKey, runtimeProp);
    const outParamName = cssPropertyToIdentifier(runtimeProp, avoidNames);
    const param = j.identifier(outParamName);
    if (/\.(ts|tsx)$/.test(filePath)) {
      (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
        j.tsStringKeyword(),
      );
    }
    const body = j.objectExpression(
      Object.entries(runtimeStyle).map(([prop, value]) =>
        prop === runtimeProp
          ? makeCssProperty(j, runtimeProp, outParamName)
          : j.property(
              "init",
              makeCssPropKey(j, prop),
              cloneAstNode(value as ExpressionKind) as ExpressionKind,
            ),
      ),
    );
    styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));

    // P2 fix: Later declarations should override earlier ones (CSS source order).
    // Find and replace existing entry instead of skipping, or add new if not found.
    const existingIdx = styleFnFromProps.findIndex(
      (entry) =>
        entry.fnKey === fnKey && entry.jsxProp === "__props" && entry.condition === "always",
    );
    const newEntry = {
      fnKey,
      jsxProp: "__props" as const,
      condition: "always" as const,
      callArg: cloneAstNode(runtimeCallArg) as ExpressionKind,
      sourceOrder: ctx.allocateSourceOrder(),
    };
    if (existingIdx >= 0) {
      styleFnFromProps[existingIdx] = newEntry;
    } else {
      styleFnFromProps.push(newEntry);
    }

    decl.needsWrapperComponent = true;
    return "emitted";
  };

  return {
    tryHandleMultiSlotRuntimeValue,
    tryEmitIdentityVariantBuckets,
    tryEmitTransformedObservedVariantBuckets,
    tryEmitObservedExpressionVariantBuckets,
    tryEmitObservedCssBlockVariantBuckets,
    shouldPreserveNumericCssTextForProp,
    maybeEmitPreservedRuntimeCallOverride,
  };
}
