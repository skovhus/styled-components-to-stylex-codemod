import type { JSCodeshift } from "jscodeshift";
import type { ExprWithImports, ImportSpec, ResolveValueContext } from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  isCssShorthandProperty,
  isUnsupportedStylexProperty,
  resolveBackgroundStylexProp,
} from "../css-prop-mapping.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import { isStylexImportSource } from "../utilities/stylex-import-source.js";
import {
  cloneAstNode,
  extractRootAndPath,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
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
  buildTemplateWithStaticParts,
  buildStylexValueWithStaticParts,
  canOmitPxUnitForStylexNumber,
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
  getNumericImportedStylexIdentifiers,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexValue,
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
import { cssValueIsImportant } from "./important-values.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { cssValueToJs, toStyleKey, styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import { isMemberExpression } from "./utils.js";

import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";
import {
  hasLaterDeclarationForStylexProps,
  hasSourceOrderedThemeStyleOverlap,
  tryHandleRuntimeConditionalStaticBranches,
} from "./directional-props.js";
import { isUnchangedImportedHelperStyleCall } from "./imported-helper-call.js";
import {
  type DynamicHelperCallArgument,
  containsIdentifier,
  dedupeDynamicHelperCallArguments,
  numericIdentifierSetForJsxProp,
  printScalarizedExpression,
  resolveHelperCallsInDynamicValue,
  scalarCallArgForParamName,
  scalarStyleFnEntryFromProps,
  scalarizePropsObjectDynamicValue,
  styleFnParamNameForJsxProp,
  tryHandleDynamicPseudoElementStyleFunction,
} from "./dynamic-helper-call.js";
import {
  applyThemeBooleanValue,
  getLatestThemeInterleavableSourceOrder,
  restoreThemeStyleKeyFromPairedSide,
} from "./runtime-background.js";
import {
  buildCssCalcTemplateExpression,
  buildFullInterpolatedDeclarationValueExpr,
  buildNegatedCssTokenTemplate,
  hasAdjacentTemplateUnit,
  isCssCalcOperator,
} from "./interpolated-calc.js";
import {
  getSingleSlotStaticParts,
  isEntireInterpolatedValueSingleSlot,
  isImportedShorthandUnitValue,
} from "./numeric-css-props.js";
import { tryHandleLocalCustomPropertyDefinition } from "./custom-property-fallback.js";
import { tryHandleLocalHelperCall } from "./local-helper-call.js";
import {
  addUndefinedToParamType,
  buildDynamicStyleFunctionProperties,
  buildResolvedValueTransformCallArg,
  extractGuardedDynamicBranch,
  hasRuntimeImport,
  isHelperCallGuard,
  isPseudoElementSelector,
  markThemeHookForVariants,
  memberExpressionTouchesTheme,
  shouldUseScalarDynamicArgs,
  staticBaseValueWouldFold,
  tryHandleMultiSlotTernary,
  unionStyleFnParams,
} from "./interpolated-decl-helpers.js";
import { createObservedVariantHandlers } from "./observed-variant-handlers.js";

type ArrowFunctionParams = Parameters<JSCodeshift["arrowFunctionExpression"]>[0];

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
    annotateParamFromJsxProp,
    isJsxPropOptional,
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

  const flags = { bail: false };
  const getRootIdentifierInfo = extractRootAndPath;
  const bailUnsupportedLocal = (declArg: StyledDecl, type: WarningType) => {
    flags.bail = true;
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

  const {
    tryHandleMultiSlotRuntimeValue,
    tryEmitIdentityVariantBuckets,
    tryEmitTransformedObservedVariantBuckets,
    tryEmitObservedExpressionVariantBuckets,
    tryEmitObservedCssBlockVariantBuckets,
    shouldPreserveNumericCssTextForProp,
    maybeEmitPreservedRuntimeCallOverride,
  } = createObservedVariantHandlers({
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
  });

  for (let _i = 0; _i < 1; _i++) {
    if (flags.bail) {
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
    if (flags.bail) {
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
            flags.bail = true;
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
        flags.bail = true;
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
            flags.bail = true;
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
        flags.bail = true;
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
        flags.bail = true;
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
        flags.bail = true;
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
        flags.bail = true;
        break;
      }
      if (flags.bail) {
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
    if (flags.bail) {
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
              flags.bail = true;
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
            flags.bail = true;
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
                  flags.bail = true;
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
                flags.bail = true;
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
      flags.bail = true;
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
        flags.bail = true;
        break;
      }
      if (hasSourceOrderedThemeStyleOverlap(decl, extraStyleObjects, res.cssText)) {
        flags.bail = true;
        continue;
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
        flags.bail = true;
        break;
      }
      if (isUnchangedImportedHelperStyleCall(res, exprAst, expr)) {
        warnings.push({
          severity: "warning",
          type: "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
          loc: decl.loc,
          context: { localName: decl.localName, expr: res.expr },
        });
        flags.bail = true;
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
        flags.bail = true;
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
        flags.bail = true;
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
        flags.bail = true;
        continue;
      }
      // Add imports if present
      addResolverImports(res.trueImports);
      addResolverImports(res.falseImports);

      const trueStyle: Record<string, unknown> = {};
      const falseStyle: Record<string, unknown> = {};

      // Expand CSS shorthands (border -> width/style/color, background -> backgroundColor/Image)
      if (
        !applyThemeBooleanValue(
          j,
          res.cssProp,
          res.trueValue,
          trueStyle,
          d.important,
          res.trueCssValueText,
        )
      ) {
        flags.bail = true;
        continue;
      }
      if (
        !applyThemeBooleanValue(
          j,
          res.cssProp,
          res.falseValue,
          falseStyle,
          d.important,
          res.falseCssValueText,
        )
      ) {
        flags.bail = true;
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
        if (!existing) {
          extraStyleObjects.set(styleKey, style);
          return;
        }
        const merged = { ...existing };
        for (const [prop, value] of Object.entries(style)) {
          if (
            Object.hasOwn(merged, prop) &&
            cssValueIsImportant(merged[prop]) &&
            !cssValueIsImportant(value)
          ) {
            continue;
          }
          merged[prop] = value;
        }
        extraStyleObjects.set(styleKey, merged);
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
        flags.bail = true;
        continue;
      }
      // Shorthand CSS properties expand to multiple longhands; the unresolvable
      // branch expression can't be correctly split across them — bail
      if (isCssShorthandProperty(res.cssProp)) {
        flags.bail = true;
        continue;
      }
      const stylexDeclarations = cssDeclarationToStylexDeclarations(d);
      const fallbackProps = new Set(stylexDeclarations.map((out) => out.prop).filter(Boolean));
      if (hasLaterDeclarationForStylexProps(d, allRules, fallbackProps)) {
        flags.bail = true;
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
      for (const out of stylexDeclarations) {
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
        flags.bail = true;
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
          flags.bail = true;
          break;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
      }
      if (flags.bail) {
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
          flags.bail = true;
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
          flags.bail = true;
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
          flags.bail = true;
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
        flags.bail = true;
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

      if (flags.bail) {
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
        flags.bail = true;
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

      if (flags.bail) {
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
            flags.bail = true;
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
          flags.bail = true;
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
              flags.bail = true;
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
          flags.bail = true;
        },
        avoidNames,
      })
    ) {
      if (flags.bail) {
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
      flags.bail = true;
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
            flags.bail = true;
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
            flags.bail = true;
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
              flags.bail = true;
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
      if (flags.bail) {
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
            const left = (body as { left?: { type?: string } } | null)?.left;
            // Only theme-rooted left operands are indexed theme lookups
            // (e.g. props.theme.color[props.x] || fallback). A prop-rooted
            // member access splices an opaque `css` result into the template
            // (e.g. props => props.$styles ?? ""), which is the same bail as
            // an un-wrapped member-expression interpolation.
            if (isMemberExpression(left) && !memberExpressionTouchesTheme(left)) {
              return {
                type: "Unsupported interpolation: member expression",
                context: { memberExpression: left?.type, operator: op },
              };
            }
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
    flags.bail = true;
    break;
  }

  if (state.bail) {
    flags.bail = true;
  }
  if (flags.bail) {
    state.markBail();
  }
}
