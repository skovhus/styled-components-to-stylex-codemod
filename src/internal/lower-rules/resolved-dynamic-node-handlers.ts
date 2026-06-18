/**
 * Resolved-dynamic-node branch handlers extracted from
 * handleInterpolatedDeclaration in rule-interpolated-declaration.ts.
 *
 * Given the result of `resolveDynamicNode`, this dispatches the long, ordered
 * sequence of mutually-exclusive `res.type` branches that emit StyleX styles,
 * variants and style functions. Returns true when a branch handled the
 * declaration (mirroring the original `break`/`continue` out of the dispatch
 * loop); false when no branch matched and the caller must fall through to the
 * unsupported-interpolation diagnostics.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExprWithImports } from "../../adapter.js";
import type { CallValueTransform } from "../builtin-handlers/types.js";
import type { StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import type { ExpressionKind } from "./decl-types.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  isCssShorthandProperty,
  resolveBackgroundStylexProp,
} from "../css-prop-mapping.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { extractStaticPartsForDecl, wrapExprWithStaticParts } from "./interpolations.js";
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
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  isNumericStylexExpression,
  maybeOmitPxUnitFromStylexValue,
  rewritePropsThemeToThemeVar,
  unwrapArrowFunctionToPropsExpr,
} from "./inline-styles.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  handleDualBranchCompoundVariantsResolvedValue,
  handleSplitMultiPropVariantsResolvedValue,
  handleSplitVariantsResolvedValue,
} from "./interpolated-variant-resolvers.js";
import { handleInlineStyleValueFromProps } from "./inline-style-props.js";
import { cssValueIsImportant } from "./important-values.js";
import { buildPseudoMediaPropValue } from "./variant-utils.js";
import { cssValueToJs, styleKeyWithSuffix } from "../transform/helpers.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import {
  hasLaterDeclarationForStylexProps,
  hasSourceOrderedThemeStyleOverlap,
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
} from "./dynamic-helper-call.js";
import {
  applyThemeBooleanValue,
  getLatestThemeInterleavableSourceOrder,
  restoreThemeStyleKeyFromPairedSide,
} from "./runtime-background.js";
import { buildFullInterpolatedDeclarationValueExpr } from "./interpolated-calc.js";
import {
  buildDynamicStyleFunctionProperties,
  buildResolvedValueTransformCallArg,
  extractGuardedDynamicBranch,
  isHelperCallGuard,
  markThemeHookForVariants,
  shouldUseScalarDynamicArgs,
  staticBaseValueWouldFold,
  unionStyleFnParams,
} from "./interpolated-decl-helpers.js";
import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";
import type { createObservedVariantHandlers } from "./observed-variant-handlers.js";

export type ResolvedDynamicNodeContext = Pick<
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
  | "hasAncestorAttributeScope"
  | "applyResolvedPropValue"
> & {
  res: ReturnType<typeof resolveDynamicNode>;
  slotId: number;
  expr: unknown;
  loc: ReturnType<typeof getNodeLocStart>;
  avoidNames: Set<string>;
  flags: { bail: boolean };
  addResolverImports: (imports: Iterable<unknown> | undefined | null) => void;
  collectExtraClassNames: (entries: ExprWithImports[]) => void;
  bailUnsupportedLocal: (declArg: StyledDecl, type: WarningType) => void;
  annotateScalarParams: (params: unknown[], propNames: readonly string[]) => void;
  tryEmitIdentityVariantBuckets: ObservedVariantHandlers["tryEmitIdentityVariantBuckets"];
  tryEmitTransformedObservedVariantBuckets: ObservedVariantHandlers["tryEmitTransformedObservedVariantBuckets"];
  tryEmitObservedExpressionVariantBuckets: ObservedVariantHandlers["tryEmitObservedExpressionVariantBuckets"];
  shouldPreserveNumericCssTextForProp: ObservedVariantHandlers["shouldPreserveNumericCssTextForProp"];
  maybeEmitPreservedRuntimeCallOverride: ObservedVariantHandlers["maybeEmitPreservedRuntimeCallOverride"];
};

type ObservedVariantHandlers = ReturnType<typeof createObservedVariantHandlers>;
type ArrowFunctionParams = Parameters<JSCodeshift["arrowFunctionExpression"]>[0];

export function tryHandleResolvedDynamicNode(rc: ResolvedDynamicNodeContext): boolean {
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
    res,
    slotId,
    expr,
    loc,
    avoidNames,
    flags,
    addResolverImports,
    collectExtraClassNames,
    bailUnsupportedLocal,
    annotateScalarParams,
    tryEmitIdentityVariantBuckets,
    tryEmitTransformedObservedVariantBuckets,
    tryEmitObservedExpressionVariantBuckets,
    shouldPreserveNumericCssTextForProp,
    maybeEmitPreservedRuntimeCallOverride,
  } = rc;
  const {
    state,
    decl,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    variantSourceOrder,
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    findJsxPropTsType,
    annotateParamFromJsxProp,
    notifyResolvedStylesArg,
  } = ctx;
  const {
    j,
    filePath,
    warnings,
    resolverImports,
    parseExpr,
    resolveCall,
    warnPropInlineStyle,
    resolveImportInScope,
    resolveImportForExpr,
  } = state;

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
      return true;
    }
    if (hasSourceOrderedThemeStyleOverlap(decl, extraStyleObjects, res.cssText)) {
      flags.bail = true;
      return true;
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
      return true;
    }
    if (isUnchangedImportedHelperStyleCall(res, exprAst, expr)) {
      warnings.push({
        severity: "warning",
        type: "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
        loc: decl.loc,
        context: { localName: decl.localName, expr: res.expr },
      });
      flags.bail = true;
      return true;
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
    return true;
  }

  if (res && res.type === "resolvedClassNames") {
    // Adapter returned className-only result (no StyleX expr).
    // Store the className expressions on the decl for the emitter to merge.
    collectExtraClassNames(res.extraClassNames);
    decl.needsWrapperComponent = true;
    return true;
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
      return true;
    }
    return true;
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
      return true;
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
      return true;
    }
    return true;
  }

  if (res && res.type === "runtimeCallOnly") {
    const runtimeOverride = maybeEmitPreservedRuntimeCallOverride({
      resolveCallResult: res.resolveCallResult,
      originalExpr: expr,
      loc,
      cssValueText: res.cssValueText,
    });
    if (runtimeOverride === "failed") {
      return true;
    }
    return true;
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
      return true;
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
      return true;
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
      return true;
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
      return true;
    }

    decl.needsWrapperComponent = true;
    return true;
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
      return true;
    }
    // Shorthand CSS properties expand to multiple longhands; the unresolvable
    // branch expression can't be correctly split across them — bail
    if (isCssShorthandProperty(res.cssProp)) {
      flags.bail = true;
      return true;
    }
    const stylexDeclarations = cssDeclarationToStylexDeclarations(d);
    const fallbackProps = new Set(stylexDeclarations.map((out) => out.prop).filter(Boolean));
    if (hasLaterDeclarationForStylexProps(d, allRules, fallbackProps)) {
      flags.bail = true;
      return true;
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
        (e) => e.themeProp === res.themeProp && e.trueStyleKey === null && e.falseStyleKey === null,
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
    return true;
  }

  if (res && res.type === "splitVariants") {
    // Extract any imports from variants (used by template literal theme resolution)
    for (const v of res.variants) {
      addResolverImports(v.imports);
    }

    // When inside a media context (static or computed), wrap each variant's style
    // properties in media maps so the media condition is preserved.
    const wrapInMedia = (style: Record<string, unknown>, target: Record<string, unknown>): void => {
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
    return true;
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
      return true;
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
      return true;
    }
    markThemeHookForVariants(decl, res.variants);
    decl.needsWrapperComponent = true;
    return true;
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
    return true;
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
    return true;
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
    return true;
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
      return true;
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
      return true;
    }

    decl.needsWrapperComponent = true;
    return true;
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
      return true;
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
        const indexedLookup = j.memberExpression(themeObjAst as any, j.identifier(paramName), true);
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
      return true;
    }

    decl.needsWrapperComponent = true;
    return true;
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
          ? buildStylexValueWithStaticParts(j, clonedDynamic, prefix, suffix, firstStylexProp ?? "")
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
          return true;
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
          return true;
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
              : (staticValueToLiteral(j, propValue as string | number | boolean) as ExpressionKind);
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
      return true;
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
        return true;
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
          return true;
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
        return true;
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
        return true;
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
          const extraHelperCallArgs = needsOriginalParam ? helperCallArgs : helperCallArgs.slice(1);
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
      return true;
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
      return true;
    }
    return true;
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
        return true;
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
    return true;
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
        return true;
      }
    }
    if (
      !(res as { wrapValueInTemplateLiteral?: boolean }).wrapValueInTemplateLiteral &&
      outs.length === 1 &&
      tryEmitTransformedObservedVariantBuckets(jsxProp, outs[0]!.prop, valueTransform)
    ) {
      return true;
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
    return true;
  }

  if (res && res.type === "keepOriginal") {
    warnings.push({
      severity: "warning",
      type: res.reason,
      loc,
    });
    flags.bail = true;
    return true;
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
      return true;
    }
    return true;
  }

  return false;
}
