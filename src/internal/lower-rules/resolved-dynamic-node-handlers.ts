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
import type {} from "../builtin-handlers/types.js";
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
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { extractStaticPartsForDecl, wrapExprWithStaticParts } from "./interpolations.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { buildStylexValueWithStaticParts } from "./inline-styles.js";
import { buildSafeIndexedParamName } from "./import-resolution.js";
import {
  handleDualBranchCompoundVariantsResolvedValue,
  handleSplitMultiPropVariantsResolvedValue,
  handleSplitVariantsResolvedValue,
  type SplitVariantsContext,
} from "./interpolated-variant-resolvers.js";
import {} from "./inline-style-props.js";
import { cssValueIsImportant } from "./important-values.js";
import {} from "./variant-utils.js";
import { cssValueToJs, styleKeyWithSuffix } from "../transform/helpers.js";
import { makeCssPropKey } from "./shared.js";
import {
  hasLaterDeclarationForStylexProps,
  hasSourceOrderedThemeStyleOverlap,
} from "./directional-props.js";
import { isUnchangedImportedHelperStyleCall } from "./imported-helper-call.js";
import {
  scalarStyleFnEntryFromProps,
  scalarizePropsObjectDynamicValue,
} from "./dynamic-helper-call.js";
import {
  applyThemeBooleanValue,
  getLatestThemeInterleavableSourceOrder,
  restoreThemeStyleKeyFromPairedSide,
} from "./runtime-background.js";
import {} from "./interpolated-calc.js";
import {
  markThemeHookForVariants,
  shouldUseScalarDynamicArgs,
  unionStyleFnParams,
} from "./interpolated-decl-helpers.js";
import type { InterpolatedDeclarationContext } from "./interpolated-declaration-context.js";
import { tryHandleResolvedStyleFunctionNode } from "./resolved-style-function-handlers.js";
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
    applyResolvedPropValue,
    res,
    expr,
    loc,
    flags,
    addResolverImports,
    collectExtraClassNames,
    bailUnsupportedLocal,
    annotateScalarParams,
    tryEmitObservedExpressionVariantBuckets,
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
    notifyResolvedStylesArg,
  } = ctx;
  const { j, warnings, resolverImports, parseExpr } = state;

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
    if (pseudos?.length || media || pseudoElement || attrTarget || resolvedSelectorMedia) {
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
    if (pseudos?.length || media || pseudoElement || attrTarget || resolvedSelectorMedia) {
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

  const splitVariantsContext: SplitVariantsContext = {
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
  };

  if (handleSplitVariantsResolvedValue(splitVariantsContext)) {
    if (res?.type === "splitVariantsResolvedValue") {
      markThemeHookForVariants(decl, res.variants);
    }
    return true;
  }

  if (handleSplitMultiPropVariantsResolvedValue(splitVariantsContext)) {
    return true;
  }

  if (handleDualBranchCompoundVariantsResolvedValue(splitVariantsContext)) {
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

  return tryHandleResolvedStyleFunctionNode(rc);
}
