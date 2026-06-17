/**
 * Handles interpolated CSS declarations during rule processing.
 * Core concepts: resolve dynamic values, map StyleX props, and emit wrappers.
 */
import type { JSCodeshift } from "jscodeshift";
import { dirname, resolve as pathResolve } from "node:path";
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type {
  CallResolveContext,
  CallResolveResult,
  ExprWithImports,
  ImportSpec,
  ResolveValueContext,
} from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { LocalStylexVarRef, StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  isCssShorthandProperty,
  isUnsupportedStylexProperty,
  isUnsupportedBackgroundShorthandValue,
  parseBorderShorthandParts,
  resolveBackgroundStylexProp,
} from "../css-prop-mapping.js";
import { expandBorderRadiusShorthandValue } from "../css-border-radius.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import { camelToKebabCase } from "../utilities/string-utils.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import {
  cloneAstNode,
  type ArrowFnParamBindings,
  collectIdentifiers,
  extractRootAndPath,
  getArrowFnParamBindings,
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getSinglePropFromMemberExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  resolveIdentifierToPropName,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { isRelativeSpecifier } from "../utilities/path-utils.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { tryHandleAnimation } from "./animation.js";
import { tryHandleInterpolatedBorder } from "./borders.js";
import {
  extractStaticPartsForDecl,
  type ResolveImportedValueOptions,
  tryHandleInterpolatedStringValue,
  wrapExprWithStaticParts,
} from "./interpolations.js";
import {
  ensureShouldForwardPropDrop,
  literalToStaticValue,
  markDeclNeedsUseThemeHook,
} from "./types.js";
import {
  evaluateLocalCallValueTransform,
  evaluateObservedDynamicExpression,
} from "./static-evaluator.js";
import { formatObservedVariantCondition } from "../utilities/prop-usage.js";
import {
  emitObservedVariantBuckets,
  resolveObservedVariantValues,
} from "./observed-variant-buckets.js";

type ArrowFunctionParams = Parameters<JSCodeshift["arrowFunctionExpression"]>[0];

import {
  buildTemplateWithStaticParts,
  buildStylexValueWithStaticParts,
  canOmitPxUnitForStylexNumber,
  collectDollarParamBindingIdentifiers,
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
  getImportedStylexIdentifiers,
  getNumericImportedStylexIdentifiers,
  hasFunctionParamReferenceInArrowFn,
  hasThemeAccessInArrowFn,
  hasThemeReferenceInExpression,
  hasUnsupportedConditionalTest,
  invokeKnownCurriedHelperBranchesWithPropsTheme,
  inlineArrowFunctionBody,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexValue,
  normalizeDollarProps,
  rewritePropsReferencesToPropsWithTheme,
  rewritePropsThemeToThemeVar,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { addStyleKeyMixin, trackMixinPropertyValues } from "./precompute.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  handleDualBranchCompoundVariantsResolvedValue,
  handleSplitMultiPropVariantsResolvedValue,
  handleSplitVariantsResolvedValue,
} from "./interpolated-variant-resolvers.js";
import { handleInlineStyleValueFromProps } from "./inline-style-props.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { findCssVarCallsInString } from "../css-vars.js";
import { stylexVarMemberExpression } from "../transform-css-vars.js";
import { extractUnionLiteralValues } from "./variants.js";
import {
  cssValueToJs,
  normalizeCssContentValue,
  toStyleKey,
  styleKeyWithSuffix,
} from "../transform/helpers.js";
import { LOGICAL_TO_PHYSICAL, SHORTHAND_LONGHANDS } from "../stylex-shorthands.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import { isMemberExpression, mapAst } from "./utils.js";
import {
  callArgsFromNode,
  extractIndexedThemeLookupInfo,
} from "../builtin-handlers/resolver-utils.js";
type CommentSource = { leading?: string; leadingLine?: string; trailingLine?: string } | null;
type ResolvedImportedValue = {
  resolved: ExpressionKind;
  imports?: ImportSpec[];
  skipStaticWrap?: boolean;
};
type ImportedValueResolution = ResolvedImportedValue | { bail: true } | null;
type ResolveImportedValueExpr = (
  expr: any,
  options?: ResolveImportedValueOptions,
) => ImportedValueResolution;

type InterpolatedDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  allRules: readonly CssRuleIR[];
  d: CssDeclarationIR;
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  hasAncestorAttributeScope: boolean;
  applyResolvedPropValue: (
    prop: string,
    value: unknown,
    commentSource: CommentSource,
    sourceCssProperty?: string,
  ) => void;
};
export function handleInterpolatedDeclaration(args: InterpolatedDeclarationContext): void {
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
    hasAncestorAttributeScope,
    applyResolvedPropValue,
  } = args;
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    variantBuckets,
    variantStyleKeys,
    variantSourceOrder,
    observedVariantFallbackFns,
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    cssHelperPropValues,
    tryHandleMappedFunctionColor,
    tryHandleLogicalOrDefault,
    tryHandleConditionalPropCoalesceWithTheme,
    tryHandleEnumIfChainValue,
    tryHandleThemeIndexedLookup,
    handlerContext,
    componentInfo,
    tryHandlePropertyTernaryTemplateLiteral,
    tryHandleCssHelperFunctionSwitchBlock,
    tryHandleCssHelperConditionalBlock,
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    isJsxPropOptional,
    applyVariant,
    getBaseStyleTarget,
    notifyResolvedStylesArg,
  } = ctx;
  const hasStaticPropsBeforeResolvedStylesArg = (): boolean =>
    Object.keys(styleObj).length > 0 || getBaseStyleTarget() !== styleObj;
  const annotateScalarParams = (params: unknown[], propNames: readonly string[]): void => {
    if (!/\.(ts|tsx)$/.test(filePath)) {
      return;
    }
    propNames.forEach((propName, paramIndex) => {
      const param = params[paramIndex];
      if (!param) {
        return;
      }
      annotateParamFromJsxProp(param, propName);
      if (isJsxPropOptional(propName)) {
        addUndefinedToParamType(j, param);
      }
    });
  };
  const {
    api,
    j,
    filePath,
    warnings,
    resolverImports,
    keyframesNames,
    parseExpr,
    resolveValue,
    resolveCall,
    importMap,
    cssHelperNames,
    cssHelperObjectMembers,
    declByLocalName,
    cssHelperValuesByKey,
    staticPropertyValues,
    staticIdentifierValues,
    warnPropInlineStyle,
    applyCssHelperMixin,
    hasLocalThemeBinding,
    resolveThemeValue,
    resolveThemeValueFromFn,
    getOrCreateLocalStylexVar,
    resolveImportInScope,
    resolveImportForExpr,
  } = state;
  const avoidNames = new Set(importMap.keys());

  if (state.bail) {
    return;
  }
  if (d.value.kind !== "interpolated") {
    return;
  }
  if (d.property && isUnsupportedStylexProperty(d.property)) {
    state.bailUnsupported(
      decl,
      `Unsupported CSS property "${d.property}" cannot be emitted in StyleX`,
    );
    return;
  }

  let bail = false;
  const getRootIdentifierInfo = extractRootAndPath;
  const bailUnsupportedLocal = (declArg: StyledDecl, type: WarningType) => {
    bail = true;
    state.bailUnsupported(declArg, type);
  };
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

  /** Parse and store extra className expressions (from CSS modules) on the decl. */
  const collectExtraClassNames = (entries: ExprWithImports[]) => {
    decl.extraClassNames ??= [];
    for (const cn of entries) {
      addResolverImports(cn.imports);
      const cnExpr = parseExpr(cn.expr);
      if (cnExpr) {
        decl.extraClassNames.push({ expr: cnExpr as any });
      }
    }
  };

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
          bail = true;
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
  }): "not-requested" | "emitted" | "failed" => {
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
      bail = true;
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
      bail = true;
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
      bail = true;
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
      bail = true;
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
      bail = true;
      return "failed";
    }

    const out = outs[0]!;
    const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
    if (!styleFnDecls.has(fnKey)) {
      const outParamName = cssPropertyToIdentifier(out.prop, avoidNames);
      const param = j.identifier(outParamName);
      if (/\.(ts|tsx)$/.test(filePath)) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsStringKeyword(),
        );
      }
      const body = j.objectExpression([makeCssProperty(j, out.prop, outParamName)]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
    }

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

  for (let _i = 0; _i < 1; _i++) {
    if (bail) {
      break;
    }
    if (tryHandleMappedFunctionColor(d)) {
      continue;
    }
    if (
      tryHandleAnimation({
        j,
        decl,
        d,
        keyframesNames,
        keyframesAliases: state.keyframesAliases,
        styleObj,
        styleFnDecls,
        styleFnFromProps,
        filePath,
        avoidNames,
        applyResolvedPropValue,
        bailUnsupportedUnknownVar: () =>
          bailUnsupportedLocal(
            decl,
            "animation shorthand contains a var() with no classifiable fallback — its longhand position cannot be determined statically; bind the variable to a specific longhand (e.g. animation-duration: var(--x)) instead",
          ),
      })
    ) {
      continue;
    }
    if (bail) {
      break;
    }
    if (isPseudoElementSelector(pseudoElement)) {
      if (tryHandleDynamicPseudoElementStyleFunction(args)) {
        continue;
      }
    }
    if (
      tryHandleInterpolatedBorder(
        {
          api,
          j,
          filePath,
          decl,
          extraStyleObjects,
          hasLocalThemeBinding,
          resolveValue,
          resolveCall,
          importMap,
          resolverImports,
          parseExpr,
          variantBuckets,
          variantStyleKeys,
          inlineStyleProps,
          hasStaticPropsBeforeResolvedStylesArg,
          notifyResolvedStylesArg,
        },
        {
          d,
          selector: rule.selector,
          atRuleStack: rule.atRuleStack ?? [],
          applyResolvedPropValue: (prop, value) => applyResolvedPropValue(prop, value, null),
          bailUnsupported: (type) => bailUnsupportedLocal(decl, type),
          bailUnsupportedWithContext: (type, context, loc) => {
            warnings.push({
              severity: "error",
              type,
              loc: loc ?? decl.loc,
              context,
            });
            bail = true;
          },
        },
      )
    ) {
      continue;
    }
    const tryHandleThemeValueInPseudo = (): boolean => {
      if (!pseudos?.length || !d.property) {
        return false;
      }
      const slotPart = (d.value as any).parts?.find((p: any) => p.kind === "slot");
      if (!slotPart || slotPart.kind !== "slot") {
        return false;
      }
      const expr = decl.templateExpressions[slotPart.slotId] as any;
      if (!expr) {
        return false;
      }
      const resolved =
        (expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
          ? resolveThemeValueFromFn(expr)
          : resolveThemeValue(expr)) ?? null;
      if (!resolved) {
        return false;
      }
      // Preserve static text surrounding the interpolation slot (e.g. "0 0 0 1px ${theme} , ...")
      const { prefix, suffix } = extractStaticPartsForDecl(d);
      const finalValue = buildTemplateWithStaticParts(
        j,
        resolved as ExpressionKind,
        prefix,
        suffix,
        {
          rawCss: decl.rawCss,
          property: (d.property ?? "").trim(),
          stylisValueRaw: d.valueRaw ?? "",
        },
      );
      // When pseudoElement is also set (e.g., ::-webkit-slider-thumb:hover),
      // delegate to applyResolvedPropValue which correctly scopes the pseudo-class
      // within the pseudo-element's nested selector bucket.
      if (pseudoElement) {
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          applyResolvedPropValue(
            out.prop,
            maybeOmitPxUnitFromStylexValue(j, finalValue, out.prop, d.important),
            null,
          );
        }
        return true;
      }
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        perPropPseudo[out.prop] ??= {};
        const existing = perPropPseudo[out.prop]!;
        if (!("default" in existing)) {
          const existingVal = (styleObj as Record<string, unknown>)[out.prop];
          if (existingVal !== undefined) {
            existing.default = existingVal;
          } else if (cssHelperPropValues.has(out.prop)) {
            // Use the css helper's value as the default
            const helperVal = cssHelperPropValues.get(out.prop);
            if (
              helperVal &&
              typeof helperVal === "object" &&
              "__cssHelperDynamicValue" in helperVal
            ) {
              // Dynamic value - need to resolve from already-processed css helper
              const helperDecl = (helperVal as { decl?: StyledDecl }).decl;
              if (helperDecl) {
                const resolvedHelper = state.resolvedStyleObjects.get(
                  toStyleKey(helperDecl.localName),
                );
                if (resolvedHelper && typeof resolvedHelper === "object") {
                  existing.default = (resolvedHelper as Record<string, unknown>)[out.prop] ?? null;
                } else {
                  existing.default = null;
                }
              } else {
                existing.default = null;
              }
            } else {
              existing.default = helperVal;
            }
          } else {
            existing.default = null;
          }
        }
        for (const ps of pseudos) {
          existing[ps] = maybeOmitPxUnitFromStylexValue(j, finalValue, out.prop, d.important);
        }
      }
      return true;
    };
    if (tryHandleThemeValueInPseudo()) {
      continue;
    }
    // Create a resolver for embedded call expressions in compound CSS values.
    const resolveCallExpr = (expr: any): { resolved: any; imports?: any[] } | null => {
      if (expr?.type !== "CallExpression") {
        return null;
      }
      const res = resolveDynamicNode(
        {
          slotId: 0,
          expr,
          css: {
            kind: "declaration",
            selector: rule.selector,
            atRuleStack: rule.atRuleStack,
            ...(d.property ? { property: d.property } : {}),
            valueRaw: d.valueRaw,
          },
          component: componentInfo,
          usage: { jsxUsages: 0, hasPropsSpread: false },
        },
        {
          ...handlerContext,
          resolveImport: (localName: string, identNode?: unknown) =>
            resolveImportInScope(localName, identNode),
        },
      );
      if (res && res.type === "resolvedValue") {
        const exprAst = parseExpr(res.expr);
        if (exprAst) {
          return { resolved: exprAst, imports: res.imports };
        }
      }
      return null;
    };
    const allowCssCalcForImportedArithmetic = isEntireInterpolatedValueSingleSlot(d, decl);
    const resolveImportedValueExpr: ResolveImportedValueExpr = (
      expr,
      options = allowCssCalcForImportedArithmetic,
    ) => {
      const allowCssCalc = typeof options === "boolean" ? options : (options.allowCssCalc ?? false);
      const cssCalcUnit = typeof options === "boolean" ? undefined : options.cssCalcUnit;
      const forceNegate = typeof options === "boolean" ? false : options.negate === true;
      const resolveChildExpression = (child: any): ImportedValueResolution =>
        resolveImportedValueExpr(child, false);
      const isBailResolution = (result: ImportedValueResolution): result is { bail: true } =>
        Boolean(result && "bail" in result);
      const resolvedOrOriginal = (
        result: ImportedValueResolution,
        original: ExpressionKind,
      ): ExpressionKind => (result && !isBailResolution(result) ? result.resolved : original);
      const skipStaticWrap = (...results: ImportedValueResolution[]): boolean =>
        results.some((result) => result && !isBailResolution(result) && result.skipStaticWrap);
      const mergeImports = (...results: ImportedValueResolution[]): ImportSpec[] =>
        results.flatMap((result) =>
          result && !isBailResolution(result) ? (result.imports ?? []) : [],
        );
      const bailResolvedUnitExpression = (exprArg: any): { bail: true } => {
        warnings.push({
          severity: "warning",
          type: "Unsupported interpolation: call expression",
          loc: getNodeLocStart(exprArg) ?? decl.loc,
        });
        bail = true;
        return { bail: true };
      };
      const singleSlotStaticParts = getSingleSlotStaticParts(d, decl);
      const canFoldUnitSuffix =
        !!singleSlotStaticParts &&
        singleSlotStaticParts.prefix === "" &&
        singleSlotStaticParts.suffix !== "" &&
        /^-?(?:[a-zA-Z%]+)$/.test(singleSlotStaticParts.suffix);
      const resolveUnitBranch = (
        result: ImportedValueResolution,
        original: ExpressionKind,
      ): ExpressionKind | null => {
        if (result && !isBailResolution(result)) {
          return result.resolved;
        }
        const staticValue = literalToStaticValue(original);
        if (typeof staticValue === "number" && singleSlotStaticParts) {
          return j.literal(`${staticValue}${singleSlotStaticParts.suffix}`) as ExpressionKind;
        }
        return null;
      };

      if (expr?.type === "BinaryExpression") {
        const leftResult = resolveChildExpression(expr.left);
        const rightResult = resolveChildExpression(expr.right);
        if (!leftResult && !rightResult) {
          return null;
        }
        if (isBailResolution(leftResult)) {
          return leftResult;
        }
        if (isBailResolution(rightResult)) {
          return rightResult;
        }
        const resolvedLeft = resolvedOrOriginal(leftResult, expr.left);
        const resolvedRight = resolvedOrOriginal(rightResult, expr.right);
        const imports = mergeImports(leftResult, rightResult);
        if (allowCssCalc && isCssCalcOperator(expr.operator)) {
          const staticParts = singleSlotStaticParts ?? { prefix: "", suffix: "" };
          const calcUnit = cssCalcUnit ?? staticParts.suffix;
          const hasNegativePrefix =
            !cssCalcUnit &&
            staticParts.prefix === "-" &&
            /^-?(?:[a-zA-Z%]+)$/.test(staticParts.suffix) &&
            (expr.operator === "+" || expr.operator === "-");
          if (staticParts.prefix && !hasNegativePrefix && !cssCalcUnit) {
            warnings.push({
              severity: "warning",
              type: "Unsupported interpolation: call expression",
              loc: getNodeLocStart(expr) ?? decl.loc,
            });
            bail = true;
            return { bail: true };
          }
          const calcExpr = buildCssCalcTemplateExpression({
            j,
            operator: expr.operator,
            unit: expr.operator === "+" || expr.operator === "-" ? calcUnit : "",
            negate: forceNegate || hasNegativePrefix,
            staticIdentifierValues,
            left: { node: resolvedLeft, allowExpression: Boolean(leftResult) },
            right: { node: resolvedRight, allowExpression: Boolean(rightResult) },
          });
          if (calcExpr) {
            return {
              resolved: calcExpr,
              imports,
              skipStaticWrap: calcUnit !== "",
            };
          }
          if (calcUnit && imports.length > 0) {
            return bailResolvedUnitExpression(expr);
          }
        }
        return {
          resolved: j.binaryExpression(expr.operator, resolvedLeft, resolvedRight),
          imports,
        };
      }
      if (expr?.type === "UnaryExpression") {
        const argumentResult = resolveChildExpression(expr.argument);
        if (!argumentResult) {
          return null;
        }
        if (isBailResolution(argumentResult)) {
          return argumentResult;
        }
        if (canFoldUnitSuffix) {
          if (expr.operator !== "-") {
            return bailResolvedUnitExpression(expr);
          }
          return {
            resolved: j.templateLiteral(
              [
                j.templateElement({ raw: "calc(-1 * ", cooked: "calc(-1 * " }, false),
                j.templateElement({ raw: ")", cooked: ")" }, true),
              ],
              [argumentResult.resolved],
            ) as ExpressionKind,
            imports: argumentResult.imports,
            skipStaticWrap: true,
          };
        }
        return {
          resolved: j.unaryExpression(expr.operator, argumentResult.resolved, expr.prefix),
          imports: argumentResult.imports,
          skipStaticWrap: argumentResult.skipStaticWrap,
        };
      }
      if (expr?.type === "ConditionalExpression") {
        const testResult = resolveChildExpression(expr.test);
        const consequentResult = resolveImportedValueExpr(expr.consequent, canFoldUnitSuffix);
        const alternateResult = resolveImportedValueExpr(expr.alternate, canFoldUnitSuffix);
        if (!testResult && !consequentResult && !alternateResult) {
          return null;
        }
        if (isBailResolution(testResult)) {
          return testResult;
        }
        if (isBailResolution(consequentResult)) {
          return consequentResult;
        }
        if (isBailResolution(alternateResult)) {
          return alternateResult;
        }
        if (testResult) {
          return bailResolvedUnitExpression(expr.test);
        }
        if (canFoldUnitSuffix) {
          const consequent = resolveUnitBranch(consequentResult, expr.consequent);
          const alternate = resolveUnitBranch(alternateResult, expr.alternate);
          if (!consequent || !alternate) {
            return bailResolvedUnitExpression(expr);
          }
          return {
            resolved: j.conditionalExpression(
              resolvedOrOriginal(testResult, expr.test),
              consequent,
              alternate,
            ),
            imports: mergeImports(testResult, consequentResult, alternateResult),
            skipStaticWrap: true,
          };
        }
        return {
          resolved: j.conditionalExpression(
            resolvedOrOriginal(testResult, expr.test),
            resolvedOrOriginal(consequentResult, expr.consequent),
            resolvedOrOriginal(alternateResult, expr.alternate),
          ),
          imports: mergeImports(testResult, consequentResult, alternateResult),
          skipStaticWrap:
            canFoldUnitSuffix || skipStaticWrap(testResult, consequentResult, alternateResult),
        };
      }
      if (expr?.type === "LogicalExpression") {
        const leftResult = resolveChildExpression(expr.left);
        const rightResult = resolveImportedValueExpr(expr.right, canFoldUnitSuffix);
        if (!leftResult && !rightResult) {
          return null;
        }
        if (isBailResolution(leftResult)) {
          return leftResult;
        }
        if (isBailResolution(rightResult)) {
          return rightResult;
        }
        if (canFoldUnitSuffix) {
          const left = resolveUnitBranch(leftResult, expr.left);
          const right = resolveUnitBranch(rightResult, expr.right);
          if (!left || !right) {
            return bailResolvedUnitExpression(expr);
          }
          return {
            resolved: j.logicalExpression(expr.operator, left, right),
            imports: mergeImports(leftResult, rightResult),
            skipStaticWrap: true,
          };
        }
        return {
          resolved: j.logicalExpression(
            expr.operator,
            resolvedOrOriginal(leftResult, expr.left),
            resolvedOrOriginal(rightResult, expr.right),
          ),
          imports: mergeImports(leftResult, rightResult),
          skipStaticWrap: canFoldUnitSuffix || skipStaticWrap(leftResult, rightResult),
        };
      }
      if (expr?.type === "TemplateLiteral") {
        let didResolve = false;
        const imports: any[] = [];
        const expressions: any[] = [];
        const expressionResults: ImportedValueResolution[] = [];
        const templateExpressions = expr.expressions ?? [];
        for (let index = 0; index < templateExpressions.length; index++) {
          const templateExpr = templateExpressions[index];
          const expressionResult = resolveChildExpression(templateExpr);
          expressionResults.push(expressionResult);
          if (isBailResolution(expressionResult)) {
            return expressionResult;
          }
          if (expressionResult) {
            if (hasAdjacentTemplateUnit(expr.quasis ?? [], index)) {
              return bailResolvedUnitExpression(templateExpr);
            }
            didResolve = true;
            imports.push(...(expressionResult.imports ?? []));
            expressions.push(expressionResult.resolved);
          } else {
            expressions.push(templateExpr);
          }
        }
        if (!didResolve) {
          return null;
        }
        return {
          resolved: j.templateLiteral(expr.quasis, expressions),
          imports,
          skipStaticWrap: skipStaticWrap(...expressionResults),
        };
      }
      if (expr?.type === "CallExpression") {
        const calleeInfo = extractRootAndPath(expr.callee);
        const imp = calleeInfo
          ? resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode)
          : null;
        if (!imp) {
          return null;
        }
        const resolvedCall = resolveCallExpr(expr);
        if (resolvedCall) {
          if (!cssCalcUnit) {
            return resolvedCall;
          }
          // A bare unitless literal (e.g. a helper resolving to `8`/`"8"`) does
          // not carry the authored unit. Fold the unit into the literal so it is
          // preserved (e.g. `${space()}px` -> "8px") rather than emitting a
          // unitless value or `calc(-1 * 8)`. Any leading negation is applied by
          // the static-prefix handling downstream, so emit the positive value.
          const literalValue = literalToStaticValue(resolvedCall.resolved);
          const numericLiteral =
            typeof literalValue === "number"
              ? literalValue
              : typeof literalValue === "string" &&
                  literalValue.trim() !== "" &&
                  Number.isFinite(Number(literalValue))
                ? Number(literalValue)
                : null;
          if (numericLiteral !== null) {
            return {
              resolved: j.literal(`${numericLiteral}${cssCalcUnit}`) as ExpressionKind,
              imports: resolvedCall.imports,
              skipStaticWrap: true,
            };
          }
          if (forceNegate) {
            return {
              resolved: buildNegatedCssTokenTemplate(j, resolvedCall.resolved),
              imports: resolvedCall.imports,
              skipStaticWrap: true,
            };
          }
          return { ...resolvedCall, skipStaticWrap: true };
        }
        warnings.push({
          severity: "warning",
          type: "Adapter resolveCall returned undefined for helper call",
          loc: getNodeLocStart(expr) ?? decl.loc,
          context: {
            localName: decl.localName,
            importedName: imp.importedName,
            source: imp.source.value,
          },
        });
        bail = true;
        return { bail: true };
      }
      const info = getRootIdentifierInfo(expr);
      if (!info) {
        return null;
      }
      const imp = resolveImportInScope(info.rootName, info.rootNode);
      if (!imp) {
        return null;
      }
      const resolveValueContext: ResolveValueContext = {
        kind: "importedValue",
        importedName: imp.importedName,
        source: imp.source,
        ...(info.path.length ? { path: info.path.join(".") } : {}),
        filePath,
        loc: getNodeLocStart(expr) ?? undefined,
      };
      const resolveValueResult = resolveValue(resolveValueContext);
      if (!resolveValueResult) {
        // Adapter returned undefined for an identified imported value - bail.
        // A bare identifier from a relative, non-`.stylex` module is a plain
        // owned constant: the StyleX compiler can't resolve it inside
        // `stylex.create()`, and inlining it would silently destroy the shared
        // source of truth. Bail with actionable guidance to relocate it into a
        // `.stylex` defineConsts/defineVars group (member access / package
        // imports keep the generic message — defineConsts may not apply).
        const isPlainOwnedConstant =
          info.path.length === 0 &&
          imp.source.kind === "absolutePath" &&
          !isStylexImportSource(imp.source.value);
        warnings.push({
          severity: "error",
          type: isPlainOwnedConstant
            ? "Imported constant cannot be referenced inside stylex.create() — move it into a `.stylex` defineConsts/defineVars group (or map it via adapter.resolveValue)"
            : "Adapter resolveValue returned undefined for imported value",
          loc: getNodeLocStart(expr) ?? decl.loc,
          context: {
            localName: decl.localName,
            importedName: imp.importedName,
            source: imp.source.value,
            path: info.path.length ? info.path.join(".") : undefined,
          },
        });
        bail = true;
        return { bail: true };
      }
      if (!isStylexImportSource(imp.source.value) && hasRuntimeImport(resolveValueResult.imports)) {
        warnings.push({
          severity: "warning",
          type: "Unsupported interpolation: call expression",
          loc: getNodeLocStart(expr) ?? decl.loc,
          context: {
            localName: decl.localName,
            importedName: imp.importedName,
            source: imp.source.value,
            path: info.path.length ? info.path.join(".") : undefined,
          },
        });
        bail = true;
        return { bail: true };
      }
      const exprAst = parseExpr(resolveValueResult.expr);
      if (!exprAst) {
        warnings.push({
          severity: "error",
          type: "Adapter resolveValue returned an unparseable value expression",
          loc: getNodeLocStart(expr),
          context: {
            localName: decl.localName,
            resolveValueResult,
            resolveValueContext,
          },
        });
        return null;
      }
      return { resolved: exprAst, imports: resolveValueResult.imports };
    };
    const addImport = (imp: any) => {
      addResolverImports([imp]);
    };
    if (d.property && d.value.kind === "interpolated") {
      const slotParts =
        (d.value as { parts?: Array<{ kind?: string; slotId?: number }> }).parts ?? [];
      for (const part of slotParts) {
        if (part?.kind !== "slot" || part.slotId === undefined) {
          continue;
        }
        const expr = decl.templateExpressions[part.slotId] as {
          type?: string;
          body?: unknown;
          object?: { type?: string; name?: string };
          property?: { type?: string; name?: string };
        };
        const baseExpr =
          expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
            ? (expr.body as any)
            : (expr as any);
        if (
          baseExpr?.type !== "MemberExpression" &&
          baseExpr?.type !== "OptionalMemberExpression"
        ) {
          continue;
        }
        const obj = baseExpr.object;
        const prop = baseExpr.property as { type?: string; name?: string } | undefined;
        if (obj?.type !== "Identifier") {
          continue;
        }
        const ownerName = obj.name;
        const ownerMap = staticPropertyValues.get(ownerName);
        if (!ownerMap) {
          continue;
        }
        // Try to resolve the static property value
        const propName = prop?.type === "Identifier" ? prop.name : undefined;
        const resolvedValue = propName ? ownerMap.get(propName) : undefined;
        if (resolvedValue !== undefined) {
          // Replace the template expression with a literal value
          decl.templateExpressions[part.slotId] = staticValueToLiteral(j, resolvedValue) as any;
          // Add a comment documenting the inlined value for maintainability
          const memberExprStr = `${ownerName}.${propName}`;
          (d as any).leadingComment =
            `NOTE: Inlined ${memberExprStr} as StyleX requires it to be statically evaluable`;
          continue;
        }
        // Value not resolvable - bail
        warnings.push({
          severity: "error",
          type: "Unsupported interpolation: member expression",
          loc: getNodeLocStart(baseExpr) ?? decl.loc,
        });
        bail = true;
        break;
      }
      if (bail) {
        continue;
      }
    }
    const localVarSlotPart =
      d.value.parts.find((p: any) => p.kind === "slot" && d.property?.startsWith("--")) ??
      d.value.parts.find(
        (p: any) => p.kind === "slot" && d.valueRaw.includes(`__SC_EXPR_${p.slotId}__`),
      );
    const localVarSlotId =
      localVarSlotPart && localVarSlotPart.kind === "slot" ? localVarSlotPart.slotId : 0;
    const localVarExpr = decl.templateExpressions[localVarSlotId];
    if (
      tryHandleLocalCustomPropertyDefinition({
        j,
        d,
        decl,
        expr: localVarExpr,
        getOrCreateLocalStylexVar,
        inlineStyleProps,
      })
    ) {
      continue;
    }
    if (
      tryHandleRuntimeConditionalStaticBranches(ctx, {
        rule,
        allRules,
        d,
        media,
        pseudos,
        pseudoElement,
        attrTarget,
        resolvedSelectorMedia,
      })
    ) {
      continue;
    }
    const numericIdentifiers = getNumericImportedStylexIdentifiers(
      j,
      filePath,
      importMap,
      resolverImports,
    );
    if (isImportedShorthandUnitValue(d, decl, importMap, numericIdentifiers)) {
      bailUnsupportedLocal(decl, "Unsupported interpolation: call expression");
      continue;
    }
    if (
      tryHandleInterpolatedStringValue({
        j,
        decl,
        d,
        styleObj,
        resolveCallExpr,
        addImport,
        resolveImportedValueExpr,
        resolveThemeValue,
        numericIdentifiers,
        setStyleValue: (prop, value) => applyResolvedPropValue(prop, value, null),
      })
    ) {
      continue;
    }
    if (bail) {
      break;
    }

    if (!d.property) {
      const slot = d.value.parts.find(
        (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
      );
      if (slot) {
        const expr = decl.templateExpressions[slot.slotId] as any;
        if (tryEmitObservedCssBlockVariantBuckets(expr)) {
          continue;
        }
        // A helper whose template interpolates component props (beyond theme access)
        // carries conditional variants/dynamic values that applyCssHelperMixin does
        // not wire into the consumer — only the helper's base style key would be
        // referenced, silently dropping the prop-dependent styles. Bail instead.
        const bailOnPropDependentCssHelper = (helperDecl: StyledDecl): boolean => {
          for (const helperExpr of (helperDecl.templateExpressions ?? []) as Array<{
            type?: string;
          }>) {
            if (
              !helperExpr ||
              (helperExpr.type !== "ArrowFunctionExpression" &&
                helperExpr.type !== "FunctionExpression")
            ) {
              continue;
            }
            const propsUsed = new Set([
              ...collectPropsFromArrowFn(helperExpr as never),
              ...collectPropsFromArrowFnDestructured(helperExpr as never),
            ]);
            propsUsed.delete("theme");
            if (propsUsed.size > 0) {
              warnings.push({
                severity: "warning",
                type: "css helper with prop-based interpolation cannot be reused as a mixin",
                loc: decl.loc,
                context: { localName: decl.localName, mixin: helperDecl.localName },
              });
              bail = true;
              return true;
            }
          }
          return false;
        };
        // Handle css helper identifier: ${primaryStyles}
        if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
          const helperDecl = declByLocalName.get(expr.name);
          if (helperDecl) {
            if (bailOnPropDependentCssHelper(helperDecl)) {
              break;
            }
            applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
            continue;
          }
        }
        // Handle css helper function calls: ${getPrimaryStyles()}
        if (
          expr?.type === "CallExpression" &&
          expr.callee?.type === "Identifier" &&
          (expr.arguments ?? []).length === 0
        ) {
          const calleeName = expr.callee.name as string;
          const helperDecl = declByLocalName.get(calleeName);
          if (helperDecl?.isCssHelper) {
            if (bailOnPropDependentCssHelper(helperDecl)) {
              break;
            }
            applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
            continue;
          }
          // Imported function calls fall through to be handled via resolveCall
        }
        if (expr?.type === "Identifier") {
          // Case 1: Local styled component mixin
          const mixinDecl = declByLocalName.get(expr.name);
          if (mixinDecl && !mixinDecl.isCssHelper && mixinDecl.localName !== decl.localName) {
            bail = true;
            warnings.push({
              severity: "warning",
              type: "Using styled-components components as mixins is not supported; use css`` mixins or strings instead",
              loc: getNodeLocStart(expr) ?? decl.loc,
              context: {
                localName: decl.localName,
                mixin: mixinDecl.localName,
              },
            });
            continue;
          }

          // Case 2: Imported styled component mixin (resolved via adapter)
          const importEntry = importMap?.get(expr.name);
          if (importEntry && !cssHelperNames.has(expr.name)) {
            const resolved = resolveValue({
              kind: "importedValue",
              importedName: importEntry.importedName,
              source: importEntry.source,
              filePath,
              loc: getNodeLocStart(expr) ?? undefined,
            });
            if (resolved?.usage === "props") {
              if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
                if (resolved.cssText) {
                  const parsedStyle = parseCssDeclarationBlock(resolved.cssText);
                  if (parsedStyle) {
                    for (const [prop, value] of Object.entries(parsedStyle)) {
                      applyResolvedPropValue(prop, value, null);
                    }
                    continue;
                  }
                  warnings.push({
                    severity: "error",
                    type: 'Adapter resolveValue cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")',
                    loc: getNodeLocStart(expr) ?? decl.loc,
                    context: {
                      selector: rule.selector,
                      cssText: resolved.cssText,
                      importedName: importEntry.importedName,
                      source: importEntry.source.value,
                    },
                  });
                  bail = true;
                  break;
                }
                warnings.push({
                  severity: "warning",
                  type: "Adapter resolved imported StyleX value under nested selectors/at-rules but did not provide cssText for property expansion — add cssText to resolveValue result to enable pseudo-wrapping",
                  loc: getNodeLocStart(expr) ?? decl.loc,
                  context: {
                    selector: rule.selector,
                    importedName: importEntry.importedName,
                    source: importEntry.source.value,
                  },
                });
                bail = true;
                break;
              }
              // Add as an extra stylex.props argument
              const extras = decl.extraStylexPropsArgs ?? [];
              const order = decl.mixinOrder ?? [];
              const parsedExpr = parseExpr(resolved.expr);
              if (parsedExpr) {
                extras.push({ expr: parsedExpr, afterBase: true });
                order.push("propsArg");
                decl.extraStylexPropsArgs = extras;
                decl.mixinOrder = order;
                // Merge imports
                addResolverImports(resolved.imports);
                continue;
              }
            }
            // If adapter returns undefined or usage !== "props", fall through
          }
        }
        // Handle member expression CSS helpers (e.g., buttonStyles.rootCss)
        const rootInfo = extractRootAndPath(expr);
        const firstRootInfoPath = rootInfo?.path[0];
        if (rootInfo && rootInfo.path.length === 1 && firstRootInfoPath) {
          const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
          if (objectMemberMap) {
            const memberDecl = objectMemberMap.get(firstRootInfoPath);
            if (memberDecl) {
              addStyleKeyMixin(decl, memberDecl.styleKey);
              trackMixinPropertyValues(
                cssHelperValuesByKey.get(memberDecl.styleKey),
                cssHelperPropValues,
              );
              continue;
            }
          }
        }
      }
    }
    if (tryHandlePropertyTernaryTemplateLiteral(d)) {
      continue;
    }
    // Apply to base declarations and pseudo/attr selectors (not media).
    if (!media && !attrTarget) {
      if (tryHandleCssHelperConditionalBlock(d, pseudos ?? null, pseudoElement)) {
        continue;
      }
    }
    if (tryHandleCssHelperFunctionSwitchBlock(d)) {
      continue;
    }
    if (tryHandleLogicalOrDefault(d)) {
      continue;
    }
    if (!media && !attrTarget && !pseudos?.length) {
      if (tryHandleConditionalPropCoalesceWithTheme(d)) {
        continue;
      }
    }

    // Support enum-like block-body `if` chains that return static values.
    // Example:
    //   transform: ${(props) => { if (props.$state === "up") return "scaleY(3)"; return "scaleY(1)"; }};
    if (tryHandleEnumIfChainValue(d, { media, attrTarget, pseudos })) {
      continue;
    }

    if (pseudos?.length && d.property) {
      const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
      const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
      const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
      const expr = decl.templateExpressions[slotId] as any;
      if (
        stylexProp &&
        expr?.type === "ArrowFunctionExpression" &&
        expr.body?.type === "ConditionalExpression"
      ) {
        const test = expr.body.test as any;
        const cons = expr.body.consequent as any;
        const alt = expr.body.alternate as any;
        if (
          test?.type === "MemberExpression" &&
          test.property?.type === "Identifier" &&
          cons?.type === "StringLiteral" &&
          alt?.type === "StringLiteral"
        ) {
          const when = test.property.name;
          const baseDefault = (styleObj as any)[stylexProp] ?? null;
          // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
          const pseudoEntries = Object.fromEntries(pseudos.map((p) => [p, alt.value]));
          (styleObj as any)[stylexProp] = { default: baseDefault, ...pseudoEntries };
          const variantPseudoEntries = Object.fromEntries(pseudos.map((p) => [p, cons.value]));
          variantBuckets.set(when, {
            ...variantBuckets.get(when),
            [stylexProp]: { default: cons.value, ...variantPseudoEntries },
          });
          variantStyleKeys[when] ??= styleKeyWithSuffix(decl.styleKey, when);
          continue;
        }
      }
    }

    // Handle computed theme object access keyed by a prop:
    //   background-color: ${(props) => props.theme.color[props.bg]}
    //
    // If the adapter can resolve `theme.color` as an object expression, we can emit a StyleX
    // dynamic style function that indexes into that resolved object at runtime:
    //   boxBackgroundColor: (bg) => ({ backgroundColor: (resolved as any)[bg] })
    //
    // This requires a wrapper to consume `bg` without forwarding it to DOM.
    if (tryHandleThemeIndexedLookup(d, { media, attrTarget, pseudos, pseudoElement })) {
      continue;
    }

    // Handle multiple interpolation slots that all branch on the same prop ternary.
    // Pattern: transform: translateY(-50%) translateX(${p => p.$expanded ? "0" : "-8px"}) scale(${p => p.$expanded ? 1 : 0.9})
    // When all slots are ternaries on the same condition with literal branches, produce
    // two static variant styles by evaluating each branch direction.
    if (d.property && d.value.kind === "interpolated" && tryHandleMultiSlotTernary(ctx, d)) {
      continue;
    }
    if (tryHandleMultiSlotRuntimeValue(resolveImportedValueExpr)) {
      continue;
    }

    // The fallback below resolves a single interpolation slot. If multiple
    // function-valued slots remain in one declaration (e.g.
    // `padding: ${p => p.$v}px ${p => p.$h}px`) and no specialized handler
    // consumed them, emitting only the first slot would silently drop the
    // others — bail instead. Slots holding static expressions (identifiers,
    // constants) are fine: the template builders below substitute them in place.
    const remainingSlotParts = d.value.parts.filter((p: any) => p.kind === "slot");
    const functionSlotCount = remainingSlotParts.filter((p: any) => {
      const slotExpr = decl.templateExpressions[p.slotId] as { type?: string } | undefined;
      return (
        slotExpr?.type === "ArrowFunctionExpression" || slotExpr?.type === "FunctionExpression"
      );
    }).length;
    if (functionSlotCount > 1) {
      warnings.push({
        severity: "error",
        type: "Unsupported interpolation: multiple dynamic slots in one declaration",
        loc: decl.loc,
        context: { localName: decl.localName, property: d.property },
      });
      bail = true;
      break;
    }

    const slotPart = remainingSlotParts[0];
    const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
    const expr = decl.templateExpressions[slotId];
    const loc = getNodeLocStart(expr as any);

    // Handle local helper function calls that return CSS strings.
    // Pattern: ${(props) => localFn(props.size)} where localFn returns multi-property CSS.
    if (tryHandleLocalHelperCall({ ctx, d, expr })) {
      continue;
    }

    const res = resolveDynamicNode(
      {
        slotId,
        expr,
        css: {
          kind: "declaration",
          selector: rule.selector,
          atRuleStack: rule.atRuleStack,
          ...(d.property ? { property: d.property } : {}),
          valueRaw: d.valueRaw,
        },
        component: componentInfo,
        usage: { jsxUsages: 0, hasPropsSpread: false },
        ...(loc ? { loc } : {}),
      },
      handlerContext,
    );
    if (res && res.type === "resolvedStyles") {
      // Adapter-resolved StyleX style objects are emitted as additional stylex.props args.
      // This is only safe for base selector declarations.
      if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "warning",
          type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
          loc,
          context: resolveCallMeta
            ? { selector: rule.selector, ...resolveCallMeta }
            : { selector: rule.selector },
        });
        bail = true;
        break;
      }
      addResolverImports(res.imports);
      const exprAst = parseExpr(res.expr);
      if (!exprAst) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "error",
          type: "Adapter resolveCall returned an unparseable styles expression",
          loc: decl.loc,
          context: resolveCallMeta
            ? { localName: decl.localName, res, ...resolveCallMeta }
            : { localName: decl.localName, res },
        });
        bail = true;
        break;
      }
      if (isUnchangedImportedHelperStyleCall(res, exprAst, expr)) {
        warnings.push({
          severity: "warning",
          type: "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
          loc: decl.loc,
          context: { localName: decl.localName, expr: res.expr },
        });
        bail = true;
        break;
      }
      // Track mixinOrder for correct cascade interleaving
      const hasStaticPropsBefore =
        Object.keys(styleObj).length > 0 || ctx.getBaseStyleTarget() !== styleObj;
      const order = decl.mixinOrder ?? [];
      order.push("propsArg");
      decl.mixinOrder = order;
      decl.extraStylexPropsArgs ??= [];
      decl.extraStylexPropsArgs.push({
        expr: exprAst as any,
        afterBase: hasStaticPropsBefore,
      });
      // Store any extra className expressions (from CSS modules) on the decl
      if (res.extraClassNames) {
        collectExtraClassNames(res.extraClassNames);
      }
      // Create an after-base segment so subsequent static properties
      // are placed after this helper in the stylex.props() call
      notifyResolvedStylesArg();
      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "resolvedClassNames") {
      // Adapter returned className-only result (no StyleX expr).
      // Store the className expressions on the decl for the emitter to merge.
      collectExtraClassNames(res.extraClassNames);
      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "resolvedDirectional") {
      // Adapter returned directional longhand entries for a shorthand property.
      // Route each longhand through applyResolvedPropValue to preserve
      // media/pseudo/attribute scoping.
      let directionalFailed = false;
      for (const entry of res.directional) {
        addResolverImports(entry.imports);
        const exprAst = parseExpr(entry.expr);
        if (!exprAst) {
          warnings.push({
            severity: "error",
            type: "Adapter resolveCall returned an unparseable value expression",
            loc: decl.loc,
            context: { localName: decl.localName, entry },
          });
          directionalFailed = true;
          break;
        }
        applyResolvedPropValue(entry.prop, exprAst, null);
      }
      if (directionalFailed) {
        bail = true;
        break;
      }
      continue;
    }

    if (res && res.type === "resolvedValue") {
      addResolverImports(res.imports);

      // Extract and wrap static prefix/suffix (skip for border-color since expansion handled it)
      const { prefix, suffix } = extractStaticPartsForDecl(d);
      // Preserve !important by appending it to the suffix
      const effectiveSuffix = d.important ? `${suffix} !important` : suffix;
      const wrappedExpr = wrapExprWithStaticParts(res.expr, prefix, effectiveSuffix);
      const cssValueTextForClassification =
        prefix || effectiveSuffix ? wrappedExpr : res.cssValueText;

      const exprAst = parseExpr(wrappedExpr);
      if (!exprAst) {
        const resolveCallMeta =
          res.resolveCallContext && res.resolveCallResult
            ? {
                resolveCallContext: res.resolveCallContext,
                resolveCallResult: res.resolveCallResult,
              }
            : undefined;
        warnings.push({
          severity: "error",
          type: "Adapter resolveCall returned an unparseable value expression",
          loc: decl.loc,
          context: resolveCallMeta
            ? { localName: decl.localName, res, ...resolveCallMeta }
            : { localName: decl.localName, res },
        });
        bail = true;
        break;
      }
      const outs =
        d.property === "background" && cssValueTextForClassification
          ? [{ prop: resolveBackgroundStylexProp(cssValueTextForClassification) }]
          : cssDeclarationToStylexDeclarations(d);
      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;
        const commentSource =
          i === 0
            ? {
                leading: (d as any).leadingComment,
                leadingLine: (d as any).leadingLineComment,
                trailingLine: (d as any).trailingLineComment,
              }
            : null;
        applyResolvedPropValue(out.prop, exprAst as any, commentSource, d.property);
      }

      const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
        resolveCallResult: res.resolveCallResult,
        originalExpr: expr,
        loc,
        cssValueText: cssValueTextForClassification,
      });
      if (runtimeOverride === "failed") {
        break;
      }
      continue;
    }

    if (res && res.type === "runtimeCallOnly") {
      const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
        resolveCallResult: res.resolveCallResult,
        originalExpr: expr,
        loc,
        cssValueText: res.cssValueText,
      });
      if (runtimeOverride === "failed") {
        break;
      }
      continue;
    }

    // Handle theme boolean conditional patterns (e.g., theme.isDark, theme.isHighContrast)
    if (res && res.type === "splitThemeBooleanVariants") {
      if (
        pseudos?.length ||
        media ||
        pseudoElement ||
        attrTarget ||
        resolvedSelectorMedia ||
        hasAncestorAttributeScope
      ) {
        bail = true;
        continue;
      }
      // Add imports if present
      addResolverImports(res.trueImports);
      addResolverImports(res.falseImports);

      const trueStyle: Record<string, unknown> = {};
      const falseStyle: Record<string, unknown> = {};

      // Expand CSS shorthands (border -> width/style/color, background -> backgroundColor/Image)
      if (!applyThemeBooleanValue(j, res.cssProp, res.trueValue, trueStyle, res.trueCssValueText)) {
        bail = true;
        continue;
      }
      if (
        !applyThemeBooleanValue(j, res.cssProp, res.falseValue, falseStyle, res.falseCssValueText)
      ) {
        bail = true;
        continue;
      }

      const { trueKey: baseTrueStyleKey, falseKey: baseFalseStyleKey } = buildThemeStyleKeys(
        decl.styleKey,
        res.themeProp,
      );

      if (!decl.needsUseThemeHook) {
        decl.needsUseThemeHook = [];
      }

      const latestSourceOrder = getLatestThemeInterleavableSourceOrder({
        decl,
        variantSourceOrder,
        styleFnFromProps,
      });
      const matchingThemeEntries = decl.needsUseThemeHook.filter(
        (entry) => entry.themeProp === res.themeProp && (entry.trueStyleKey || entry.falseStyleKey),
      );
      let reusableEntry: (typeof matchingThemeEntries)[number] | null = null;
      for (let i = matchingThemeEntries.length - 1; i >= 0; i--) {
        const entry = matchingThemeEntries[i]!;
        if (entry.sourceOrder !== undefined && entry.sourceOrder === latestSourceOrder) {
          reusableEntry = entry;
          break;
        }
      }
      const mergeExtraStyleObject = (styleKey: string, style: Record<string, unknown>): void => {
        const existing = extraStyleObjects.get(styleKey);
        extraStyleObjects.set(styleKey, existing ? { ...existing, ...style } : style);
      };

      if (reusableEntry) {
        const restoredTrueStyleKey =
          reusableEntry.trueStyleKey ??
          restoreThemeStyleKeyFromPairedSide(
            baseTrueStyleKey,
            baseFalseStyleKey,
            reusableEntry.falseStyleKey,
          );
        const restoredFalseStyleKey =
          reusableEntry.falseStyleKey ??
          restoreThemeStyleKeyFromPairedSide(
            baseFalseStyleKey,
            baseTrueStyleKey,
            reusableEntry.trueStyleKey,
          );
        reusableEntry.trueStyleKey = restoredTrueStyleKey;
        reusableEntry.falseStyleKey = restoredFalseStyleKey;
        mergeExtraStyleObject(restoredTrueStyleKey, trueStyle);
        mergeExtraStyleObject(restoredFalseStyleKey, falseStyle);
      } else {
        const sourceOrder = ctx.allocateSourceOrder();
        const hasExistingStyleBucketForThemeProp = matchingThemeEntries.length > 0;
        const trueStyleKey = hasExistingStyleBucketForThemeProp
          ? styleKeyWithSuffix(baseTrueStyleKey, `theme${sourceOrder}`)
          : baseTrueStyleKey;
        const falseStyleKey = hasExistingStyleBucketForThemeProp
          ? styleKeyWithSuffix(baseFalseStyleKey, `theme${sourceOrder}`)
          : baseFalseStyleKey;

        decl.needsUseThemeHook.push({
          themeProp: res.themeProp,
          trueStyleKey,
          falseStyleKey,
          sourceOrder,
        });

        extraStyleObjects.set(trueStyleKey, trueStyle);
        extraStyleObjects.set(falseStyleKey, falseStyle);
      }

      const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
        resolveCallResult: res.runtimeResolveCallResult,
        originalExpr: expr,
        loc,
        cssValueText: res.runtimeCssValueText,
      });
      if (runtimeOverride === "failed") {
        break;
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    // Handle theme boolean conditional with one unresolvable branch (call or member expression).
    // The resolved branch becomes the base StyleX style; the unresolvable branch
    // is emitted as a conditional inline style using the useTheme() hook.
    if (res && res.type === "splitThemeBooleanWithInlineStyleFallback") {
      // Inline style fallback cannot preserve pseudo/media context — bail
      if (
        pseudos?.length ||
        media ||
        pseudoElement ||
        attrTarget ||
        resolvedSelectorMedia ||
        hasAncestorAttributeScope
      ) {
        bail = true;
        continue;
      }
      // Shorthand CSS properties expand to multiple longhands; the unresolvable
      // branch expression can't be correctly split across them — bail
      if (isCssShorthandProperty(res.cssProp)) {
        bail = true;
        continue;
      }

      // Add imports for the resolved value
      addResolverImports(res.resolvedImports);

      // Ensure useTheme() is imported and called by adding a hook-only entry
      // with both keys null. Keep this separate from style-bucket entries for
      // the same theme prop so later cascade cleanup can delete emptied style
      // hooks without dropping inline fallbacks that still reference `theme`.
      if (!decl.needsUseThemeHook) {
        decl.needsUseThemeHook = [];
      }
      if (
        !decl.needsUseThemeHook.some(
          (e) =>
            e.themeProp === res.themeProp && e.trueStyleKey === null && e.falseStyleKey === null,
        )
      ) {
        decl.needsUseThemeHook.push({
          themeProp: res.themeProp,
          trueStyleKey: null,
          falseStyleKey: null,
        });
      }

      // Build the conditional inline style expression:
      //   theme.<prop> ? <inlineExpr> : undefined   (when resolved branch is false)
      //   theme.<prop> ? undefined : <inlineExpr>   (when resolved branch is true)
      // Simplified: use the theme condition to pick the inline expr or undefined
      const themeCondition = j.memberExpression(j.identifier("theme"), j.identifier(res.themeProp));
      const undefinedExpr = j.identifier("undefined") as ExpressionKind;
      const inlineExpr = res.inlineExpr as ExpressionKind;

      // Determine when the inline style should apply:
      // The inline style replaces the unresolvable branch.
      // resolvedBranchIsTrue is already normalized to the theme boolean, so a
      // resolved true branch means the inline fallback applies when the theme
      // boolean is false.
      const inlineAppliesWhenThemeIsTrue = !res.resolvedBranchIsTrue;
      const conditionalExpr = inlineAppliesWhenThemeIsTrue
        ? j.conditionalExpression(themeCondition, inlineExpr, undefinedExpr)
        : j.conditionalExpression(themeCondition, undefinedExpr, inlineExpr);

      // Expand shorthand CSS properties (e.g., padding → paddingTop/Right/Bottom/Left)
      // using the CSS declaration IR, consistent with other handlers.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (!out.prop) {
          continue;
        }
        styleObj[out.prop] = res.resolvedValue;
        inlineStyleProps.push({ prop: out.prop, expr: conditionalExpr });
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "splitVariants") {
      // Extract any imports from variants (used by template literal theme resolution)
      for (const v of res.variants) {
        addResolverImports(v.imports);
      }

      // When inside a media context (static or computed), wrap each variant's style
      // properties in media maps so the media condition is preserved.
      const wrapInMedia = (
        style: Record<string, unknown>,
        target: Record<string, unknown>,
      ): void => {
        for (const [prop, value] of Object.entries(style)) {
          if (media) {
            const existing = target[prop];
            const map =
              existing && typeof existing === "object" && !Array.isArray(existing)
                ? { ...(existing as Record<string, unknown>) }
                : ({} as Record<string, unknown>);
            if (!("default" in map)) {
              const baseValue = existing ?? (styleObj as Record<string, unknown>)[prop];
              map.default = baseValue ?? null;
            }
            map[media] = value;
            target[prop] = map;
          } else if (resolvedSelectorMedia) {
            const existing = target[prop];
            const map =
              existing && typeof existing === "object" && !Array.isArray(existing)
                ? { ...(existing as Record<string, unknown>) }
                : ({} as Record<string, unknown>);
            if (!("default" in map)) {
              const baseValue = existing ?? (styleObj as Record<string, unknown>)[prop];
              map.default = baseValue ?? null;
            }
            const computedKeys = ((map as any).__computedKeys ?? []) as Array<{
              keyExpr: unknown;
              value: unknown;
            }>;
            computedKeys.push({ keyExpr: resolvedSelectorMedia.keyExpr, value });
            (map as any).__computedKeys = computedKeys;
            target[prop] = map;
          } else {
            target[prop] = value;
          }
        }
      };

      const negVariants = res.variants.filter((v) => v.when.startsWith("!"));
      const posVariants = res.variants.filter((v) => !v.when.startsWith("!"));

      if (negVariants.length === 1 && posVariants.length > 0) {
        // Classic pattern with one default (neg) and conditional variants (pos)
        // Pattern: prop === "a" ? A : prop === "b" ? B : C
        // → C is default, A and B are conditional
        const neg = negVariants[0]!;

        // Check whether the neg variant's CSS properties overlap with the pos variants'.
        // When they differ (e.g., truthy sets padding/position, falsy sets margin/border),
        // both branches are meaningful variant buckets — folding neg into base would lose it.
        const negPropKeys = Object.keys(neg.style);
        const allPosPropKeys = new Set(posVariants.flatMap((v) => Object.keys(v.style)));
        // Fold neg into base when: neg is empty (no-op), or neg has the same property
        // set as the pos variants (classic default/conditional pattern).
        const shouldFoldNegIntoBase =
          negPropKeys.length === 0 ||
          (negPropKeys.length === allPosPropKeys.size &&
            negPropKeys.every((k) => allPosPropKeys.has(k)));

        // Process pos variants (same in both branches)
        for (const pos of posVariants) {
          const bucket = { ...variantBuckets.get(pos.when) } as Record<string, unknown>;
          wrapInMedia(pos.style, bucket);
          variantBuckets.set(pos.when, bucket);
          variantStyleKeys[pos.when] ??= styleKeyWithSuffix(decl.styleKey, pos.when);
        }

        if (shouldFoldNegIntoBase) {
          // Same property sets — fold neg into base (default branch)
          wrapInMedia(neg.style, styleObj);
        } else {
          // Different property sets — keep neg as a variant bucket too
          const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
          wrapInMedia(neg.style, bucket);
          variantBuckets.set(neg.when, bucket);
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      } else if (negVariants.length === 1 && posVariants.length === 0) {
        // Only negated variant: style is conditional on !prop
        // Pattern: !prop ? A : "" → A is conditional on !prop (i.e., when prop is false)
        const neg = negVariants[0]!;
        const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
        wrapInMedia(neg.style, bucket);
        variantBuckets.set(neg.when, bucket);
        // toSuffixFromProp handles negated props: !$open → NotOpen
        variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
      } else if (posVariants.length > 0) {
        // Positive variants (with or without multiple negatives)
        // Pattern: prop ? A : "" or prop === "a" ? A : ""
        // Also handles: hollow ? A : (inner ternary produces multiple negatives)
        for (const pos of posVariants) {
          const bucket = { ...variantBuckets.get(pos.when) } as Record<string, unknown>;
          wrapInMedia(pos.style, bucket);
          variantBuckets.set(pos.when, bucket);
          variantStyleKeys[pos.when] ??= styleKeyWithSuffix(decl.styleKey, pos.when);
        }
        // Also process negative variants (compound conditions like !hollow && $primary)
        for (const neg of negVariants) {
          const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
          wrapInMedia(neg.style, bucket);
          variantBuckets.set(neg.when, bucket);
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      } else if (negVariants.length > 0) {
        // Only negative variants (multiple compound conditions)
        for (const neg of negVariants) {
          const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
          wrapInMedia(neg.style, bucket);
          variantBuckets.set(neg.when, bucket);
          variantStyleKeys[neg.when] ??= styleKeyWithSuffix(decl.styleKey, neg.when);
        }
      }
      continue;
    }

    if (res && res.type === "splitVariantsResolvedStyles") {
      if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
        warnings.push({
          severity: "warning",
          type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
          loc,
          context: { selector: rule.selector },
        });
        bail = true;
        break;
      }
      for (const v of res.variants) {
        addResolverImports(v.imports);
        const exprAst = parseExpr(v.expr);
        if (!exprAst) {
          warnings.push({
            severity: "error",
            type: "Adapter resolveCall returned an unparseable styles expression",
            loc,
            context: { localName: decl.localName, variant: v },
          });
          bail = true;
          break;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
      }
      if (bail) {
        break;
      }
      markThemeHookForVariants(decl, res.variants);
      decl.needsWrapperComponent = true;
      continue;
    }

    if (
      handleSplitVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        resolvedSelectorMedia,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      if (res?.type === "splitVariantsResolvedValue") {
        markThemeHookForVariants(decl, res.variants);
      }
      continue;
    }

    if (
      handleSplitMultiPropVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        resolvedSelectorMedia,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      continue;
    }

    if (
      handleDualBranchCompoundVariantsResolvedValue({
        j,
        decl,
        d,
        res,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        pseudos,
        media,
        resolvedSelectorMedia,
        parseExpr,
        resolverImports,
        warnings,
        setBail: () => {
          bail = true;
        },
        bailUnsupported: bailUnsupportedLocal,
      })
    ) {
      continue;
    }

    if (res && res.type === "emitConditionalIndexedThemeFunction") {
      // Handle conditional indexed theme lookup:
      //   props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle
      //
      // Strategy: Add fallback as base style, style function provides override when prop is defined.
      // This works because the emit logic guards the function call with `propName != null &&`.
      //   Base style: { color: themeVars.labelTitle }
      //   Style function: (textColor: Colors) => ({ color: themeVars[textColor] })
      //   Usage: styles.badge, textColor != null && styles.badgeColor(textColor)

      // Add imports from both theme resolutions
      addResolverImports(res.themeObjectImports);
      addResolverImports(res.fallbackImports);

      // Mark prop to not forward to DOM
      ensureShouldForwardPropDrop(decl, res.propName);

      // Parse the theme expressions
      const themeObjAst = parseExpr(res.themeObjectExpr);
      const fallbackAst = parseExpr(res.fallbackExpr);
      if (!themeObjAst || !fallbackAst) {
        warnings.push({
          severity: "error",
          type: "Failed to parse theme expressions",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            themeObjExpr: res.themeObjectExpr,
            fallbackExpr: res.fallbackExpr,
          },
        });
        bail = true;
        break;
      }

      // Generate function-based style for each CSS output property
      const outs = cssDeclarationToStylexDeclarations(d);
      for (const out of outs) {
        if (!out.prop) {
          continue;
        }

        // Add fallback to base styleObj
        styleObj[out.prop] = fallbackAst as any;

        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        if (!styleFnDecls.has(fnKey)) {
          // Get prop type from component's type annotation if available
          const propTsType = findJsxPropTsType(res.propName);
          const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
          const param = j.identifier(paramName);

          // Add type annotation (without | undefined since the function is only called when defined)
          if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
            (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
          }

          // Build: themeObj[propName] (no conditional - fallback is in base style)
          const valueExpr = j.memberExpression(themeObjAst as any, j.identifier(paramName), true);

          const body = j.objectExpression([
            j.property("init", makeCssPropKey(j, out.prop), valueExpr),
          ]);

          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }

        // Use condition: "truthy" to mirror the original `props.textColor ? ... : fallback`
        // semantics. This ensures falsy-but-defined values (empty string, 0, false) use
        // the fallback rather than attempting an indexed lookup.
        styleFnFromProps.push({ fnKey, jsxProp: res.propName, condition: "truthy" });
      }

      if (bail) {
        break;
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "emitIndexedThemeFunctionWithPropFallback") {
      // Handle indexed theme lookup with prop fallback:
      //   props.theme.color[props.backgroundColor] || props.backgroundColor
      //
      // Output: (backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] ?? backgroundColor })

      // Add imports from theme resolution
      addResolverImports(res.themeObjectImports);

      // Mark prop to not forward to DOM
      ensureShouldForwardPropDrop(decl, res.propName);

      // Parse the theme expression
      const themeObjAst = parseExpr(res.themeObjectExpr);
      if (!themeObjAst) {
        warnings.push({
          severity: "error",
          type: "Failed to parse theme expressions",
          loc: decl.loc,
          context: {
            localName: decl.localName,
            themeObjExpr: res.themeObjectExpr,
          },
        });
        bail = true;
        break;
      }

      // Generate function-based style for each CSS output property
      const outs = cssDeclarationToStylexDeclarations(d);
      for (const out of outs) {
        if (!out.prop) {
          continue;
        }

        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        if (!styleFnDecls.has(fnKey)) {
          // Get prop type from component's type annotation if available
          const propTsType = findJsxPropTsType(res.propName);
          const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
          const param = j.identifier(paramName);

          // Add type annotation if available
          if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
            (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
          }

          // Build: themeObj[propName] ?? `${propName}`
          // The template literal wrapper satisfies StyleX's static analyzer for the fallback
          const indexedLookup = j.memberExpression(
            themeObjAst as any,
            j.identifier(paramName),
            true,
          );
          const fallbackExpr = j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: "", cooked: "" }, true),
            ],
            [j.identifier(paramName)],
          );
          const valueExpr = j.logicalExpression(res.operator, indexedLookup, fallbackExpr);

          const body = j.objectExpression([
            j.property("init", makeCssPropKey(j, out.prop), valueExpr),
          ]);

          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }

        // Let the wrapper emitter handle required vs optional props:
        // - Required props: styles.fn(prop)
        // - Optional props: prop != null && styles.fn(prop)
        styleFnFromProps.push({ fnKey, jsxProp: res.propName });
      }

      if (bail) {
        break;
      }

      decl.needsWrapperComponent = true;
      continue;
    }

    if (res && res.type === "splitConditionalWithDynamicBranch") {
      if (!d.property) {
        // Only intended for value interpolations on concrete properties.
      } else {
        const {
          conditionProp,
          staticValue,
          dynamicBranchExpr,
          paramName,
          dynamicProps,
          isStaticWhenFalse,
        } = res;

        // --- A. Static branch → base style ---
        const { prefix, suffix } = extractStaticPartsForDecl(d);
        const cssValueStr = `${prefix}${staticValue}${suffix}`;
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          styleObj[out.prop] = cssValueToJs(
            { kind: "static", value: cssValueStr },
            d.important,
            out.prop,
          );
        }

        // --- B. Dynamic branch → merge with existing variant or create new ---
        const conditionWhen = isStaticWhenFalse ? conditionProp : `!${conditionProp}`;
        const clonedDynamic = cloneAstNode(dynamicBranchExpr) as ExpressionKind;
        const stylexDecls = cssDeclarationToStylexDeclarations(d);
        const firstStylexProp = stylexDecls[0]?.prop;
        const dynamicValueExpr =
          prefix || suffix
            ? buildStylexValueWithStaticParts(
                j,
                clonedDynamic,
                prefix,
                suffix,
                firstStylexProp ?? "",
              )
            : clonedDynamic;
        const existingBucket = variantBuckets.get(conditionProp);

        if (!existingBucket && dynamicProps.length === 1) {
          const out = stylexDecls[0];
          const dynamicProp = dynamicProps[0];
          if (
            out &&
            dynamicProp &&
            tryEmitObservedExpressionVariantBuckets(
              dynamicProp,
              out.prop,
              clonedDynamic,
              paramName,
              conditionWhen,
              conditionProp,
              prefix,
              suffix,
            )
          ) {
            ensureShouldForwardPropDrop(decl, conditionProp);
            decl.observedExpressionConditionDropProps ??= new Set<string>();
            decl.observedExpressionConditionDropProps.add(conditionProp);
            decl.needsWrapperComponent = true;
            continue;
          }
        }

        // Mark dynamic props for DOM exclusion
        for (const propName of dynamicProps) {
          ensureShouldForwardPropDrop(decl, propName);
        }
        // Also mark the condition prop for DOM exclusion
        ensureShouldForwardPropDrop(decl, conditionProp);

        const scalarDynamic =
          shouldUseScalarDynamicArgs(d.property, d.valueRaw) && dynamicProps.length > 0
            ? scalarizePropsObjectDynamicValue({
                j,
                valueExpr: dynamicValueExpr,
                paramName,
                propNames: dynamicProps,
              })
            : null;
        const dynamicStyleValueExpr = scalarDynamic?.valueExpr ?? dynamicValueExpr;
        // The non-scalar fallback keeps the original arrow's member accesses
        // (e.g. `p.size`), so the function param must reuse that name.
        const dynamicStyleParams: ArrowFunctionParams = scalarDynamic
          ? scalarDynamic.paramNames.map((propName) => j.identifier(propName))
          : [j.identifier(paramName)];
        if (scalarDynamic) {
          annotateScalarParams(dynamicStyleParams, scalarDynamic.paramNames);
        }

        // Build call argument: object shorthand for dynamic props only
        const callArg = j.objectExpression(
          dynamicProps.map((name) => {
            const prop = j.property("init", j.identifier(name), j.identifier(name)) as any;
            prop.shorthand = true;
            return prop;
          }),
        );

        if (existingBucket) {
          // --- Merge path: combine existing variant bucket with dynamic branch ---
          const existingFnKey = variantStyleKeys[conditionProp];
          if (!existingFnKey) {
            // Shouldn't happen, but bail gracefully
            break;
          }
          const capturedSourceOrder = variantSourceOrder[conditionProp];

          // Build combined arrow function: (props) => ({ ...existingStatic, ...newDynamic })
          const properties: unknown[] = [];

          // Clone existing static properties from the variant bucket.
          // Values may be raw primitives or AST nodes depending on how they were inserted.
          for (const [propKey, propValue] of Object.entries(existingBucket)) {
            const valueNode =
              propValue !== null && typeof propValue === "object" && "type" in propValue
                ? (cloneAstNode(propValue) as ExpressionKind)
                : (staticValueToLiteral(
                    j,
                    propValue as string | number | boolean,
                  ) as ExpressionKind);
            properties.push(j.property("init", makeCssPropKey(j, propKey), valueNode));
          }

          // Add the new dynamic properties
          for (const out of stylexDecls) {
            properties.push(
              j.property("init", makeCssPropKey(j, out.prop), dynamicStyleValueExpr as any),
            );
          }

          const body = j.objectExpression(properties as any);
          // Union params with any previously-declared params on this fnKey.
          // The merge path is called per-CSS-property, and each iteration's
          // `dynamicStyleParams` only reflects props referenced by THIS
          // property. Without unioning, the last iteration's params overwrite
          // the others — leaving any props used only by earlier-merged
          // properties referenced as dangling bare identifiers in the body
          // (TS2304) and producing TS2554 on the call site (too many args).
          const mergedParams = unionStyleFnParams(
            styleFnDecls.get(existingFnKey),
            dynamicStyleParams,
          );
          styleFnDecls.set(existingFnKey, j.arrowFunctionExpression(mergedParams, body));

          // Remove from variant buckets — now handled as a style function
          variantBuckets.delete(conditionProp);
          delete variantStyleKeys[conditionProp];

          const scalarEntry = scalarDynamic
            ? scalarStyleFnEntryFromProps({
                j,
                fnKey: existingFnKey,
                propNames: scalarDynamic.paramNames,
                conditionWhen,
                sourceOrder: capturedSourceOrder,
              })
            : null;
          styleFnFromProps.push(
            scalarEntry ?? {
              fnKey: existingFnKey,
              jsxProp: "__props",
              callArg,
              conditionWhen,
              ...(capturedSourceOrder !== undefined ? { sourceOrder: capturedSourceOrder } : {}),
            },
          );
        } else {
          // --- Standalone path: create new conditional style function ---
          for (const out of stylexDecls) {
            const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
            if (!styleFnDecls.has(fnKey)) {
              const body = j.objectExpression([
                j.property("init", makeCssPropKey(j, out.prop), dynamicStyleValueExpr as any),
              ]);
              styleFnDecls.set(fnKey, j.arrowFunctionExpression(dynamicStyleParams, body));
            }
            if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
              const scalarEntry = scalarDynamic
                ? scalarStyleFnEntryFromProps({
                    j,
                    fnKey,
                    propNames: scalarDynamic.paramNames,
                    conditionWhen,
                  })
                : null;
              styleFnFromProps.push(
                scalarEntry ?? {
                  fnKey,
                  jsxProp: "__props",
                  callArg,
                  conditionWhen,
                },
              );
            }
          }
        }

        decl.needsWrapperComponent = true;
        continue;
      }
    }

    if (res && res.type === "emitStyleFunctionFromPropsObject") {
      if (!d.property) {
        // This handler is only intended for value interpolations on concrete properties.
        // If the IR is missing a property, fall through to other handlers.
      } else {
        const e = decl.templateExpressions[slotId] as any;
        if (e?.type !== "ArrowFunctionExpression" && e?.type !== "FunctionExpression") {
          bailUnsupportedLocal(decl, "Unsupported interpolation: arrow function");
          break;
        }
        if (hasThemeAccessInArrowFn(e)) {
          // StyleX style functions can't use runtime theme values.
          // Redirect to inline styles with useTheme() hook instead.
          const inlinedExpr = inlineArrowFunctionBody(j, e);
          if (!inlinedExpr) {
            warnPropInlineStyle(
              decl,
              "Unsupported prop-based inline style expression cannot be safely inlined",
              d.property,
              loc,
            );
            bail = true;
            break;
          }
          const themeRewritten = rewritePropsThemeToThemeVar(inlinedExpr as ExpressionKind);
          const { prefix, suffix } = extractStaticPartsForDecl(d);
          const valueExpr =
            prefix || suffix
              ? buildTemplateWithStaticParts(j, themeRewritten, prefix, suffix)
              : themeRewritten;
          markDeclNeedsUseThemeHook(decl);
          for (const propName of res.props ?? []) {
            if (propName === "theme") {
              continue;
            }
            ensureShouldForwardPropDrop(decl, propName);
          }
          for (const out of cssDeclarationToStylexDeclarations(d)) {
            if (!out.prop) {
              continue;
            }
            inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
          }
          continue;
        }
        const bodyExpr = getFunctionBodyExpr(e);
        if (!bodyExpr) {
          warnPropInlineStyle(
            decl,
            "Unsupported prop-based inline style expression cannot be safely inlined",
            d.property,
            loc,
          );
          bail = true;
          break;
        }
        const dynamicPropNames =
          res.props && res.props.length > 0 ? res.props : [...collectPropsFromArrowFn(e)];
        for (const propName of dynamicPropNames) {
          ensureShouldForwardPropDrop(decl, propName);
        }
        decl.needsWrapperComponent = true;
        const bindings = getArrowFnParamBindings(e);
        const paramName = bindings?.kind === "simple" ? bindings.paramName : "props";
        for (const out of cssDeclarationToStylexDeclarations(d)) {
          if (!out.prop) {
            continue;
          }
          const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
          let helperCallArgs: DynamicHelperCallArgument[] = [];
          let scalarPropNames: string[] | null = null;
          let guardedConditionWhenForScalar: string | null = null;
          if (!styleFnDecls.has(fnKey)) {
            const originalValueExpr = cloneAstNode(bodyExpr);
            const helperResolution = resolveHelperCallsInDynamicValue({
              j,
              expr: originalValueExpr,
              cssProperty: out.prop,
              paramName,
              resolveImportForExpr,
              resolveImportInScope,
              resolveCall,
              parseExpr,
              filePath,
              loc,
              addResolverImports,
              ...(bindings ? { bindings } : {}),
            });
            if (helperResolution === null) {
              warnings.push({
                severity: "error",
                type: "Unsupported interpolation: call expression",
                loc,
              });
              bail = true;
              break;
            }
            helperCallArgs = dedupeDynamicHelperCallArguments(helperResolution.args);
            const valueExprRaw = helperResolution.expr;
            const scalarProps =
              helperCallArgs.length === 0 && shouldUseScalarDynamicArgs(out.prop, d.valueRaw)
                ? scalarizePropsObjectDynamicValue({
                    j,
                    valueExpr: valueExprRaw,
                    paramName,
                    propNames: dynamicPropNames,
                    bindings: bindings ?? undefined,
                  })
                : null;
            scalarPropNames = scalarProps?.paramNames ?? null;
            const needsOriginalParam =
              !scalarProps &&
              helperCallArgs.length > 0 &&
              containsIdentifier(valueExprRaw, paramName);
            const styleFnParamNames = scalarProps
              ? scalarProps.paramNames
              : helperCallArgs.length > 0
                ? helperCallArgs.map((resolution) => resolution.paramName)
                : [paramName];
            if (!scalarProps && needsOriginalParam) {
              styleFnParamNames.unshift(paramName);
            }
            // Apply CSS value prefix/suffix (e.g., `${...}ms`) to the expression.
            // Keep !important on the actual CSS property rather than in the dynamic value:
            // StyleX emits dynamic values through CSS variables, and values like
            // `${value} !important` do not get assigned as runtime variables.
            const { prefix, suffix } = extractStaticPartsForDecl(d);
            const fullTemplateValueExpr =
              d.property === "transition"
                ? buildFullInterpolatedDeclarationValueExpr(j, decl, d)
                : null;
            const valueExpr =
              fullTemplateValueExpr ??
              (prefix || suffix
                ? buildStylexValueWithStaticParts(
                    j,
                    scalarProps?.valueExpr ?? valueExprRaw,
                    prefix,
                    suffix,
                    out.prop,
                  )
                : (scalarProps?.valueExpr ?? valueExprRaw));
            const guardedDynamic = extractGuardedDynamicBranch(j, bodyExpr);
            const guardedConditionWhen =
              guardedDynamic && scalarProps?.paramNames.length === 1
                ? printScalarizedExpression({
                    j,
                    expr: guardedDynamic.test,
                    paramName,
                    propNames: scalarProps.paramNames,
                    bindings: bindings ?? undefined,
                  })
                : null;
            guardedConditionWhenForScalar =
              guardedConditionWhen && isHelperCallGuard(guardedConditionWhen)
                ? guardedConditionWhen
                : null;
            const params = styleFnParamNames.map((name) => j.identifier(name));
            if (/\.(ts|tsx)$/.test(filePath)) {
              const propsTypeKind = (decl.propsType as { type?: string } | undefined)?.type;
              const isNamedTypeRef = propsTypeKind === "TSTypeReference";
              if (scalarProps) {
                annotateScalarParams(params, scalarProps.paramNames);
              } else if (helperCallArgs.length > 0) {
                for (
                  let paramIndex = needsOriginalParam ? 1 : 0;
                  paramIndex < params.length;
                  paramIndex++
                ) {
                  const param = params[paramIndex];
                  if (!param) {
                    continue;
                  }
                  (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                    j.tsStringKeyword(),
                  );
                }
                if (needsOriginalParam && !isNamedTypeRef) {
                  const typeName = `${decl.localName}Props`;
                  (params[0] as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                    j.tsTypeReference(j.identifier(typeName)),
                  );
                }
              } else if (!isNamedTypeRef) {
                const typeName = `${decl.localName}Props`;
                (params[0] as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                  j.tsTypeReference(j.identifier(typeName)),
                );
              }
            }
            const body = j.objectExpression(
              buildDynamicStyleFunctionProperties({
                j,
                fnKey,
                prop: out.prop,
                valueExpr,
                important: d.important,
                pseudos,
                media,
              }),
            );
            styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
          }
          if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
            const needsOriginalParam =
              helperCallArgs.length > 0 &&
              styleFnDecls.has(fnKey) &&
              containsIdentifier(styleFnDecls.get(fnKey), paramName);
            const firstHelperCallArg = needsOriginalParam ? undefined : helperCallArgs[0];
            const extraHelperCallArgs = needsOriginalParam
              ? helperCallArgs
              : helperCallArgs.slice(1);
            const scalarEntry = scalarPropNames
              ? scalarStyleFnEntryFromProps({
                  j,
                  fnKey,
                  propNames: scalarPropNames,
                  ...(guardedConditionWhenForScalar
                    ? { conditionWhen: guardedConditionWhenForScalar }
                    : {}),
                })
              : null;
            styleFnFromProps.push(
              scalarEntry ?? {
                fnKey,
                jsxProp: "__props",
                ...(firstHelperCallArg ? { callArg: firstHelperCallArg.callArg } : {}),
                ...(extraHelperCallArgs.length > 0
                  ? {
                      extraCallArgs: extraHelperCallArgs.map((resolution) => ({
                        jsxProp: "__props",
                        callArg: resolution.callArg,
                      })),
                    }
                  : {}),
              },
            );
          }
        }
        continue;
      }
    }

    if (
      handleInlineStyleValueFromProps({
        j,
        decl,
        d,
        res,
        slotId,
        pseudos,
        media,
        filePath,
        loc,
        warnings,
        styleObj,
        styleFnDecls,
        styleFnFromProps,
        inlineStyleProps,
        warnPropInlineStyle,
        setBail: () => {
          bail = true;
        },
        avoidNames,
      })
    ) {
      if (bail) {
        break;
      }
      continue;
    }

    // Handle emitStyleFunctionWithDefault: emit both static base style AND dynamic override
    if (res && res.type === "emitStyleFunctionWithDefault") {
      const jsxProp = res.call;
      const outs = cssDeclarationToStylexDeclarations(d);

      // Extract the static default value
      const defaultStaticValue = literalToStaticValue(res.defaultValue);

      // Identity prop with default + finite union type → static variant lookups
      // (e.g., `({ padding = "16px" }) => padding` with `padding: "8px" | "16px" | "24px"`)
      if (
        !res.valueTransform &&
        !res.wrapValueInTemplateLiteral &&
        !media &&
        (!pseudos || pseudos.length === 0) &&
        outs.length === 1 &&
        defaultStaticValue !== null &&
        typeof defaultStaticValue === "string"
      ) {
        const out = outs[0]!;
        if (tryEmitIdentityVariantBuckets(jsxProp, out.prop, defaultStaticValue)) {
          styleObj[out.prop] = defaultStaticValue;
          continue;
        }
      }

      for (let i = 0; i < outs.length; i++) {
        const out = outs[i]!;

        // Add static base style with default value
        if (defaultStaticValue !== null && !pseudos?.length && !media) {
          styleObj[out.prop] = defaultStaticValue;
        }

        // Add dynamic style function (same as emitStyleFunction)
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        const outParamName = res.valueTransform
          ? cssPropertyToIdentifier(out.prop, avoidNames)
          : styleFnParamNameForJsxProp(jsxProp, out.prop, avoidNames);
        const scalarCallArg = res.valueTransform
          ? undefined
          : scalarCallArgForParamName(
              j,
              jsxProp,
              outParamName,
              decl.transientPropRenames?.get(jsxProp),
            );
        styleFnFromProps.push({
          fnKey,
          jsxProp,
          ...(scalarCallArg ? { callArg: scalarCallArg } : {}),
        });

        if (!styleFnDecls.has(fnKey)) {
          const param = j.identifier(outParamName);
          if (jsxProp !== "__props") {
            annotateParamFromJsxProp(param, jsxProp);
          }
          if (jsxProp?.startsWith?.("$")) {
            ensureShouldForwardPropDrop(decl, jsxProp);
          }

          const p = makeCssProperty(j, out.prop, outParamName);
          const body = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
        }
      }
      continue;
    }

    if (res && res.type === "emitStyleFunction") {
      const jsxProp = res.call;
      const outs = cssDeclarationToStylexDeclarations(d);
      const valueTransform = (res as { valueTransform?: CallValueTransform }).valueTransform;

      // Identity prop with finite union type → static variant lookups
      // (e.g., `align-items: ${({ align }) => align}` with `align: "stretch" | "center" | ...`)
      if (
        !res.valueTransform &&
        !res.wrapValueInTemplateLiteral &&
        !media &&
        (!pseudos || pseudos.length === 0)
      ) {
        if (outs.length === 1 && tryEmitIdentityVariantBuckets(jsxProp, outs[0]!.prop)) {
          continue;
        }
      }
      if (
        !(res as { wrapValueInTemplateLiteral?: boolean }).wrapValueInTemplateLiteral &&
        outs.length === 1 &&
        tryEmitTransformedObservedVariantBuckets(jsxProp, outs[0]!.prop, valueTransform)
      ) {
        continue;
      }

      {
        for (let i = 0; i < outs.length; i++) {
          const out = outs[i]!;
          const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
          const resolvedCallArg = buildResolvedValueTransformCallArg({
            j,
            jsxProp,
            valueTransform,
            parseExpr,
            addResolverImports,
          });
          const outParamName =
            resolvedCallArg || valueTransform
              ? cssPropertyToIdentifier(out.prop, avoidNames)
              : styleFnParamNameForJsxProp(jsxProp, out.prop, avoidNames);
          const scalarCallArg = valueTransform
            ? undefined
            : scalarCallArgForParamName(
                j,
                jsxProp,
                outParamName,
                decl.transientPropRenames?.get(jsxProp),
              );
          const callArg = resolvedCallArg ?? scalarCallArg;
          // Only mark as "always" (no null guard) when we can prove the prop
          // is required via an explicit type annotation.  Without propsType,
          // isJsxPropOptional returns false by default, but the prop may still
          // be optional at runtime (untyped / JS components).
          const hasExplicitType = !!decl.propsType;
          const isOptional = ctx.isJsxPropOptional(jsxProp);
          // When this value is pseudo-gated and a static base for the same
          // property exists, getPropValue folds that base into the function's
          // `default`. The folded base is only emitted when the function runs,
          // so the function must be called unconditionally — otherwise an absent
          // optional prop would drop the base (e.g. `background: slategray;
          // &:hover { background: ${p => p.$c} }` rendered without `$c`).
          const foldsStaticBaseIntoPseudoDefault =
            !media &&
            !!pseudos?.length &&
            staticBaseValueWouldFold((styleObj as Record<string, unknown>)[out.prop]);
          styleFnFromProps.push({
            fnKey,
            jsxProp,
            ...(callArg ? { callArg } : {}),
            ...((hasExplicitType && !isOptional) || foldsStaticBaseIntoPseudoDefault
              ? { condition: "always" as const }
              : {}),
          });

          if (!styleFnDecls.has(fnKey)) {
            // IMPORTANT: don't reuse the same Identifier node for both the function param and
            // expression positions. If the param identifier has a TS annotation, reusing it
            // in expression positions causes printers to emit `value: any` inside templates.
            const param = j.identifier(outParamName);
            const valueId = j.identifier(outParamName);
            // Be permissive: callers might pass numbers (e.g. `${props => props.$width}px`)
            // or strings (e.g. `${props => props.$color}`).
            if (jsxProp !== "__props") {
              annotateParamFromJsxProp(param, jsxProp);
            }
            if (resolvedCallArg && /\.(ts|tsx)$/.test(filePath)) {
              (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                j.tsStringKeyword(),
              );
            }
            // Forcing an always-call on an optional prop passes `T | undefined`
            // into the style function, so widen the param to accept undefined.
            if (
              foldsStaticBaseIntoPseudoDefault &&
              isOptional &&
              jsxProp !== "__props" &&
              /\.(ts|tsx)$/.test(filePath)
            ) {
              const annotated = (param as { typeAnnotation?: { typeAnnotation?: unknown } })
                .typeAnnotation?.typeAnnotation;
              const baseTypeNode = (annotated as ExpressionKind | undefined) ?? j.tsStringKeyword();
              (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                j.tsUnionType([baseTypeNode as never, j.tsUndefinedKeyword()]),
              );
            }
            if (jsxProp?.startsWith?.("$")) {
              ensureShouldForwardPropDrop(decl, jsxProp);
            }

            // If this declaration is a simple interpolated string with a single slot and
            // surrounding static text, preserve it by building a TemplateLiteral around the
            // prop value, e.g. `${value}px`, `opacity ${value}ms`.
            const buildValueExpr = (): any => {
              const transformed = (() => {
                const vt = callArg ? undefined : valueTransform;
                if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                  // Add adapter-resolved imports if present
                  addResolverImports(vt.resolvedImports);
                  // Use adapter-resolved expression, choosing call or member access
                  // based on resolvedUsage (default: "call")
                  if (vt.resolvedExpr) {
                    const resolvedCallee = parseExpr(vt.resolvedExpr);
                    if (vt.resolvedUsage === "memberAccess") {
                      return j.memberExpression(resolvedCallee, valueId, true);
                    }
                    return j.callExpression(resolvedCallee, [valueId]);
                  }
                  return j.callExpression(j.identifier(vt.calleeIdent), [valueId]);
                }
                return valueId;
              })();
              const wrapTemplate = !!(res as { wrapValueInTemplateLiteral?: boolean })
                .wrapValueInTemplateLiteral;
              const transformedValue = wrapTemplate
                ? j.templateLiteral(
                    [
                      j.templateElement({ raw: "", cooked: "" }, false),
                      j.templateElement({ raw: "", cooked: "" }, true),
                    ],
                    [transformed],
                  )
                : transformed;
              const v: any = (d as any).value;
              if (!v || v.kind !== "interpolated") {
                return transformedValue;
              }
              const parts: any[] = v.parts ?? [];
              const slotParts = parts.filter((p: any) => p?.kind === "slot");
              if (slotParts.length !== 1) {
                return transformedValue;
              }
              const onlySlot = slotParts[0]!;
              if (onlySlot.slotId !== slotId) {
                return transformedValue;
              }

              // If it's just the slot, keep it as the raw value (number/string), except
              // number props in CSS text for unitful properties must stay text (`height: 40`),
              // not StyleX numeric px (`height: 40px`).
              const hasStatic = parts.some((p: any) => p?.kind === "static" && p.value !== "");
              if (!hasStatic) {
                if (shouldPreserveNumericCssTextForProp(jsxProp, out.prop)) {
                  return j.templateLiteral(
                    [
                      j.templateElement({ raw: "", cooked: "" }, false),
                      j.templateElement({ raw: "", cooked: "" }, true),
                    ],
                    [transformed],
                  );
                }
                return transformedValue;
              }

              const quasis: any[] = [];
              const exprs: any[] = [];
              let q = "";
              for (const part of parts) {
                if (part?.kind === "static") {
                  q += String(part.value ?? "");
                  continue;
                }
                if (part?.kind === "slot") {
                  quasis.push(j.templateElement({ raw: q, cooked: q }, false));
                  q = "";
                  exprs.push(transformed);
                  continue;
                }
              }
              quasis.push(j.templateElement({ raw: q, cooked: q }, true));
              return maybeOmitPxUnitFromStylexValue(
                j,
                j.templateLiteral(quasis, exprs) as ExpressionKind,
                out.prop,
                d.important,
              );
            };

            const valueExpr = buildValueExpr();
            const getPropValue = (): ExpressionKind => {
              if (!media && !pseudos?.length) {
                return valueExpr;
              }
              if (!media && pseudos?.length) {
                // Pseudo-gated dynamic value (e.g. `&:hover { color: ${p => p.$c} }`).
                // Fold the existing static base value (if any) into the function's
                // `default` so the base declaration isn't clobbered by the later
                // style-function entry in the stylex.props() array.
                const existingStatic = (styleObj as Record<string, unknown>)[out.prop];
                let defaultValue: ExpressionKind = j.literal(null);
                if (existingStatic !== undefined && existingStatic !== null) {
                  if (typeof existingStatic === "object") {
                    if ("type" in (existingStatic as Record<string, unknown>)) {
                      defaultValue = cloneAstNode(existingStatic) as ExpressionKind;
                      delete (styleObj as Record<string, unknown>)[out.prop];
                    }
                    // Plain condition buckets (prior pseudo/media objects) stay in
                    // styleObj; the null default keeps this function pseudo-only.
                  } else {
                    defaultValue = staticValueToLiteral(
                      j,
                      existingStatic as string | number | boolean,
                    ) as ExpressionKind;
                    delete (styleObj as Record<string, unknown>)[out.prop];
                  }
                }
                return j.objectExpression([
                  j.property("init", j.identifier("default"), defaultValue),
                  ...pseudos.map((ps) => j.property("init", j.literal(ps), valueExpr)),
                ]);
              }
              if (!media) {
                return valueExpr;
              }
              if (pseudos?.length) {
                return buildPseudoMediaPropValue({ j, valueExpr, pseudos, media });
              }
              const existingFn = styleFnDecls.get(fnKey);
              let existingValue: ExpressionKind | null = null;
              if (existingFn?.type === "ArrowFunctionExpression") {
                const body = existingFn.body;
                if (body?.type === "ObjectExpression") {
                  const prop = body.properties.find((propNode: unknown) => {
                    if (!propNode || typeof propNode !== "object") {
                      return false;
                    }
                    if ((propNode as { type?: string }).type !== "Property") {
                      return false;
                    }
                    const key = (propNode as { key?: unknown }).key;
                    if (!key || typeof key !== "object") {
                      return false;
                    }
                    const keyType = (key as { type?: string }).type;
                    if (keyType === "Identifier") {
                      return (key as { name?: string }).name === out.prop;
                    }
                    if (keyType === "Literal") {
                      return (key as { value?: unknown }).value === out.prop;
                    }
                    return false;
                  });
                  if (prop && prop.type === "Property") {
                    existingValue = prop.value;
                  }
                }
              }
              const defaultValue = existingValue ?? j.literal(null);
              return j.objectExpression([
                j.property("init", j.identifier("default"), defaultValue),
                j.property("init", j.literal(media), valueExpr),
              ]);
            };
            const propKey = makeCssPropKey(j, out.prop);
            const p = j.property("init", propKey, getPropValue()) as any;
            // Only use shorthand if the key is an identifier (not a string literal for CSS vars)
            const paramName = outParamName;
            p.shorthand =
              propKey.type === "Identifier" &&
              valueExpr?.type === "Identifier" &&
              valueExpr.name === paramName;
            const body = j.objectExpression([p]);
            styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
          }
          if (i === 0) {
            // No direct prop to attach to here; the style function itself is emitted later.
            // We conservatively ignore comment preservation in this path.
          }
        }
      }
      continue;
    }

    if (res && res.type === "keepOriginal") {
      warnings.push({
        severity: "warning",
        type: res.reason,
        loc,
      });
      bail = true;
      break;
    }

    if (decl.shouldForwardProp && d.property) {
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        if (!out.prop) {
          continue;
        }
        const e = decl.templateExpressions[slotId] as any;
        let baseExpr = e;
        let propsParam = j.identifier("props");
        let jsxProp: string = "__props";
        if (e?.type === "ArrowFunctionExpression") {
          if (hasUnsupportedConditionalTest(e)) {
            warnPropInlineStyle(
              decl,
              "Unsupported conditional test in shouldForwardProp",
              d.property,
              loc,
            );
            bail = true;
            break;
          }
          // shouldForwardProp style functions are module-scoped in stylex.create(),
          // so runtime theme values from useTheme() are not available there.
          if (hasThemeAccessInArrowFn(e)) {
            warnPropInlineStyle(
              decl,
              "Unsupported prop-based inline style props.theme access is not supported",
              d.property,
              loc,
            );
            bail = true;
            break;
          }
          const propsUsed = collectPropsFromArrowFn(e);
          for (const propName of propsUsed) {
            ensureShouldForwardPropDrop(decl, propName);
          }
          // Try to unwrap props access (props.$x → $x) for cleaner style functions.
          // When only one transient prop is used, emit a single-param function
          // (e.g., ($size) => ...) instead of (props) => ..., enabling consolidation.
          const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
          if (unwrapped && unwrapped.propsUsed.size === 1) {
            const singleProp = [...unwrapped.propsUsed][0]!;
            propsParam = j.identifier(singleProp);
            jsxProp = singleProp;
            baseExpr = unwrapped.expr;
          } else {
            if (e.params?.[0]?.type === "Identifier") {
              propsParam = j.identifier(e.params[0].name);
            }
            const inlineExpr = inlineArrowFunctionBody(j, e);
            if (!inlineExpr) {
              warnPropInlineStyle(
                decl,
                "Unsupported prop-based inline style expression cannot be safely inlined",
                d.property,
                loc,
              );
              bail = true;
              break;
            }
            baseExpr = inlineExpr;
          }
        }
        // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
        const { prefix, suffix } = extractStaticPartsForDecl(d);
        const numericIdentifiers = numericIdentifierSetForJsxProp(jsxProp, ctx.findJsxPropTsType);
        const omitsPxUnit =
          canOmitPxUnitForStylexNumber(out.prop, prefix, suffix) &&
          isNumericStylexExpression(baseExpr, { numericIdentifiers });
        const expr =
          prefix || suffix
            ? buildStylexValueWithStaticParts(
                j,
                baseExpr,
                prefix,
                suffix,
                out.prop,
                false,
                undefined,
                numericIdentifiers,
              )
            : baseExpr;
        const fnKey = styleKeyWithSuffix(decl.styleKey, out.prop);
        const scalarProps =
          jsxProp === "__props" &&
          e?.type === "ArrowFunctionExpression" &&
          shouldUseScalarDynamicArgs(out.prop, d.valueRaw)
            ? scalarizePropsObjectDynamicValue({
                j,
                valueExpr: expr,
                paramName: propsParam.name,
                propNames: [...collectPropsFromArrowFn(e)],
                bindings: getArrowFnParamBindings(e) ?? undefined,
              })
            : null;
        const shouldPassComputedCallArg =
          !scalarProps &&
          jsxProp !== "__props" &&
          ((Boolean(prefix || suffix) && !omitsPxUnit) ||
            baseExpr.type !== "Identifier" ||
            (baseExpr as { name?: string }).name !== jsxProp);
        const finalParam = shouldPassComputedCallArg
          ? j.identifier(cssPropertyToIdentifier(out.prop, avoidNames))
          : propsParam;
        const params = scalarProps
          ? scalarProps.paramNames.map((propName) => j.identifier(propName))
          : [finalParam];
        if (scalarProps && /\.(ts|tsx)$/.test(filePath)) {
          annotateScalarParams(params, scalarProps.paramNames);
        } else if (shouldPassComputedCallArg && /\.(ts|tsx)$/.test(filePath)) {
          (finalParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            omitsPxUnit
              ? j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()])
              : j.tsStringKeyword(),
          );
        }
        const valueExpr = scalarProps
          ? scalarProps.valueExpr
          : shouldPassComputedCallArg
            ? j.identifier(finalParam.name)
            : expr;
        if (!styleFnDecls.has(fnKey)) {
          const body = j.objectExpression([
            j.property(
              "init",
              makeCssPropKey(j, out.prop),
              buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
            ),
          ]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression(params, body));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          const styleFnEntry = scalarProps
            ? scalarStyleFnEntryFromProps({ j, fnKey, propNames: scalarProps.paramNames })
            : {
                fnKey,
                jsxProp,
                ...(shouldPassComputedCallArg ? { callArg: expr } : {}),
              };
          if (styleFnEntry) {
            styleFnFromProps.push(styleFnEntry);
          }
        }
      }
      if (bail) {
        break;
      }
      continue;
    }

    const describeInterpolation = (): {
      type: WarningType;
      context?: Record<string, unknown>;
    } | null => {
      type SlotPart = { kind: "slot"; slotId: number };
      const valueParts = (d.value as { parts?: unknown[] }).parts ?? [];
      const slotPart = valueParts.find(
        (p): p is SlotPart => !!p && typeof p === "object" && (p as SlotPart).kind === "slot",
      );
      if (!slotPart) {
        return d.property
          ? { type: "Unsupported interpolation: property", context: { property: d.property } }
          : null;
      }
      const expr = decl.templateExpressions[slotPart.slotId] as {
        type?: string;
        name?: string;
        callee?: {
          type?: string;
          name?: string;
          property?: { type?: string; name?: string };
        };
      } | null;
      if (!expr || typeof expr !== "object") {
        return d.property
          ? { type: "Unsupported interpolation: property", context: { property: d.property } }
          : null;
      }
      if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
        // Provide more specific warning based on arrow function body type.
        // Use getFunctionBodyExpr to handle block bodies with single return statements.
        const body = getFunctionBodyExpr(expr as { body?: unknown }) as {
          type?: string;
          operator?: string;
        } | null;
        const bodyType = body?.type;
        if (bodyType === "ConditionalExpression") {
          return {
            type: "Arrow function: conditional branches could not be resolved to static or theme values",
          };
        }
        if (bodyType === "LogicalExpression") {
          const op = body?.operator;
          if (op === "&&") {
            return {
              type: "Arrow function: logical expression pattern not supported",
              context: {
                operator: op,
                hint: "Expected: props.x && 'css-string'",
              },
            };
          }
          if (op === "||" || op === "??") {
            return {
              type: "Arrow function: indexed theme lookup pattern not matched",
              context: { property: d.property, operator: op },
            };
          }
        }
        if (bodyType === "CallExpression") {
          return {
            type: "Arrow function: helper call body is not supported",
            context: { property: d.property },
          };
        }
        if (bodyType === "MemberExpression") {
          return {
            type: "Arrow function: theme access path could not be resolved",
            context: { property: d.property },
          };
        }
        return {
          type: "Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)",
          context: { property: d.property, bodyType },
        };
      }
      if (expr.type === "CallExpression") {
        const callee = expr.callee;
        const calleeName =
          callee?.type === "Identifier"
            ? callee.name
            : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
              ? callee.property.name
              : null;
        return {
          type: "Unsupported interpolation: call expression",
          context: { callExpression: calleeName, property: d.property },
        };
      }
      if (expr.type === "Identifier") {
        return {
          type: "Unsupported interpolation: identifier",
          context: { identifier: expr.name },
        };
      }
      if (isMemberExpression(expr)) {
        return {
          type: "Unsupported interpolation: member expression",
          context: { memberExpression: expr.type },
        };
      }
      return d.property
        ? {
            type: "Unsupported interpolation: call expression",
            context: { expression: d.property },
          }
        : null;
    };

    const warning = describeInterpolation();
    warnings.push({
      severity: "warning",
      type: warning?.type || "Unsupported interpolation: unknown",
      loc: loc ?? decl.loc,
      context: warning?.context,
    });
    bail = true;
    break;
  }

  if (state.bail) {
    bail = true;
  }
  if (bail) {
    state.markBail();
  }
}

/**
 * Searches the function body for a local variable with the given name whose
 * initializer references `fnParamName`. Returns a cloned expression with
 * `fnParamName` replaced by `jsxProp`, or null if no such variable is found.
 *
 * Returns null when the derived expression references other helper-local variables
 * that would not be in scope at the call site.
 */
function resolveDerivedLocalVariable(
  j: JSCodeshift,
  fnBody: unknown,
  fnParamName: string,
  localName: string,
  jsxProp: string,
): ExpressionKind | null {
  const stmts = (fnBody as { body: unknown[] }).body;

  // Collect all local variable names declared in the function body
  const helperLocals = new Set<string>();
  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string } };
      if (vd.id?.type === "Identifier" && vd.id.name) {
        helperLocals.add(vd.id.name);
      }
    }
  }

  for (const stmt of stmts) {
    const s = stmt as { type?: string; declarations?: unknown[] };
    if (s.type !== "VariableDeclaration" || !s.declarations) {
      continue;
    }
    for (const decl_ of s.declarations) {
      const vd = decl_ as { id?: { type?: string; name?: string }; init?: unknown };
      if (vd.id?.type !== "Identifier" || vd.id.name !== localName || !vd.init) {
        continue;
      }
      // Check if the initializer references fnParamName
      const initIds = new Set<string>();
      collectIdentifiers(vd.init, initIds);
      if (!initIds.has(fnParamName)) {
        continue;
      }
      // Bail if the initializer also references other helper-local variables
      // that would not be in scope at the call site
      for (const id of initIds) {
        if (id !== fnParamName && helperLocals.has(id)) {
          return null;
        }
      }
      // Build the callArg by replacing fnParamName with jsxProp in the initializer
      const clonedInit = cloneAstNode(vd.init) as ExpressionKind;
      const replaceParam = (node: unknown): unknown => {
        if (!node || typeof node !== "object") {
          return node;
        }
        if (Array.isArray(node)) {
          return node.map(replaceParam);
        }
        const rec = node as Record<string, unknown>;
        if (rec.type === "Identifier" && rec.name === fnParamName) {
          return j.identifier(jsxProp);
        }
        for (const key of Object.keys(rec)) {
          if (key === "loc" || key === "comments") {
            continue;
          }
          const child = rec[key];
          if (child && typeof child === "object") {
            rec[key] = replaceParam(child);
          }
        }
        return rec;
      };
      return replaceParam(clonedInit) as ExpressionKind;
    }
  }
  return null;
}

function isPseudoElementSelector(pseudoElement: string | null): boolean {
  return (
    pseudoElement === "::before" || pseudoElement === "::after" || pseudoElement === "::placeholder"
  );
}

/**
 * Whether a base style value for a property would be folded into a pseudo-gated
 * dynamic style function's `default` (mirrors the fold logic in getPropValue):
 * plain primitives and AST-node values fold; existing pseudo/media condition
 * buckets (plain objects without a `type` discriminator) do not.
 */
function staticBaseValueWouldFold(existingStatic: unknown): boolean {
  if (existingStatic === undefined || existingStatic === null) {
    return false;
  }
  if (typeof existingStatic === "object") {
    return "type" in (existingStatic as Record<string, unknown>);
  }
  return true;
}

function tryHandleLocalCustomPropertyDefinition(args: {
  j: JSCodeshift;
  d: CssDeclarationIR;
  decl: StyledDecl;
  expr: unknown;
  getOrCreateLocalStylexVar: (cssName: string, defaultValue: string) => LocalStylexVarRef;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; keyExpr?: ExpressionKind }>;
}): boolean {
  const { j, d, decl, expr, getOrCreateLocalStylexVar, inlineStyleProps } = args;
  if (!expr || typeof expr !== "object") {
    return false;
  }
  const arrow = expr as {
    type?: string;
    params?: unknown[];
    body?: unknown;
  };
  if (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression") {
    return false;
  }
  const paramName =
    arrow.params?.[0] && (arrow.params[0] as { type?: string; name?: string }).type === "Identifier"
      ? (arrow.params[0] as { name: string }).name
      : null;
  if (!paramName) {
    return false;
  }
  const body = getFunctionBodyExpr(arrow) as {
    type?: string;
    test?: unknown;
    consequent?: unknown;
    alternate?: unknown;
  } | null;
  if (body?.type !== "ConditionalExpression") {
    return false;
  }
  const conditionProp = getSinglePropFromMemberExpr(body.test, paramName);
  if (!conditionProp || !isEmptyCssExpression(body.alternate)) {
    return false;
  }
  const customValue = parseCustomPropertyTemplateValue(
    d.property ?? null,
    body.consequent,
    paramName,
  );
  if (!customValue) {
    return false;
  }
  const defaultValue = findLocalCustomPropertyFallback(customValue.cssName, decl);
  if (!defaultValue) {
    return false;
  }
  const localVar = getOrCreateLocalStylexVar(customValue.cssName, defaultValue);
  const propName = conditionProp.startsWith("$") ? conditionProp.slice(1) : conditionProp;
  const valueExpr = buildTemplateWithStaticParts(
    j,
    j.identifier(propName),
    customValue.prefix,
    customValue.suffix,
  );
  inlineStyleProps.push({
    prop: customValue.cssName,
    expr: j.conditionalExpression(j.identifier(propName), valueExpr, j.identifier("undefined")),
    keyExpr: stylexVarMemberExpression(j, localVar),
  });
  if (conditionProp.startsWith("$")) {
    ensureShouldForwardPropDrop(decl, conditionProp);
  }
  decl.needsWrapperComponent = true;
  return true;
}

function tryHandleRuntimeConditionalStaticBranches(
  ctx: Pick<DeclProcessingState, "decl" | "state" | "applyVariant" | "getBaseStyleTarget">,
  args: {
    rule: CssRuleIR;
    allRules: readonly CssRuleIR[];
    d: CssDeclarationIR;
    media: string | undefined;
    pseudos: string[] | null;
    pseudoElement: string | null;
    attrTarget: Record<string, unknown> | null;
    resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  },
): boolean {
  const { decl, state, applyVariant, getBaseStyleTarget } = ctx;
  const { j } = state;
  const { rule, allRules, d, media, pseudos, pseudoElement, attrTarget, resolvedSelectorMedia } =
    args;
  if (
    !d.property ||
    d.value.kind !== "interpolated" ||
    rule.selector.trim() !== "&" ||
    media ||
    attrTarget ||
    pseudos?.length ||
    pseudoElement ||
    resolvedSelectorMedia
  ) {
    return false;
  }

  const parts = d.value.parts ?? [];
  const slotParts = parts.filter(
    (part: { kind?: string }): part is { kind: "slot"; slotId: number } => part.kind === "slot",
  );
  if (slotParts.length !== 1) {
    return false;
  }

  const expr = decl.templateExpressions[slotParts[0]!.slotId] as
    | {
        type?: string;
        test?: ExpressionKind;
        consequent?: ExpressionKind;
        alternate?: ExpressionKind;
      }
    | undefined;
  if (
    !expr ||
    expr.type !== "ConditionalExpression" ||
    !expr.test ||
    !expr.consequent ||
    !expr.alternate ||
    !isImportedRuntimeCondition(expr.test, state.importMap)
  ) {
    return false;
  }

  const consequentValue = literalToStaticValue(expr.consequent);
  const alternateValue = literalToStaticValue(expr.alternate);
  if (
    consequentValue === null ||
    alternateValue === null ||
    typeof consequentValue === "boolean" ||
    typeof alternateValue === "boolean"
  ) {
    return false;
  }

  const when = expressionToSource(j, expr.test);
  if (!when) {
    return false;
  }

  const buildBranchValue = (slotValue: string | number): string => {
    let value = "";
    for (const part of parts) {
      value += part.kind === "slot" ? String(slotValue) : (part.value ?? "");
    }
    return value;
  };

  const consequentStyle = buildStaticBranchStyle(d, buildBranchValue(consequentValue));
  const alternateStyle = buildStaticBranchStyle(d, buildBranchValue(alternateValue));
  if (!consequentStyle || !alternateStyle) {
    return false;
  }
  if (!sameStyleProps(consequentStyle, alternateStyle)) {
    state.bailUnsupported(decl, "Unsupported interpolation: call expression");
    return true;
  }
  if (
    !subtractLaterStaticOverrides({
      rule,
      allRules,
      currentDecl: d,
      branchStyles: [consequentStyle, alternateStyle],
    })
  ) {
    state.bailUnsupported(decl, "Unsupported interpolation: call expression");
    return true;
  }
  if (!Object.keys(consequentStyle).length && !Object.keys(alternateStyle).length) {
    // Every branch property is unconditionally overridden by a later static
    // declaration, so the conditional is dead — the later declarations carry
    // the final values.
    return true;
  }

  const target = getBaseStyleTarget();
  for (const [prop, value] of Object.entries(alternateStyle)) {
    target[prop] = value;
  }
  applyVariant({ when }, consequentStyle);
  decl.needsWrapperComponent = true;
  recordNonPropConditionRoots(decl, expr.test);
  return true;
}

/**
 * Records the root identifiers of an imported runtime condition on the decl so
 * wrapper emission treats them as module-scope bindings rather than component
 * props (which matters for lowercase roots like `browser.isTouchDevice`).
 */
function recordNonPropConditionRoots(decl: StyledDecl, test: ExpressionKind): void {
  const roots = (decl.nonPropConditionRoots ??= new Set<string>());
  const visit = (expr: ExpressionKind): void => {
    if (expr.type === "LogicalExpression") {
      visit(expr.left as ExpressionKind);
      visit(expr.right as ExpressionKind);
      return;
    }
    if (expr.type === "UnaryExpression") {
      visit(expr.argument as ExpressionKind);
      return;
    }
    const info = extractRootAndPath(expr);
    if (info && info.path.length > 0) {
      roots.add(info.rootName);
    }
  };
  visit(test);
}

function buildStaticBranchStyle(
  d: CssDeclarationIR,
  rawValue: string,
): Record<string, unknown> | null {
  if (d.property === "background" && isUnsupportedBackgroundShorthandValue(rawValue)) {
    return null;
  }

  const staticDecl: CssDeclarationIR = {
    ...d,
    value: { kind: "static", value: rawValue },
    valueRaw: rawValue,
  };
  const style: Record<string, unknown> = {};
  for (const out of cssDeclarationToStylexDeclarations(staticDecl)) {
    if (out.value.kind !== "static") {
      return null;
    }
    let value = cssValueToJs(out.value, d.important, out.prop);
    if (out.prop === "content" && typeof value === "string") {
      value = normalizeCssContentValue(value);
    }
    style[out.prop] = value;
  }
  return Object.keys(style).length ? style : null;
}

function sameStyleProps(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = new Set(Object.keys(right));
  return leftKeys.length === rightKeys.size && leftKeys.every((key) => rightKeys.has(key));
}

/**
 * Removes branch properties that are unconditionally overridden by later static
 * declarations in the same selector context, so the runtime variant cannot
 * invert the original CSS cascade. Partially overridden directional props are
 * narrowed to the longhands that survive the override (e.g. `marginBlock`
 * overridden by a later `margin-top` becomes `marginBlockEnd`).
 *
 * Returns false when a later overlapping declaration cannot be subtracted
 * safely (conditional at-rule context, dynamic value, property-less helper, or
 * a multi-token branch value that cannot be split per longhand) — the caller
 * must bail in that case.
 */
function subtractLaterStaticOverrides(args: {
  rule: CssRuleIR;
  allRules: readonly CssRuleIR[];
  currentDecl: CssDeclarationIR;
  branchStyles: Array<Record<string, unknown>>;
}): boolean {
  const { rule, allRules, currentDecl, branchStyles } = args;
  const currentIndex = rule.declarations.indexOf(currentDecl);
  if (currentIndex === -1) {
    return true;
  }
  const laterContexts: Array<{
    declarations: readonly CssDeclarationIR[];
    unconditional: boolean;
  }> = [{ declarations: rule.declarations.slice(currentIndex + 1), unconditional: true }];
  const currentRuleIndex = allRules.indexOf(rule);
  if (currentRuleIndex !== -1) {
    for (const laterRule of allRules.slice(currentRuleIndex + 1)) {
      if (laterRule.selector !== rule.selector) {
        continue;
      }
      laterContexts.push({
        declarations: laterRule.declarations,
        unconditional: sameAtRuleStack(laterRule.atRuleStack, rule.atRuleStack),
      });
    }
  }

  const branchProps = (): string[] => [
    ...new Set(branchStyles.flatMap((style) => Object.keys(style))),
  ];
  for (const context of laterContexts) {
    for (const laterDecl of context.declarations) {
      if (!laterDecl.property) {
        // Property-less interpolation (e.g. a helper mixin) may set anything.
        if (branchProps().length) {
          return false;
        }
        continue;
      }
      // A later `border`/`border-<side>` shorthand resets the style/color
      // sub-properties it omits, but cssDeclarationToStylexDeclarations only
      // reports the explicit longhands (e.g. just borderTopWidth for
      // `border-top: 1px`). Subtracting those would leave the branch's
      // borderStyle/borderColor in place, drawing a border the cascade reset
      // away — bail when such a shorthand overlaps a branch property.
      if (isBorderShorthandProperty(laterDecl.property)) {
        const borderProps = new Set(
          cssDeclarationToStylexDeclarations(laterDecl).map((out) => out.prop),
        );
        if (
          branchProps().some((prop) =>
            [...borderProps].some((borderProp) => stylexPropsOverlap(prop, borderProp)),
          )
        ) {
          return false;
        }
        continue;
      }
      for (const out of cssDeclarationToStylexDeclarations(laterDecl)) {
        const overrideProp = out.prop;
        const overlapped = branchProps().filter((prop) => stylexPropsOverlap(prop, overrideProp));
        if (!overlapped.length) {
          continue;
        }
        // An earlier `!important` declaration wins over a later non-important one
        // regardless of source order. Subtracting it would drop the conditional
        // branch and let the later declaration clobber the base, inverting the
        // cascade — bail instead so the important branches are preserved.
        if (currentDecl.important && !laterDecl.important) {
          return false;
        }
        if (!context.unconditional || laterDecl.value.kind !== "static") {
          return false;
        }
        for (const branch of branchStyles) {
          if (!subtractOverrideFromBranch(branch, overlapped, overrideProp)) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function sameAtRuleStack(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, i) => entry === right[i]);
}

/** True for the `border` / `border-<side>` shorthands (not the longhands). */
function isBorderShorthandProperty(property: string): boolean {
  return /^border(?:-(?:top|right|bottom|left))?$/.test(property.trim());
}

function subtractOverrideFromBranch(
  branch: Record<string, unknown>,
  overlappedProps: string[],
  overrideProp: string,
): boolean {
  const overridePhysical = new Set(physicalLonghandExpansion(overrideProp));
  const overrideIsLogical = isLogicalDirectionalProp(overrideProp);
  for (const branchProp of overlappedProps) {
    if (!(branchProp in branch)) {
      continue;
    }
    const branchPhysical = physicalLonghandExpansion(branchProp);
    const remainder = branchPhysical.filter((prop) => !overridePhysical.has(prop));
    if (remainder.length === branchPhysical.length) {
      // Related (same directional group) but physically disjoint — no override.
      continue;
    }
    // A logical directional longhand (e.g. `marginInline`/`marginBlock`) maps to
    // physical sides differently per writing mode, so its overlap with a fixed
    // physical side is only knowable for horizontal-tb. Without the element's
    // `writing-mode`, a mixed logical/physical override is ambiguous — bail
    // rather than subtract using a hard-coded axis assumption.
    if (isLogicalDirectionalProp(branchProp) !== overrideIsLogical) {
      return false;
    }
    const value = branch[branchProp];
    delete branch[branchProp];
    if (!remainder.length) {
      continue;
    }
    if (!isSingleCssToken(value)) {
      return false;
    }
    for (const physical of remainder) {
      // Same representation on both sides: a logical override leaves a logical
      // survivor, a physical override a physical one.
      const name =
        overrideIsLogical && LOGICAL_TO_PHYSICAL[branchProp]
          ? logicalFormForPhysical(branchProp, physical)
          : physical;
      if (!name) {
        return false;
      }
      branch[name] = value;
    }
  }
  return true;
}

/**
 * True for a logical directional longhand whose physical side(s) depend on the
 * writing mode — `marginInline`, `paddingBlockEnd`, `scrollMarginInlineStart`,
 * etc. The physical-neutral full shorthands (`margin`, `padding`) and physical
 * sides (`marginTop`) are not logical.
 */
function isLogicalDirectionalProp(prop: string): boolean {
  return LOGICAL_TO_PHYSICAL[prop] !== undefined;
}

/** Physical longhands covered by a StyleX directional/border property. */
function physicalLonghandExpansion(prop: string): string[] {
  const group = SHORTHAND_LONGHANDS[prop];
  if (group) {
    return [...group.physical];
  }
  const logical = LOGICAL_TO_PHYSICAL[prop];
  if (logical) {
    return [...logical];
  }
  const borderMatch = prop.match(/^border(Top|Right|Bottom|Left)?(Width|Style|Color)$/);
  if (borderMatch) {
    const side = borderMatch[1];
    const kind = borderMatch[2]!;
    return side ? [prop] : ["Top", "Right", "Bottom", "Left"].map((s) => `border${s}${kind}`);
  }
  return [prop];
}

/** Maps a physical longhand back to the Start/End form of a logical branch prop. */
function logicalFormForPhysical(logicalProp: string, physical: string): string | null {
  for (const [name, physicalProps] of Object.entries(LOGICAL_TO_PHYSICAL)) {
    if (
      physicalProps.length === 1 &&
      physicalProps[0] === physical &&
      name.startsWith(logicalProp)
    ) {
      return name;
    }
  }
  return null;
}

function isSingleCssToken(value: unknown): boolean {
  if (typeof value === "number") {
    return true;
  }
  return typeof value === "string" && value.trim() !== "" && !/\s/.test(value.trim());
}

function stylexPropsOverlap(left: string, right: string): boolean {
  const leftRelated = relatedDirectionalProps(left);
  const rightRelated = relatedDirectionalProps(right);
  return [...leftRelated].some((prop) => rightRelated.has(prop));
}

function relatedDirectionalProps(prop: string): Set<string> {
  const related = new Set([prop]);
  const addDirectionalGroup = (shorthand: string): void => {
    const group = SHORTHAND_LONGHANDS[shorthand];
    if (!group) {
      return;
    }
    related.add(shorthand);
    for (const item of [...group.logical, ...group.physical]) {
      related.add(item);
    }
  };

  const directGroup = SHORTHAND_LONGHANDS[prop];
  if (directGroup) {
    addDirectionalGroup(prop);
  }
  for (const [logical, physical] of Object.entries(LOGICAL_TO_PHYSICAL)) {
    if (prop === logical || physical.includes(prop)) {
      const shorthand = Object.entries(SHORTHAND_LONGHANDS).find(([, group]) =>
        group.logical.includes(logical),
      )?.[0];
      if (shorthand) {
        addDirectionalGroup(shorthand);
      }
    }
  }
  addRelatedBorderLonghands(prop, related);
  return related;
}

function addRelatedBorderLonghands(prop: string, related: Set<string>): void {
  const borderMatch = prop.match(/^border(?:(Top|Right|Bottom|Left))?(Width|Style|Color)$/);
  const kind = borderMatch?.[2];
  if (!kind) {
    return;
  }
  related.add(`border${kind}`);
  for (const side of ["Top", "Right", "Bottom", "Left"]) {
    related.add(`border${side}${kind}`);
  }
}

function isImportedRuntimeCondition(
  expr: ExpressionKind,
  importMap: ReadonlyMap<string, unknown>,
): boolean {
  const info = extractRootAndPath(expr);
  if (info && info.path.length > 0 && importMap.has(info.rootName)) {
    return true;
  }
  if (expr.type === "LogicalExpression" && expr.operator === "&&") {
    return (
      isImportedRuntimeCondition(expr.left as ExpressionKind, importMap) &&
      isImportedRuntimeCondition(expr.right as ExpressionKind, importMap)
    );
  }
  if (expr.type === "UnaryExpression" && expr.operator === "!") {
    return isImportedRuntimeCondition(expr.argument as ExpressionKind, importMap);
  }
  return false;
}

function isImportedShorthandUnitValue(
  d: CssDeclarationIR,
  decl: StyledDecl,
  importMap: ReadonlyMap<string, unknown>,
  numericIdentifiers: ReadonlySet<string>,
): boolean {
  if (!d.property || !isCssShorthandProperty(d.property)) {
    return false;
  }
  const staticParts = getSingleSlotStaticParts(d, decl);
  if (!staticParts || !/^[a-zA-Z%]/.test(staticParts.suffix)) {
    return false;
  }
  const slotPart =
    d.value.kind === "interpolated" ? d.value.parts.find((part) => part.kind === "slot") : null;
  const expr =
    slotPart && slotPart.kind === "slot"
      ? (decl.templateExpressions[slotPart.slotId] as ExpressionKind | undefined)
      : undefined;
  const info = extractRootAndPath(expr);
  if (!info || !importMap.has(info.rootName)) {
    return false;
  }
  // `margin`/`padding` whose whole value is a single proven-numeric token (e.g.
  // `margin: ${NumericConsts.x}px`) are valid in StyleX as-is: the value cannot
  // expand to multiple tokens and StyleX's compiler expands the shorthand
  // internally, so the interpolated-string handler can emit it directly. The
  // `scroll-margin`/`scroll-padding` shorthands are excluded because StyleX does
  // not accept them — they must be written as physical longhands.
  if (
    (d.property === "margin" || d.property === "padding") &&
    staticParts.prefix.trim() === "" &&
    /^[a-zA-Z%]+$/.test(staticParts.suffix.trim()) &&
    numericIdentifiers.has(info.rootName)
  ) {
    return false;
  }
  return true;
}

function expressionToSource(j: JSCodeshift, expr: ExpressionKind): string | null {
  try {
    return j(expr).toSource();
  } catch {
    return null;
  }
}

function findLocalCustomPropertyFallback(cssName: string, decl: StyledDecl): string | null {
  for (const rule of decl.rules) {
    for (const candidate of rule.declarations) {
      if (candidate.property !== cssName || candidate.value.kind !== "static") {
        continue;
      }
      const staticValue = String(candidate.value.value);
      if (staticValue) {
        return staticValue;
      }
    }
  }
  for (const rule of decl.rules) {
    for (const candidate of rule.declarations) {
      const value = candidate.value.kind === "static" ? String(candidate.value.value) : null;
      if (value === null) {
        continue;
      }
      for (const call of findCssVarCallsInString(value)) {
        if (call.name === cssName && call.fallback) {
          return call.fallback;
        }
      }
    }
  }
  return null;
}

function parseCustomPropertyTemplateValue(
  expectedCssName: string | null,
  node: unknown,
  paramName: string,
): { cssName: string; prefix: string; suffix: string } | null {
  const tpl = node as {
    type?: string;
    quasis?: Array<{ value?: { cooked?: string; raw?: string } }>;
    expressions?: unknown[];
  };
  if (tpl.type !== "TemplateLiteral" || !tpl.quasis || !tpl.expressions) {
    return null;
  }

  if (tpl.quasis.length !== 2 || tpl.expressions.length !== 1) {
    return null;
  }
  if (!getSinglePropFromMemberExpr(tpl.expressions[0], paramName)) {
    return null;
  }
  const prefixText = tpl.quasis[0]?.value?.cooked ?? tpl.quasis[0]?.value?.raw ?? "";
  const suffixWithTerminator = tpl.quasis[1]?.value?.cooked ?? tpl.quasis[1]?.value?.raw ?? "";
  const declarationMatch = prefixText.trimStart().match(/^(--[-_a-zA-Z0-9]+)\s*:/);
  const cssName = declarationMatch?.[1] ?? null;
  if (!cssName || (expectedCssName && cssName !== expectedCssName)) {
    return null;
  }
  const declarationPrefix = `${cssName}:`;
  return {
    cssName,
    prefix: prefixText
      .slice(prefixText.indexOf(declarationPrefix) + declarationPrefix.length)
      .trimStart(),
    suffix: suffixWithTerminator.replace(/;\s*$/, ""),
  };
}

function isEmptyCssExpression(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return node == null || node === false;
  }
  const typed = node as { type?: string; value?: unknown };
  if (typed.type === "StringLiteral" || typed.type === "Literal") {
    return typed.value === "";
  }
  if (typed.type === "NullLiteral") {
    return true;
  }
  if (typed.type === "BooleanLiteral") {
    return typed.value === false;
  }
  return false;
}

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

function isEntireInterpolatedValueSingleSlot(d: CssDeclarationIR, decl: StyledDecl): boolean {
  return getSingleSlotStaticParts(d, decl) !== null;
}

type StaticParts = { prefix: string; suffix: string };

function getSingleSlotStaticParts(d: CssDeclarationIR, decl: StyledDecl): StaticParts | null {
  if (d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts ?? [];
  const slotParts = parts.filter((part) => part.kind === "slot");
  if (slotParts.length !== 1) {
    return null;
  }
  const slot = slotParts[0]!;
  if (decl.templateExpressions[slot.slotId] === undefined) {
    return null;
  }
  return extractStaticPartsForDecl(d);
}

type NumericCssEmissionMode = "stylexNumber" | "cssText";

function getNumericCssEmissionMode(stylexProp: string): NumericCssEmissionMode {
  if (stylexProp.startsWith("--")) {
    return "cssText";
  }
  return UNITLESS_NUMERIC_STYLEX_PROPS.has(stylexProp) ? "stylexNumber" : "cssText";
}

type ResolvedStylesCallMeta = {
  imports?: ImportSpec[];
  resolveCallResult?: unknown;
  resolveCallContext?: CallResolveContext;
};

function isUnchangedImportedHelperStyleCall(
  res: ResolvedStylesCallMeta,
  exprAst: unknown,
  originalExpr: unknown,
): boolean {
  const resolveResult = res.resolveCallResult;
  const resolveContext = res.resolveCallContext;
  const typedResult =
    resolveResult && typeof resolveResult === "object"
      ? (resolveResult as { cssText?: string; imports?: unknown[] })
      : null;
  if (!typedResult || !resolveContext || typedResult.cssText) {
    return false;
  }
  if (!isCallExpressionLike(exprAst) || !isCallExpressionLike(originalExpr)) {
    return false;
  }
  if (calleeKey(exprAst.callee) !== calleeKey(originalExpr.callee)) {
    return false;
  }
  return !redirectsOriginalCalleeToDifferentSource(res, resolveContext);
}

function redirectsOriginalCalleeToDifferentSource(
  res: ResolvedStylesCallMeta,
  resolveContext: CallResolveContext,
): boolean {
  const imports =
    res.imports ??
    (res.resolveCallResult && typeof res.resolveCallResult === "object"
      ? (res.resolveCallResult as { imports?: ImportSpec[] }).imports
      : undefined) ??
    [];
  const matchingImport = imports.find((importSpec) =>
    importSpec.names.some(
      (name) =>
        name.imported === resolveContext.calleeImportedName ||
        name.local === resolveContext.calleeImportedName,
    ),
  );
  return Boolean(matchingImport && !sourcesReferToSameImport(matchingImport.from, resolveContext));
}

function sourcesReferToSameImport(
  left: ImportSpec["from"],
  resolveContext: CallResolveContext,
): boolean {
  const right = resolveContext.calleeSource;
  if (left.value === right.value) {
    return true;
  }
  return (
    specifierMatchesAbsolutePath(left, right, resolveContext.callSiteFilePath) ||
    specifierMatchesAbsolutePath(right, left, resolveContext.callSiteFilePath)
  );
}

function specifierMatchesAbsolutePath(
  maybeSpecifier: ImportSpec["from"] | CallResolveContext["calleeSource"],
  maybeAbsolute: ImportSpec["from"] | CallResolveContext["calleeSource"],
  callSiteFilePath: string,
): boolean {
  if (maybeSpecifier.kind !== "specifier" || maybeAbsolute.kind !== "absolutePath") {
    return false;
  }
  const specifier = maybeSpecifier.value.replace(/\\/g, "/");
  if (!isRelativeSpecifier(specifier)) {
    return false;
  }
  const resolvedSpecifier = pathResolve(dirname(callSiteFilePath), specifier).replace(/\\/g, "/");
  const absolutePath = maybeAbsolute.value.replace(/\\/g, "/");
  return importPathCandidates(resolvedSpecifier).some((candidate) => absolutePath === candidate);
}

function importPathCandidates(resolvedSpecifier: string): string[] {
  const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs", ".cts", ".cjs"];
  return extensions.flatMap((extension) => [
    `${resolvedSpecifier}${extension}`,
    `${resolvedSpecifier}/index${extension}`,
  ]);
}

function isCallExpressionLike(node: unknown): node is { type: "CallExpression"; callee: unknown } {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "CallExpression"
  );
}

function calleeKey(callee: unknown): string | null {
  const node = callee as {
    type?: string;
    name?: string;
    object?: unknown;
    property?: { type?: string; name?: string };
    computed?: boolean;
  };
  if (node?.type === "Identifier" && node.name) {
    return node.name;
  }
  if (
    node?.type === "MemberExpression" &&
    node.computed !== true &&
    node.property?.type === "Identifier" &&
    node.property.name
  ) {
    const objectKey = calleeKey(node.object);
    return objectKey ? `${objectKey}.${node.property.name}` : null;
  }
  return null;
}

function emitStaticObservedValue(
  value: string | number,
  stylexProp: string,
  isObservedNumeric: boolean,
  staticParts: StaticParts,
): string | number {
  if (typeof value !== "number" || !isObservedNumeric) {
    return value;
  }
  if (canOmitPxUnitForStylexNumber(stylexProp, staticParts.prefix, staticParts.suffix)) {
    return staticParts.prefix === "-" ? -value : value;
  }
  if (staticParts.prefix || staticParts.suffix) {
    return `${staticParts.prefix}${value}${staticParts.suffix}`;
  }
  return getNumericCssEmissionMode(stylexProp) === "stylexNumber" ? value : String(value);
}

function staticVariantStyleObject(
  stylexProp: string,
  value: string | number,
): Record<string, string | number> {
  if (stylexProp !== "borderRadius" || typeof value !== "string") {
    return { [stylexProp]: value };
  }
  const expanded = expandBorderRadiusShorthandValue(value);
  if (!expanded) {
    return { [stylexProp]: value };
  }
  return {
    borderTopLeftRadius: expanded.topLeft,
    borderTopRightRadius: expanded.topRight,
    borderBottomRightRadius: expanded.bottomRight,
    borderBottomLeftRadius: expanded.bottomLeft,
  };
}

function buildRuntimeObservedValueExpr(
  j: JSCodeshift,
  stylexProp: string,
  valueExpr: ExpressionKind,
  staticParts: StaticParts,
  numericIdentifiers: ReadonlySet<string> = new Set(),
): ExpressionKind {
  if (
    canOmitPxUnitForStylexNumber(stylexProp, staticParts.prefix, staticParts.suffix) &&
    isNumericStylexExpression(valueExpr, { numericIdentifiers })
  ) {
    return staticParts.prefix === "-"
      ? (j.unaryExpression("-", valueExpr, true) as ExpressionKind)
      : valueExpr;
  }
  if (!staticParts.prefix && !staticParts.suffix) {
    if (getNumericCssEmissionMode(stylexProp) === "stylexNumber") {
      return valueExpr;
    }
  }
  return j.templateLiteral(
    [
      j.templateElement({ raw: staticParts.prefix, cooked: staticParts.prefix }, false),
      j.templateElement({ raw: staticParts.suffix, cooked: staticParts.suffix }, true),
    ],
    [valueExpr],
  ) as ExpressionKind;
}

function buildObservedExpressionFallbackValueExpr(args: {
  j: JSCodeshift;
  expression: ExpressionKind;
  jsxProp: string;
  stylexProp: string;
  paramName: string;
  param: ExpressionKind;
  prefix: string;
  suffix: string;
}): ExpressionKind | null {
  const { j, expression, jsxProp, stylexProp, paramName, param, prefix, suffix } = args;
  const propNames = new Set([jsxProp, jsxProp.startsWith("$") ? jsxProp.slice(1) : jsxProp]);
  let replaced = false;
  const rewritten = mapAst(cloneAstNode(expression), (node) => {
    if (isMemberExpression(node)) {
      const memberPath = extractRootAndPath(node);
      const propName = memberPath?.path[0];
      if (
        memberPath?.rootName === paramName &&
        memberPath.path.length === 1 &&
        propName &&
        propNames.has(propName)
      ) {
        replaced = true;
        return cloneAstNode(param);
      }
      return undefined;
    }
    if (node.type === "Identifier" && propNames.has(node.name as string)) {
      replaced = true;
      return cloneAstNode(param);
    }
    return undefined;
  }) as ExpressionKind;
  if (!replaced) {
    return null;
  }
  return prefix || suffix
    ? buildStylexValueWithStaticParts(j, rewritten, prefix, suffix, stylexProp)
    : rewritten;
}

function isNumberLikeTsType(tsType: unknown): boolean {
  if (!tsType || typeof tsType !== "object") {
    return false;
  }
  const type = tsType as { type?: string; types?: unknown[]; literal?: { value?: unknown } };
  if (type.type === "TSNumberKeyword") {
    return true;
  }
  if (type.type === "TSLiteralType") {
    return typeof type.literal?.value === "number";
  }
  if (type.type === "TSUnionType" && Array.isArray(type.types)) {
    return type.types.length > 0 && type.types.every(isNumberLikeTsType);
  }
  return false;
}

function numericIdentifierSetForJsxProp(
  jsxProp: string,
  findJsxPropTsType: (propName: string) => unknown,
): ReadonlySet<string> {
  if (jsxProp === "__props" || !isNumericOrOptionalTsType(findJsxPropTsType(jsxProp))) {
    return new Set();
  }
  const names = new Set([jsxProp]);
  if (jsxProp.startsWith("$")) {
    names.add(jsxProp.slice(1));
  }
  return names;
}

function isNumericOrOptionalTsType(tsType: unknown): boolean {
  if (!tsType || typeof tsType !== "object") {
    return false;
  }
  const type = tsType as { type?: string; types?: unknown[]; literal?: { value?: unknown } };
  if (type.type === "TSNumberKeyword") {
    return true;
  }
  if (type.type === "TSLiteralType") {
    return typeof type.literal?.value === "number";
  }
  if (type.type === "TSUnionType" && Array.isArray(type.types)) {
    return type.types.every((member) => {
      const memberType = (member as { type?: string } | null)?.type;
      return (
        memberType === "TSUndefinedKeyword" ||
        memberType === "TSNullKeyword" ||
        isNumericOrOptionalTsType(member)
      );
    });
  }
  return false;
}

const UNITLESS_NUMERIC_STYLEX_PROPS = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "fontWeight",
  "gridArea",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowStart",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
]);

function buildFullInterpolatedDeclarationValueExpr(
  j: JSCodeshift,
  decl: StyledDecl,
  d: CssDeclarationIR,
): ExpressionKind | null {
  if (d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts ?? [];
  const slotCount = parts.filter((p) => p.kind === "slot").length;
  if (slotCount <= 1) {
    return null;
  }

  const quasis: any[] = [];
  const expressions: any[] = [];
  let raw = "";

  for (const part of parts) {
    if (part.kind === "static") {
      raw += String(part.value ?? "");
      continue;
    }
    if (part.kind !== "slot") {
      continue;
    }

    const expr = decl.templateExpressions[part.slotId] as any;
    if (!expr) {
      return null;
    }
    const valueExpr =
      expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression"
        ? inlineArrowFunctionBody(j, expr)
        : cloneAstNode(expr);
    if (!valueExpr) {
      return null;
    }

    quasis.push(j.templateElement({ raw, cooked: raw }, false));
    expressions.push(valueExpr);
    raw = "";
  }

  quasis.push(j.templateElement({ raw, cooked: raw }, true));
  return j.templateLiteral(quasis, expressions);
}

function isCssCalcOperator(operator: string | undefined): boolean {
  return operator === "+" || operator === "-" || operator === "*" || operator === "/";
}

function buildCssCalcTemplateExpression(args: {
  j: JSCodeshift;
  operator: string;
  unit?: string;
  negate?: boolean;
  staticIdentifierValues?: ReadonlyMap<string, string | number | boolean>;
  left: { node: unknown; allowExpression: boolean };
  right: { node: unknown; allowExpression: boolean };
}): ExpressionKind | null {
  const expressions: ExpressionKind[] = [];
  const quasis: string[] = [];
  let currentQuasi = "calc(";

  const appendOperand = (
    operand: { node: unknown; allowExpression: boolean },
    options: { negate?: boolean } = {},
  ): boolean => {
    const staticText = expressionToCalcStaticText(
      operand.node,
      args.unit,
      args.staticIdentifierValues,
    );
    if (staticText !== null) {
      currentQuasi += options.negate ? negateCalcStaticText(staticText) : staticText;
      return true;
    }
    if (!operand.allowExpression || !isStylexCalcExpression(operand.node)) {
      return false;
    }
    if (options.negate) {
      currentQuasi += "-1 * ";
    }
    quasis.push(currentQuasi);
    currentQuasi = "";
    expressions.push(operand.node as ExpressionKind);
    return true;
  };

  if (!appendOperand(args.left, { negate: args.negate })) {
    return null;
  }
  const operator = args.negate ? negateCssCalcOperator(args.operator) : args.operator;
  currentQuasi += ` ${operator} `;
  if (!appendOperand(args.right)) {
    return null;
  }
  currentQuasi += ")";

  if (expressions.length === 0) {
    return args.j.literal(currentQuasi);
  }
  quasis.push(currentQuasi);
  if (quasis.length !== expressions.length + 1) {
    return null;
  }

  return args.j.templateLiteral(
    quasis.map((raw, index) =>
      args.j.templateElement({ raw, cooked: raw }, index === quasis.length - 1),
    ),
    expressions,
  ) as ExpressionKind;
}

function buildNegatedCssTokenTemplate(j: JSCodeshift, expression: ExpressionKind): ExpressionKind {
  return j.templateLiteral(
    [
      j.templateElement({ raw: "calc(-1 * ", cooked: "calc(-1 * " }, false),
      j.templateElement({ raw: ")", cooked: ")" }, true),
    ],
    [expression],
  ) as ExpressionKind;
}

function negateCssCalcOperator(operator: string): string {
  return operator === "+" ? "-" : operator === "-" ? "+" : operator;
}

function negateCalcStaticText(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function expressionToCalcStaticText(
  node: unknown,
  unit = "",
  staticIdentifierValues?: ReadonlyMap<string, string | number | boolean>,
): string | null {
  const staticValue = literalToStaticValue(node);
  if (typeof staticValue === "number") {
    return `${staticValue}${unit}`;
  }
  const identifierName =
    node && typeof node === "object" && (node as { type?: string }).type === "Identifier"
      ? (node as { name?: string }).name
      : undefined;
  const identifierValue = identifierName ? staticIdentifierValues?.get(identifierName) : undefined;
  if (typeof identifierValue === "number") {
    return `${identifierValue}${unit}`;
  }
  return null;
}

function hasAdjacentTemplateUnit(
  quasis: Array<{ value?: { raw?: string; cooked?: string } }>,
  expressionIndex: number,
): boolean {
  const before =
    quasis[expressionIndex]?.value?.raw ?? quasis[expressionIndex]?.value?.cooked ?? "";
  const after =
    quasis[expressionIndex + 1]?.value?.raw ?? quasis[expressionIndex + 1]?.value?.cooked ?? "";
  return /[a-zA-Z%]$/.test(before) || /^[a-zA-Z%]/.test(after);
}

function hasAdjacentUnitInInterpolatedParts(
  parts: Array<{ kind?: string; value?: string }>,
  slotIndex: number,
): boolean {
  const before = parts[slotIndex - 1]?.kind === "static" ? (parts[slotIndex - 1]?.value ?? "") : "";
  const after = parts[slotIndex + 1]?.kind === "static" ? (parts[slotIndex + 1]?.value ?? "") : "";
  return /[a-zA-Z%]$/.test(before) || /^[a-zA-Z%]/.test(after);
}

function isStylexCalcExpression(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; object?: unknown; property?: unknown; computed?: boolean };
  if (n.type !== "MemberExpression" || n.computed) {
    return false;
  }
  const objectInfo = extractRootAndPath(n.object);
  return objectInfo !== null && isMemberExpression(n);
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
function tryHandleDynamicPseudoElementStyleFunction(args: InterpolatedDeclarationContext): boolean {
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

/**
 * Apply a resolved theme boolean value to a style object, expanding CSS shorthands.
 * Returns false if the value cannot be expanded (caller should bail).
 */
function applyThemeBooleanValue(
  j: { literal: (value: string) => unknown },
  cssProp: string,
  value: unknown,
  target: Record<string, unknown>,
  cssValueText?: string,
): boolean {
  // Try to extract string value from AST node (shared across border/background paths)
  const node = value as { type?: string; value?: unknown; expression?: unknown } | null;
  const unwrapped = node?.type === "ExpressionStatement" ? (node.expression as typeof node) : node;
  const strValue =
    unwrapped &&
    (unwrapped.type === "StringLiteral" || unwrapped.type === "Literal") &&
    typeof unwrapped.value === "string"
      ? unwrapped.value
      : null;

  // Border shorthand → expand to width/style/color
  const borderMatch = cssProp.match(/^border(-top|-right|-bottom|-left)?$/);
  if (borderMatch) {
    if (strValue === null) {
      return false;
    }
    const direction = borderMatch[1]
      ? borderMatch[1].slice(1).charAt(0).toUpperCase() + borderMatch[1].slice(2)
      : "";
    const parsed = parseBorderShorthandParts(strValue);
    if (!parsed) {
      return false;
    }
    if (parsed.width) {
      target[`border${direction}Width`] = j.literal(parsed.width);
    }
    if (parsed.style) {
      target[`border${direction}Style`] = j.literal(parsed.style);
    }
    if (parsed.color) {
      target[`border${direction}Color`] = j.literal(parsed.color);
    }
    return true;
  }

  // Background shorthand → backgroundColor or backgroundImage
  // Use the actual branch value (not valueRaw which contains placeholders)
  if (cssProp === "background") {
    const backgroundText = strValue ?? cssValueText ?? "";
    if (backgroundText.trim() === "none") {
      target.backgroundImage = j.literal("none");
      target.backgroundColor = j.literal("transparent");
      return true;
    }
    const backgroundProp = resolveBackgroundStylexProp(backgroundText);
    target[backgroundProp] = value;
    if (backgroundProp === "backgroundColor") {
      target.backgroundImage = j.literal("none");
    } else {
      target.backgroundColor = j.literal("transparent");
    }
    return true;
  }

  if (isCssShorthandProperty(cssProp)) {
    return false;
  }

  // Default: camelCase the property name
  target[cssPropertyToStylexProp(cssProp)] = value;
  return true;
}

function restoreThemeStyleKeyFromPairedSide(
  targetBaseKey: string,
  pairedBaseKey: string,
  pairedStyleKey: string | null,
): string {
  if (pairedStyleKey?.startsWith(pairedBaseKey)) {
    return `${targetBaseKey}${pairedStyleKey.slice(pairedBaseKey.length)}`;
  }
  return targetBaseKey;
}

function getLatestThemeInterleavableSourceOrder(args: {
  decl: StyledDecl;
  variantSourceOrder: Record<string, number>;
  styleFnFromProps: Array<{ sourceOrder?: number }>;
}): number {
  const sourceOrders = Object.values(args.variantSourceOrder);
  appendSourceOrders(sourceOrders, args.styleFnFromProps);
  appendSourceOrders(sourceOrders, args.decl.needsUseThemeHook);
  appendSourceOrders(sourceOrders, args.decl.pseudoAliasSelectors);
  appendSourceOrders(sourceOrders, args.decl.variantDimensions);
  return sourceOrders.length > 0 ? Math.max(...sourceOrders) : -1;
}

function appendSourceOrders(
  sourceOrders: number[],
  entries: readonly { sourceOrder?: number }[] | undefined,
): void {
  for (const entry of entries ?? []) {
    if (entry.sourceOrder !== undefined) {
      sourceOrders.push(entry.sourceOrder);
    }
  }
}

type RuntimeBackgroundStylexProp = "backgroundImage" | "backgroundColor";

function resolveRuntimeBackgroundStylexProp(
  value: unknown,
  cssValueText?: string,
): RuntimeBackgroundStylexProp | "unsupported" | null {
  const node = unwrapExpressionNode(value);
  if (node?.type !== "ConditionalExpression") {
    const staticText = getRuntimeBackgroundStaticText(node);
    if (staticText !== null) {
      return resolveBackgroundStylexProp(staticText);
    }
    return cssValueText ? resolveBackgroundStylexProp(cssValueText) : null;
  }

  const consequentProp = classifyRuntimeBackgroundBranch(node.consequent);
  const alternateProp = classifyRuntimeBackgroundBranch(node.alternate);
  if (consequentProp && alternateProp) {
    return consequentProp === alternateProp ? consequentProp : "unsupported";
  }

  const cssTextProp = cssValueText ? resolveBackgroundStylexProp(cssValueText) : null;
  const knownProp = consequentProp ?? alternateProp;
  if (knownProp) {
    if (knownProp === "backgroundImage") {
      return "unsupported";
    }
    if (cssTextProp && cssTextProp !== knownProp) {
      return "unsupported";
    }
    return "backgroundColor";
  }
  if (cssTextProp === "backgroundImage") {
    return "unsupported";
  }
  return "backgroundColor";
}

function classifyRuntimeBackgroundBranch(value: unknown): RuntimeBackgroundStylexProp | null {
  const staticText = getRuntimeBackgroundStaticText(unwrapExpressionNode(value));
  return staticText === null ? null : resolveBackgroundStylexProp(staticText);
}

function unwrapExpressionNode(value: unknown): {
  type?: string;
  expression?: unknown;
  consequent?: unknown;
  alternate?: unknown;
  quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
  value?: unknown;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const node = value as {
    type?: string;
    expression?: unknown;
    consequent?: unknown;
    alternate?: unknown;
    quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
    value?: unknown;
  };
  if (
    node.type === "ExpressionStatement" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression"
  ) {
    return unwrapExpressionNode(node.expression);
  }
  return node;
}

function getRuntimeBackgroundStaticText(
  value: ReturnType<typeof unwrapExpressionNode>,
): string | null {
  if (!value) {
    return null;
  }
  if (
    (value.type === "StringLiteral" || value.type === "Literal") &&
    typeof value.value === "string"
  ) {
    return value.value;
  }
  if (value.type === "TemplateLiteral") {
    const text = (value.quasis ?? [])
      .map((quasi) => quasi.value?.cooked ?? quasi.value?.raw ?? "")
      .join("");
    return text || null;
  }
  return null;
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

type DynamicHelperCallArgument = {
  callArg: ExpressionKind;
  paramName: string;
};

function scalarizePropsObjectDynamicValue(args: {
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

function scalarStyleFnEntryFromProps(args: {
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

function extractGuardedDynamicBranch(
  j: JSCodeshift,
  expr: unknown,
): { test: ExpressionKind; value: ExpressionKind } | null {
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ConditionalExpression"
  ) {
    return null;
  }
  const conditional = expr as {
    test?: ExpressionKind;
    consequent?: ExpressionKind;
    alternate?: ExpressionKind;
  };
  if (!conditional.test || !conditional.consequent || !conditional.alternate) {
    return null;
  }
  const consequentEmpty = isEmptyRuntimeStyleBranch(conditional.consequent);
  const alternateEmpty = isEmptyRuntimeStyleBranch(conditional.alternate);
  if (consequentEmpty === alternateEmpty) {
    return null;
  }
  return {
    test: consequentEmpty ? j.unaryExpression("!", conditional.test, true) : conditional.test,
    value: consequentEmpty ? conditional.alternate : conditional.consequent,
  };
}

function isEmptyRuntimeStyleBranch(expr: unknown): boolean {
  const value = literalToStaticValue(expr);
  return value === "" || value === null || value === false || value === undefined;
}

function isHelperCallGuard(conditionWhen: string): boolean {
  return conditionWhen.includes("(");
}

function printScalarizedExpression(args: {
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

function styleFnParamNameForJsxProp(
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

function scalarCallArgForParamName(
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

function shouldUseScalarDynamicArgs(stylexProp: string, rawCssValue: string | undefined): boolean {
  if (rawCssValue?.includes("var(")) {
    return false;
  }
  if (stylexProp === "transition" || stylexProp.startsWith("--")) {
    return false;
  }
  return true;
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
  if (isFunctionLikeNode(record)) {
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

function isFunctionLikeNode(node: Record<string, unknown>): boolean {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration" ||
    node.type === "ObjectMethod" ||
    node.type === "ClassMethod"
  );
}

function patternBindsAnyName(node: unknown, names: ReadonlySet<string>): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const record = node as Record<string, unknown>;
  if (record.type === "Identifier") {
    return typeof record.name === "string" && names.has(record.name);
  }
  if (record.type === "RestElement") {
    return patternBindsAnyName(record.argument, names);
  }
  if (record.type === "AssignmentPattern") {
    return patternBindsAnyName(record.left, names);
  }
  if (record.type === "ObjectPattern") {
    return (
      Array.isArray(record.properties) &&
      record.properties.some((prop) => patternBindsAnyName(prop, names))
    );
  }
  if (record.type === "ObjectProperty" || record.type === "Property") {
    return patternBindsAnyName(record.value, names);
  }
  if (record.type === "ArrayPattern") {
    return (
      Array.isArray(record.elements) &&
      record.elements.some((element) => patternBindsAnyName(element, names))
    );
  }
  return false;
}

function addUndefinedToParamType(j: JSCodeshift, param: unknown): void {
  const typedParam = param as { typeAnnotation?: { typeAnnotation?: unknown } };
  const current = typedParam.typeAnnotation?.typeAnnotation;
  if (!current || typeof current !== "object") {
    return;
  }
  if (
    (current as { type?: string }).type === "TSUnionType" &&
    ((current as { types?: Array<{ type?: string }> }).types ?? []).some(
      (typeNode) => typeNode.type === "TSUndefinedKeyword",
    )
  ) {
    return;
  }
  typedParam.typeAnnotation = j.tsTypeAnnotation(
    j.tsUnionType([current as ReturnType<typeof j.tsStringKeyword>, j.tsUndefinedKeyword()]),
  );
}

type DynamicHelperCallResult = {
  value: ExpressionKind;
  binding: DynamicHelperCallArgument;
};

type StyleObjectProperty = ReturnType<JSCodeshift["property"]>;

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

function buildDynamicStyleFunctionProperties(args: {
  j: JSCodeshift;
  fnKey: string;
  prop: string;
  valueExpr: ExpressionKind;
  important: boolean;
  pseudos?: string[] | null;
  media?: string | null;
}): StyleObjectProperty[] {
  const { j, fnKey, prop, valueExpr, important, pseudos, media } = args;
  if (!important) {
    return [
      j.property(
        "init",
        makeCssPropKey(j, prop),
        buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
      ),
    ];
  }

  const cssVariableName = `--${camelToKebabCase(fnKey)}`;
  const importantValueExpr = j.literal(`var(${cssVariableName}) !important`);
  return [
    j.property("init", makeCssPropKey(j, cssVariableName), valueExpr),
    j.property(
      "init",
      makeCssPropKey(j, prop),
      buildPseudoMediaPropValue({ j, valueExpr: importantValueExpr, pseudos, media }),
    ),
  ];
}

function resolveHelperCallsInDynamicValue(
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

function isIdentifierNamed(node: ExpressionKind, name: string): boolean {
  return node?.type === "Identifier" && node.name === name;
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

function buildResolvedValueTransformCallArg(args: {
  j: JSCodeshift;
  jsxProp: string;
  valueTransform: CallValueTransform | undefined;
  parseExpr: (expr: string) => unknown;
  addResolverImports: (imports: Iterable<unknown> | undefined | null) => void;
}): ExpressionKind | null {
  const { j, jsxProp, valueTransform, parseExpr, addResolverImports } = args;
  if (!valueTransform?.resolvedExpr) {
    return null;
  }
  if (!/^[A-Za-z_$][\w$]*$/.test(jsxProp)) {
    return null;
  }
  const resolvedCallee = parseExpr(valueTransform.resolvedExpr) as ExpressionKind | null;
  if (!resolvedCallee) {
    return null;
  }
  const resolvedRoot = extractRootAndPath(resolvedCallee)?.rootName;
  if (resolvedRoot === jsxProp) {
    return null;
  }
  addResolverImports(valueTransform.resolvedImports);
  const propArg = j.identifier(jsxProp);
  return valueTransform.resolvedUsage === "memberAccess"
    ? (j.memberExpression(resolvedCallee, propArg, true) as ExpressionKind)
    : (j.callExpression(resolvedCallee, [propArg]) as ExpressionKind);
}

function dedupeDynamicHelperCallArguments(
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

function containsIdentifier(node: unknown, name: string): boolean {
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

/**
 * Handles local helper function calls in template interpolations.
 * Pattern: ${(props) => localFn(props.size)} where localFn is defined in the same file
 * and returns a CSS string like "width: ${size}px; height: ${size}px;".
 *
 * Extracts each CSS property from the helper's return value and creates
 * dynamic style functions for them.
 */
function tryHandleLocalHelperCall(args: {
  ctx: InterpolatedDeclarationContext["ctx"];
  d: CssDeclarationIR;
  expr: unknown;
}): boolean {
  const { ctx, d, expr } = args;
  const { state, decl, styleFnDecls, styleFnFromProps } = ctx;
  const { j, root } = state;
  const avoidNames = new Set(state.importMap.keys());

  // Only handle standalone interpolations (no property name)
  if (d.property) {
    return false;
  }

  // Must be an arrow function
  const e = expr as { type?: string; params?: unknown[]; body?: unknown } | undefined;
  if (!e || (e.type !== "ArrowFunctionExpression" && e.type !== "FunctionExpression")) {
    return false;
  }
  const paramName = getArrowFnSingleParamName(e as Parameters<typeof getArrowFnSingleParamName>[0]);
  if (!paramName) {
    return false;
  }

  const body = getFunctionBodyExpr(e);
  if (!body || typeof body !== "object") {
    return false;
  }
  const bodyNode = body as {
    type?: string;
    callee?: { type?: string; name?: string };
    arguments?: unknown[];
  };
  if (bodyNode.type !== "CallExpression") {
    return false;
  }
  // Only support simple identifier callees (localFn)
  if (bodyNode.callee?.type !== "Identifier" || !bodyNode.callee.name) {
    return false;
  }
  const calleeName = bodyNode.callee.name;

  // Check it's NOT an imported function (those are handled by resolveCall)
  const importInfo = state.resolveImportInScope(calleeName, bodyNode.callee);
  if (importInfo) {
    return false;
  }

  // Must have a single argument that's a prop access: props.size
  const callArgs = bodyNode.arguments ?? [];
  if (callArgs.length !== 1) {
    return false;
  }
  const arg0 = callArgs[0] as { type?: string } | undefined;
  if (!arg0 || arg0.type !== "MemberExpression") {
    return false;
  }
  const propPath = getMemberPathFromIdentifier(
    arg0 as Parameters<typeof getMemberPathFromIdentifier>[0],
    paramName,
  );
  if (!propPath || propPath.length !== 1 || !propPath[0]) {
    return false;
  }
  const jsxProp = propPath[0];

  // Find the local function definition
  const fnDecls = root.find(j.FunctionDeclaration, { id: { name: calleeName } });
  if (fnDecls.size() === 0) {
    return false;
  }
  const fnNode = fnDecls.get().node;
  const fnParams = fnNode.params ?? [];
  if (fnParams.length !== 1) {
    return false;
  }
  const fnParamNode = fnParams[0] as { type?: string; name?: string };
  if (fnParamNode.type !== "Identifier" || !fnParamNode.name) {
    return false;
  }
  const fnParamName = fnParamNode.name;

  // Extract the return value
  const fnBody = fnNode.body as { body?: unknown[] } | undefined;
  if (!fnBody?.body) {
    return false;
  }
  const retStmt = fnBody.body.find(
    (s: unknown) => (s as { type?: string })?.type === "ReturnStatement",
  ) as { argument?: unknown } | undefined;
  if (!retStmt?.argument) {
    return false;
  }

  // The return value should be a template literal containing CSS declarations
  const retExpr = retStmt.argument as {
    type?: string;
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
    expressions?: unknown[];
  };
  if (retExpr.type !== "TemplateLiteral" || !retExpr.quasis || !retExpr.expressions) {
    return false;
  }

  // Build a CSS string with indexed placeholders to track which expression maps to which property
  let cssString = "";
  for (let i = 0; i < retExpr.quasis.length; i++) {
    cssString += retExpr.quasis[i]?.value?.cooked ?? retExpr.quasis[i]?.value?.raw ?? "";
    if (i < retExpr.expressions.length) {
      cssString += `__LOCAL_PARAM_${i}__`;
    }
  }

  // Parse the CSS string to extract properties (replace placeholders with dummy values)
  const parsedCss = parseCssDeclarationBlock(cssString.replace(/__LOCAL_PARAM_\d+__/g, "0"));
  if (!parsedCss || Object.keys(parsedCss).length === 0) {
    // The local helper function returns CSS that cannot be parsed into individual declarations.
    // This happens with child selectors (& > div), at-rules, or other complex CSS constructs.
    state.bailUnsupported(
      decl,
      `Local helper function returns CSS that cannot be decomposed into individual properties`,
    );
    return true;
  }

  // Build a per-property unit map by matching expression indices to CSS properties.
  // Parse the CSS string with placeholders intact to see which property contains each expression.
  const parsedWithPlaceholders = parseCssDeclarationBlock(
    cssString.replace(/__LOCAL_PARAM_(\d+)__/g, "PLACEHOLDER_$1"),
  );
  const propToUnit = new Map<string, string>();
  // Track CSS properties that directly reference the function parameter (with or without a unit)
  const directParamProps = new Set<string>();
  // Track derived call arguments per CSS property when the expression is a local variable
  // derived from the function parameter (e.g., `const px = sizeMap[size]` → callArg = sizeMap[size])
  const propToCallArg = new Map<string, ExpressionKind>();
  if (parsedWithPlaceholders) {
    for (const [cssProp, value] of Object.entries(parsedWithPlaceholders)) {
      const m = typeof value === "string" ? value.match(/PLACEHOLDER_(\d+)/) : null;
      if (!m) {
        continue;
      }
      const exprIdx = Number(m[1]);
      const nextQuasi =
        retExpr.quasis[exprIdx + 1]?.value?.cooked ?? retExpr.quasis[exprIdx + 1]?.value?.raw ?? "";
      const unitMatch = nextQuasi.match(/^(px|em|rem|%|vh|vw|ms|s)\b/);
      const exprNode = retExpr.expressions[exprIdx] as { type?: string; name?: string } | undefined;
      if (exprNode?.type === "Identifier" && exprNode.name === fnParamName) {
        directParamProps.add(cssProp);
        if (unitMatch) {
          propToUnit.set(cssProp, unitMatch[1]!);
        }
      } else if (exprNode?.type === "Identifier" && exprNode.name) {
        // Check if this identifier is a local variable derived from fnParamName
        const callArg = resolveDerivedLocalVariable(j, fnBody, fnParamName, exprNode.name, jsxProp);
        if (callArg) {
          propToCallArg.set(cssProp, callArg);
          // For px unit with derived expression, StyleX auto-adds px for numeric values,
          // so we don't need a unit suffix — just pass the number directly.
          // For non-px units, append the unit suffix.
          if (unitMatch && unitMatch[1] !== "px") {
            propToUnit.set(cssProp, unitMatch[1]!);
          }
        }
      }
    }
  }

  // Get the type annotation from the local function parameter
  const fnParamTypeAnnotation = (fnParams[0] as { typeAnnotation?: { typeAnnotation?: unknown } })
    ?.typeAnnotation?.typeAnnotation;

  // Verify that every CSS property can be traced back to the function parameter.
  // If any expression can't be resolved (neither direct param reference, unit-suffixed param,
  // nor a local variable derived from the param), bail rather than silently producing wrong code.
  for (const cssProp of Object.keys(parsedCss)) {
    if (!directParamProps.has(cssProp) && !propToCallArg.has(cssProp)) {
      // Check if the CSS value contains a placeholder at all
      const rawVal = parsedWithPlaceholders
        ? (parsedWithPlaceholders as Record<string, unknown>)[cssProp]
        : null;
      if (typeof rawVal === "string" && rawVal.includes("PLACEHOLDER_")) {
        // The local helper function computes CSS property values with logic that can't be
        // statically traced back to the function parameter (e.g., conditional assignments,
        // chained lookups). Bail rather than silently dropping these styles.
        state.bailUnsupported(
          decl,
          `Local helper function computes CSS values that cannot be statically traced to the component prop`,
        );
        return true;
      }
    }
  }

  // Create style functions for each extracted CSS property
  for (const cssProp of Object.keys(parsedCss)) {
    const fnKey = styleKeyWithSuffix(decl.styleKey, cssProp);
    const derivedCallArg = propToCallArg.get(cssProp);
    if (!styleFnDecls.has(fnKey)) {
      const paramName_ = cssPropertyToIdentifier(cssProp, avoidNames);
      const param = j.identifier(derivedCallArg ? paramName_ : jsxProp);
      if (derivedCallArg) {
        // Derived from a lookup expression (e.g., `sizeMap[size]`). The style function
        // receives the lookup result, which is typically numeric for CSS property values.
        // Use `number | string` to handle both numeric and token-based lookup tables.
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()]),
        );
      } else if (fnParamTypeAnnotation) {
        (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          cloneAstNode(fnParamTypeAnnotation) as Parameters<typeof j.tsTypeAnnotation>[0],
        );
      }
      const propUnit = propToUnit.get(cssProp) ?? "";
      const valueParamName = derivedCallArg ? paramName_ : jsxProp;
      const valueExpr = propUnit
        ? j.templateLiteral(
            [
              j.templateElement({ raw: "", cooked: "" }, false),
              j.templateElement({ raw: propUnit, cooked: propUnit }, true),
            ],
            [j.identifier(valueParamName)],
          )
        : j.identifier(valueParamName);
      const propKey = j.identifier(cssProp);
      const prop = j.property("init", propKey, valueExpr);
      // Use shorthand when key and value are the same identifier (e.g., { width } instead of { width: width })
      if (!propUnit && valueExpr.type === "Identifier" && valueExpr.name === cssProp) {
        (prop as { shorthand?: boolean }).shorthand = true;
      }
      const bodyExprNode = j.objectExpression([prop]);
      styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExprNode));
    }
    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
      styleFnFromProps.push({
        fnKey,
        jsxProp,
        ...(derivedCallArg ? { callArg: derivedCallArg } : {}),
      });
    }
  }

  ensureShouldForwardPropDrop(decl, jsxProp);
  decl.needsWrapperComponent = true;

  // Track the consumed local helper for later removal in post-processing.
  // The function declaration can't be removed here because the template expression
  // still references it; it's cleaned up after the styled declaration is removed.
  if (!decl.consumedLocalHelpers) {
    decl.consumedLocalHelpers = [];
  }
  decl.consumedLocalHelpers.push(calleeName);

  return true;
}

/**
 * Handles declarations with multiple interpolation slots where all slots are
 * ternary expressions branching on the same prop.
 *
 * Pattern: `transform: translateY(-50%) translateX(${p => p.$expanded ? "0" : "-8px"}) scale(${p => p.$expanded ? 1 : 0.9})`
 *
 * Produces two static variant styles by evaluating each branch direction:
 *   popover: { transform: "translateY(-50%) translateX(-8px) scale(0.9)" }
 *   popoverExpanded: { transform: "translateY(-50%) translateX(0) scale(1)" }
 */
function tryHandleMultiSlotTernary(ctx: DeclProcessingState, d: CssDeclarationIR): boolean {
  const { decl, styleObj } = ctx;
  const parts = d.value.kind === "interpolated" ? d.value.parts : [];
  const slotParts = parts.filter(
    (p: { kind: string }): p is { kind: "slot"; slotId: number } => p.kind === "slot",
  );

  if (slotParts.length < 2) {
    return false;
  }

  // Extract and validate all slot expressions: each must be an arrow/function
  // with a ConditionalExpression body testing the same prop.
  let commonPropName: string | null = null;
  const branchValues: Array<{ consequent: string; alternate: string }> = [];

  for (const slot of slotParts) {
    const expr = decl.templateExpressions[slot.slotId] as
      | {
          type?: string;
          body?: unknown;
        }
      | undefined;
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      return false;
    }
    const paramName = getArrowFnSingleParamName(
      expr as Parameters<typeof getArrowFnSingleParamName>[0],
    );
    if (!paramName) {
      return false;
    }
    const body = getFunctionBodyExpr(expr) as {
      type?: string;
      test?: unknown;
      consequent?: unknown;
      alternate?: unknown;
    } | null;
    if (!body || body.type !== "ConditionalExpression") {
      return false;
    }

    // Extract the tested prop name (e.g., "$expanded" from "props.$expanded")
    const testPath =
      body.test && typeof body.test === "object"
        ? getMemberPathFromIdentifier(
            body.test as Parameters<typeof getMemberPathFromIdentifier>[0],
            paramName,
          )
        : null;
    if (!testPath || testPath.length !== 1 || !testPath[0]) {
      return false;
    }
    const propName = testPath[0];

    if (commonPropName === null) {
      commonPropName = propName;
    } else if (commonPropName !== propName) {
      return false; // Different conditions — can't merge
    }

    // Both branches must be static literals
    const consVal = literalToStaticValue(body.consequent);
    const altVal = literalToStaticValue(body.alternate);
    if (consVal === null || altVal === null) {
      return false;
    }
    branchValues.push({
      consequent: String(consVal),
      alternate: String(altVal),
    });
  }

  if (!commonPropName) {
    return false;
  }

  // Build the full value string for each branch direction by combining
  // static parts with the evaluated branch values.
  const buildFullValue = (direction: "consequent" | "alternate"): string => {
    let result = "";
    let slotIndex = 0;
    for (const part of parts) {
      if (part.kind === "static") {
        result += (part as { value: string }).value;
      } else if (part.kind === "slot") {
        const branch = branchValues[slotIndex];
        result += branch ? branch[direction] : "";
        slotIndex++;
      }
    }
    return result;
  };

  const importantSuffix = d.important ? " !important" : "";
  const consFullValue = buildFullValue("consequent") + importantSuffix;
  const altFullValue = buildFullValue("alternate") + importantSuffix;

  // Apply CSS property mapping (e.g., transform stays as transform)
  for (const out of cssDeclarationToStylexDeclarations(d)) {
    // Default (false/alternate branch) goes to base styles
    styleObj[out.prop] = altFullValue;
    // True (consequent) branch goes to a variant
    ctx.applyVariant(
      { when: commonPropName, propName: commonPropName },
      { [out.prop]: consFullValue },
    );
  }

  // Drop the transient prop from forwarding
  if (commonPropName.startsWith("$")) {
    ensureShouldForwardPropDrop(decl, commonPropName);
  }
  decl.needsWrapperComponent = true;

  return true;
}

function hasRuntimeImport(imports: readonly ImportSpec[] | undefined): boolean {
  return (imports ?? []).some((imp) => !isStylexImportSource(imp.from.value));
}

/**
 * If any variant `when` condition references the styled-components theme object,
 * mark the declaration as needing the `useTheme()` hook so the emitted wrapper
 * has `const theme = useTheme()` in scope.
 */
function markThemeHookForVariants(
  decl: StyledDecl,
  variants: ReadonlyArray<{ when: string }> | undefined,
): void {
  if (!variants) {
    return;
  }
  const needsTheme = variants.some(
    (v) =>
      v.when === "theme" ||
      v.when.startsWith("theme.") ||
      v.when === "!theme" ||
      v.when.startsWith("!theme."),
  );
  if (needsTheme) {
    markDeclNeedsUseThemeHook(decl);
  }
}

/**
 * Returns a merged parameter list combining the params from an existing arrow
 * function (if any) with new params, deduplicated by identifier name.
 * Type annotations are preserved from whichever source provided them first.
 * Used by the variant-merge path so that adding more dynamic CSS properties
 * to an already-declared style function preserves all required params.
 */
function unionStyleFnParams(
  existingFn: unknown,
  newParams: ArrowFunctionParams,
): ArrowFunctionParams {
  type ParamNode = { type?: string; name?: string };
  const existingParams = ((existingFn as { params?: readonly ParamNode[] } | undefined)?.params ??
    []) as ParamNode[];
  const merged: ParamNode[] = [];
  const seen = new Set<string>();
  const pushIfNew = (param: ParamNode): void => {
    const name = param.name;
    if (typeof name !== "string" || seen.has(name)) {
      return;
    }
    seen.add(name);
    merged.push(param);
  };
  for (const p of existingParams) {
    pushIfNew(p);
  }
  for (const p of newParams as ParamNode[]) {
    pushIfNew(p);
  }
  if (merged.length === 0) {
    return newParams;
  }
  return merged as ArrowFunctionParams;
}
