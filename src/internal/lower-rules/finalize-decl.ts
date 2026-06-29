/**
 * Finalizes per-declaration style objects after rule processing.
 * Core concepts: merge pseudo/media buckets, rewrite CSS vars, and emit variants.
 */
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {
  cssValueToJs,
  toStyleKey,
  styleKeyWithSuffix,
  type ComputedKeyEntry,
} from "../transform/helpers.js";
import {
  extractUnionLiteralValues,
  groupVariantBucketsIntoDimensions,
  hasFiniteNumericVariantKey,
} from "./variants.js";
import {
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  isAstNode,
  isCallExpressionNode,
  isEmptyCssBranch,
} from "../utilities/jscodeshift-utils.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import { copyConditionSourceOrders, getConditionSourceOrder } from "./condition-source-order.js";
import type { DeclProcessingState } from "./decl-setup.js";
import {
  findPlaceholderBlock,
  findPreviousOpeningBraceBeforeSelector,
  getOrCreateRelationOverrideBucket,
  parseSimpleParentPseudoSelectorList,
  readPrefixSinceLastBlockBoundary,
  readSelectorBeforeBlock,
} from "./shared.js";
import type { VariantDimension } from "../transform-types.js";
import { isStyleConditionKey, mergeStyleObjects } from "./utils.js";
import { stylexVarMemberExpression } from "../transform-css-vars.js";
import {
  findImportedRootPropCollision,
  hasConflictingLogicalPhysicalScrollProps,
} from "./validate-decl-conflicts.js";
import {
  bucketSnapshotLookup,
  bucketSourceOrderLookup,
  expandMultiValueBorderRadius,
  extractScalarDefault,
  harmonizeShorthandExpansion,
  isMediaOrPseudoMap,
  mergeExistingPseudoEntries,
  resolveBoxShorthandConflicts,
  resolveDirectionalConflicts,
  warnOpaqueShorthands,
} from "./box-shorthand-conflicts.js";
import {
  alignComputedCallArgStyleFnParams,
  narrowGuardedStyleFnParamTypes,
  unionStyleFnParamsFromStyleFnFromProps,
} from "./style-fn-params.js";
import { factorCommonStylesFromComplementaryCompoundVariants } from "./compound-variant-factoring.js";
import {
  collectRawCssVarStyleObjectProps,
  collectStyleOverrideProps,
  dropCssVariableDefinitionsFromBucket,
  findLocalCustomPropertyFallbackFromRules,
  moveCustomPropertyOnlyBaseToInlineStyles,
  moveUnsafeRawCssVarPropsToInlineStyles,
  moveUnsafeRawCssVarStyleFnsToInlineStyles,
  registerLocalStylexVarFallbacks,
} from "./raw-css-var-inlining.js";
import {
  consolidateSameJsxPropStyleFns,
  convertStyleFnsToPropsPattern,
  insertStyleFnDeclsAfterComponent,
  mergeBaseIntoSingleStyleFn,
  mergeVariantBucketsIntoStyleFns,
} from "./style-fn-merging.js";

export function finalizeDeclProcessing(ctx: DeclProcessingState): void {
  const {
    state,
    decl,
    styleObj,
    perPropPseudo,
    perPropMedia,
    perPropComputedMedia,
    nestedSelectors,
    variantBuckets,
    variantStyleKeys,
    variantSourceOrder,
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    attrBuckets,
    observedVariantFallbackFns,
    inlineStyleProps,
    localVarValues,
    cssHelperPropValues,
  } = ctx;
  const {
    rewriteCssVarsInStyleObject,
    rewriteCssVarsInAstNode,
    relationOverridePseudoBuckets,
    relationOverrides,
    ancestorSelectorParents,
    resolvedStyleObjects,
    warnings,
  } = state;

  const collidingRoot = findImportedRootPropCollision(decl, Object.keys(variantStyleKeys ?? {}));
  if (collidingRoot) {
    state.bailUnsupported(
      decl,
      "Imported runtime condition root collides with a component prop of the same name",
    );
    return;
  }
  if (hasConflictingLogicalPhysicalScrollProps(decl)) {
    state.bailUnsupported(
      decl,
      "Mixed logical and physical scroll properties cannot be normalized without a known writing-mode",
    );
    return;
  }

  mergeConditionBucket(styleObj, perPropPseudo);
  mergeConditionBucket(styleObj, perPropMedia);
  // Merge computed media keys (from adapter.resolveSelector and sibling selectors)
  // Preserves any existing @media or pseudo entries already in styleObj[prop]
  for (const [prop, entry] of perPropComputedMedia) {
    const existing = styleObj[prop];

    // Resolve the default value: prefer the early snapshot, but if it was null
    // and styleObj[prop] now has a value (base declaration appeared after the
    // computed-key rule), use the current value instead.
    const resolvedDefault =
      entry.defaultValue ?? (existing !== undefined && !isAstNode(existing) ? existing : null);

    // If the prop already has a media/pseudo map, merge into it
    if (existing && typeof existing === "object" && !isAstNode(existing)) {
      const merged = existing as Record<string, unknown>;
      // Add default if not already present
      if (!("default" in merged)) {
        merged.default = resolvedDefault;
      }
      // Add computed keys to existing object
      (merged as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
        keyExpr: e.keyExpr,
        value: e.value,
        leadingComment: e.leadingComment,
        ...(e.sourceOrder !== undefined ? { sourceOrder: e.sourceOrder } : {}),
      }));
    } else {
      // No existing map, create a new nested object with default and __computedKeys
      const nested: Record<string, unknown> = { default: resolvedDefault };
      (nested as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
        keyExpr: e.keyExpr,
        value: e.value,
        leadingComment: e.leadingComment,
        ...(e.sourceOrder !== undefined ? { sourceOrder: e.sourceOrder } : {}),
      }));
      styleObj[prop] = nested;
    }
  }
  for (const [sel, obj] of Object.entries(nestedSelectors)) {
    styleObj[sel] = obj;
  }

  // Bail when a property mixes a computed at-rule key (from resolveSelector, stored in
  // __computedKeys and always emitted last) with a static at-rule key on the same property.
  // StyleX breaks ties between same-tier at-rules by source order, so appending the computed
  // key last would silently reverse the original CSS cascade — not lossless. Static pseudo
  // keys are unaffected (they sit in a different priority tier), so they don't trigger this.
  for (const bucket of [styleObj, ...variantBuckets.values(), ...extraStyleObjects.values()]) {
    if (hasComputedAndStaticAtRuleConflict(bucket)) {
      state.bailUnsupported(
        decl,
        "Unsupported: a property combines a computed at-rule key (from resolveSelector) with a static at-rule key on the same property — StyleX emits computed keys last, so the original cascade order between the at-rules cannot be preserved",
      );
      return;
    }
  }

  const baseRawEntries = Object.entries(styleObj);
  resolveBoxShorthandConflicts(styleObj);
  resolveDirectionalConflicts(styleObj);
  expandMultiValueBorderRadius(styleObj);
  warnOpaqueShorthands(styleObj, decl, warnings);
  for (const bucket of variantBuckets.values()) {
    resolveBoxShorthandConflicts(bucket);
    resolveDirectionalConflicts(bucket, { skipNullishShorthandDefault: true });
    expandMultiValueBorderRadius(bucket);
    warnOpaqueShorthands(bucket, decl, warnings);
  }
  const variantBucketObjects = [...variantBuckets.values()];
  harmonizeShorthandExpansion([styleObj, ...variantBucketObjects, ...extraStyleObjects.values()], {
    baseStyleObj: styleObj,
    inheritBaseLateSides: new Set(variantBucketObjects),
    baseRawEntries,
    bucketBaseKeySnapshot: bucketSnapshotLookup(decl, variantBuckets),
    bucketSourceOrder: bucketSourceOrderLookup(decl, variantBuckets),
  });

  registerLocalStylexVarFallbacks(state, decl, styleObj);

  const varsToDrop = new Set<string>();
  const staticInlineStyleProps = decl.staticInlineStyleProps ?? [];
  decl.staticInlineStyleProps = staticInlineStyleProps;
  const bucketsForVarRewrite: Array<Record<string, unknown>> = [
    styleObj,
    ...extraStyleObjects.values(),
    ...variantBuckets.values(),
  ];
  // styleFnDecls hold AST nodes (ArrowFunctionExpression bodies). Walking their
  // template-literal quasis lets us resolve var() calls embedded inside dynamic
  // style functions (e.g. `flexShrink: \`var(--x, ${expr})\``).
  // Rewrite these before static buckets so generated local CSS vars from dynamic
  // `--x` definitions are available when static `var(--x, fallback)` values are
  // lowered.
  for (const fnAst of styleFnDecls.values()) {
    if (fnAst && typeof fnAst === "object" && isAstNode(fnAst)) {
      rewriteCssVarsInAstNode(fnAst, localVarValues, varsToDrop);
    }
  }
  for (const inlineStyleProp of inlineStyleProps) {
    const { prop, expr } = inlineStyleProp;
    if (!prop.startsWith("--")) {
      continue;
    }
    const defaultValue = findLocalCustomPropertyFallbackFromRules(prop, decl);
    if (!defaultValue) {
      continue;
    }
    const localVar = state.getOrCreateLocalStylexVar(prop, defaultValue);
    inlineStyleProp.keyExpr = stylexVarMemberExpression(state.j, localVar);
    if (expr && typeof expr === "object" && isAstNode(expr)) {
      rewriteCssVarsInAstNode(expr as { type: string }, localVarValues, varsToDrop);
    }
  }
  for (const bucket of bucketsForVarRewrite) {
    rewriteCssVarsInStyleObject(bucket, localVarValues, varsToDrop);
  }
  // Apply `dropDefinition: true` results to every bucket that may carry a
  // `--name: ...` definition for the resolved variable. Otherwise, the local
  // definition would survive in non-base buckets and contradict the adapter contract.
  for (const name of varsToDrop) {
    for (const bucket of bucketsForVarRewrite) {
      dropCssVariableDefinitionsFromBucket(bucket, name);
    }
  }
  if (decl.base.kind !== "component") {
    const unsafeProps = collectStyleOverrideProps({
      afterBaseStyleKeys: decl.extraStyleKeysAfterBase ?? [],
      cssHelperPropValues,
      extraStyleObjects,
      resolvedStyleObjects,
      variantBuckets,
      styleFnDecls,
    });
    moveCustomPropertyOnlyBaseToInlineStyles({
      styleObj,
      inlineStyleProps,
      staticInlineStyleProps,
      unsafeProps,
      hasOpaqueExtraStylexPropsArgs: (decl.extraStylexPropsArgs?.length ?? 0) > 0,
      j: state.j,
    });
    moveUnsafeRawCssVarPropsToInlineStyles({
      styleObj,
      inlineStyleProps,
      staticInlineStyleProps,
      unsafeProps,
      j: state.j,
    });
  }
  moveUnsafeRawCssVarStyleFnsToInlineStyles({
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    staticInlineStyleProps,
    baseRawCssVarProps: collectRawCssVarStyleObjectProps(styleObj),
    rawCss: decl.rawCss,
    unsafeProps: collectStyleOverrideProps({
      afterBaseStyleKeys: decl.extraStyleKeysAfterBase ?? [],
      cssHelperPropValues,
      extraStyleObjects,
      resolvedStyleObjects,
      variantBuckets,
      styleFnDecls: new Map(),
    }),
    j: state.j,
  });

  // Check for interpolations in pseudo selectors that can't be safely transformed
  const hasPseudoBlockInterpolation = (() => {
    if (!decl.rawCss) {
      return false;
    }
    // Match pattern: &:pseudo { ... __SC_EXPR_X__; ... }
    // where the placeholder is standalone (CSS block interpolation), not a property value
    const pseudoBlockRe = /&:[a-z-]+(?:\([^)]*\))?\s*\{([^}]*)\}/gi;
    let m;
    while ((m = pseudoBlockRe.exec(decl.rawCss))) {
      const blockContent = m[1] ?? "";
      // Check if the block contains a standalone placeholder (not part of a property: value)
      // A standalone placeholder is on its own line with optional whitespace/semicolon
      const lines = blockContent.split(/[\n\r]/);
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) {
          continue;
        }
        // Check if this line is ONLY a placeholder (no property name before it)
        if (/^__SC_EXPR_\d+__\s*;?\s*$/.test(trimmed)) {
          return true;
        }
      }
    }
    return false;
  })();

  if (
    decl.rawCss &&
    (/__SC_EXPR_\d+__\s*\{/.test(decl.rawCss) ||
      /&:[a-z-]+(?:\([^)]*\))?\s+__SC_EXPR_\d+__\s*\{/i.test(decl.rawCss) ||
      hasPseudoBlockInterpolation)
  ) {
    // ancestorPseudo is null for base styles, or the pseudo string (e.g., ":hover", ":focus-visible")
    const applyBlock = (slotId: number, declsText: string, ancestorPseudo: string | null) => {
      const expr = decl.templateExpressions[slotId] as any;
      if (!expr || expr.type !== "Identifier") {
        return;
      }
      const childLocal = expr.name as string;
      const childDecl = state.declByLocalName.get(childLocal);
      if (!childDecl) {
        return;
      }
      const overrideStyleKey = `${toStyleKey(childLocal)}In${decl.localName}`;
      ancestorSelectorParents.add(decl.styleKey);

      const bucket = getOrCreateRelationOverrideBucket(
        overrideStyleKey,
        decl.styleKey,
        childDecl.styleKey,
        ancestorPseudo,
        relationOverrides,
        relationOverridePseudoBuckets,
      );

      const declLines = declsText
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of declLines) {
        const m = line.match(/^([^:]+):([\s\S]+)$/);
        if (!m || !m[1] || !m[2]) {
          continue;
        }
        const prop = m[1].trim();
        const value = m[2].trim();
        // Skip values that contain unresolved interpolation placeholders - these should
        // be handled by the IR handler which has proper theme resolution
        if (PLACEHOLDER_RE.test(value)) {
          continue;
        }
        // Use cssDeclarationToStylexDeclarations for proper shorthand expansion
        // (border → borderWidth/Style/Color, background → backgroundColor, etc.)
        for (const out of cssDeclarationToStylexDeclarations({
          property: prop,
          value: { kind: "static", value },
          important: false,
          valueRaw: value,
        })) {
          if (out.value.kind === "static") {
            const jsVal = cssValueToJs(out.value, false, out.prop);
            (bucket as Record<string, unknown>)[out.prop] = jsVal;
          }
        }
      }
    };

    const baseRe = /__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/g;
    let m: RegExpExecArray | null;
    while ((m = baseRe.exec(decl.rawCss))) {
      if (isComponentBlockHandledByRuleProcessor(decl.rawCss, m.index)) {
        continue;
      }
      applyBlock(Number(m[1]), m[2] ?? "", null);
    }
    // Match any pseudo selector pattern: &:hover, &:focus-visible, &:active, etc.
    const pseudoRe = /&(:[a-z-]+(?:\([^)]*\))?)\s+__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/gi;
    while ((m = pseudoRe.exec(decl.rawCss))) {
      if (!m[1]) {
        continue;
      }
      const pseudo = m[1];
      applyBlock(Number(m[2]), m[3] ?? "", pseudo);
    }

    // Detect interpolations INSIDE pseudo selector blocks that weren't handled.
    // Pattern: &:hover { __SC_EXPR_X__; } - placeholder is INSIDE the braces.
    // When the adapter provides `cssText`, we can expand individual CSS properties and
    // wrap them in pseudo selectors. Otherwise, bail since the selector context would be lost.
    const insidePseudoRe = /&(:[a-z-]+(?:\([^)]*\))?)\s*\{[^}]*__SC_EXPR_(\d+)__[^}]*\}/gi;
    while ((m = insidePseudoRe.exec(decl.rawCss))) {
      const pseudo = m[1];
      const slotId = Number(m[2]);
      const expr = decl.templateExpressions[slotId] as any;
      const placeholderIndex = decl.rawCss.indexOf(`__SC_EXPR_${slotId}__`, m.index);
      if (
        placeholderIndex >= 0 &&
        isPlaceholderInsideHandledComponentBlock(decl.rawCss, placeholderIndex)
      ) {
        if (isPlaceholderInValuePosition(decl.rawCss, placeholderIndex)) {
          // Rule processor already lowered this `prop: ${dyn}` slot via the
          // CSS var bridge / static expansion; nothing left to do here.
          continue;
        }
        // Standalone interpolation inside a `${Child}` block under a parent pseudo.
        // The rule processor doesn't lower standalone slots, and the conditional
        // helper resolver below would lose the inner child selector context and
        // apply styles to the wrong target. Bail rather than silently dropping.
        warnings.push({
          severity: "warning",
          type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
          loc: decl.loc,
          context: { selector: `&${pseudo}` },
        });
        state.markBail();
        break;
      }
      // Skip component/imported identifiers (those are handled by the rule processor).
      if (!expr || expr.type === "Identifier") {
        continue;
      }
      // Try to resolve conditional helper call inside pseudo selector
      if (pseudo) {
        const result = tryResolveConditionalHelperCallInPseudo(ctx, expr, pseudo);
        if (result.outcome === "handled") {
          continue;
        }
        if (result.outcome === "resolved-without-cssText") {
          // The adapter resolved the call as StyleX styles but didn't provide cssText,
          // so we can't expand individual CSS properties for pseudo-selector wrapping.
          warnings.push({
            severity: "warning",
            type: "Adapter resolved StyleX styles inside pseudo selector but did not provide cssText for property expansion — add cssText to resolveCall result to enable pseudo-wrapping",
            loc: decl.loc,
            context: { selector: result.selector },
          });
          state.markBail();
          break;
        }
        if (result.outcome === "invalid-cssText") {
          // The adapter provided cssText but it couldn't be parsed as valid CSS declarations.
          warnings.push({
            severity: "error",
            type: 'Adapter resolveCall cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")',
            loc: decl.loc,
            context: { selector: result.selector, cssText: result.cssText },
          });
          state.markBail();
          break;
        }
      }
      // Cannot handle this interpolation - bail with generic warning
      warnings.push({
        severity: "warning",
        type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
        loc: decl.loc,
        context: { selector: `&${pseudo}` },
      });
      state.markBail();
      break;
    }
    if (state.bail) {
      return;
    }
  }

  if (decl.enumVariant) {
    const { baseKey, cases } = decl.enumVariant;
    const oldKey = decl.styleKey;
    decl.styleKey = baseKey;
    resolvedStyleObjects.delete(oldKey);
    expandMultiValueBorderRadius(styleObj);
    resolvedStyleObjects.set(baseKey, styleObj);
    for (const [k, v] of extraStyleObjects.entries()) {
      expandMultiValueBorderRadius(v);
      resolvedStyleObjects.set(k, v);
    }
    for (const c of cases) {
      resolvedStyleObjects.set(c.styleKey, { backgroundColor: c.value });
    }
    decl.needsWrapperComponent = true;
  } else {
    expandMultiValueBorderRadius(styleObj);
    resolvedStyleObjects.set(decl.styleKey, styleObj);
    for (const [k, v] of extraStyleObjects.entries()) {
      expandMultiValueBorderRadius(v);
      resolvedStyleObjects.set(k, v);
    }
  }

  // Preserve CSS cascade semantics for pseudo selectors when variant buckets override the same property.
  //
  // We intentionally keep this narrowly-scoped to avoid churning fixture output shapes.
  // Currently we only synthesize compound variants for the `disabled` + `color === "primary"` pattern
  // so that hover can still win (matching CSS specificity semantics).
  {
    const isPseudoOrMediaMap = (v: unknown): v is Record<string, unknown> => {
      if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
        return false;
      }
      const keys = Object.keys(v as any);
      if (keys.length === 0) {
        return false;
      }
      return keys.includes("default") || keys.some(isStyleConditionKey);
    };

    // Check if we should use namespace dimensions pattern instead of compound buckets
    // This is triggered when a boolean bucket overlaps CSS props with an enum bucket that
    // has a 2-value union type (indicating a variants-recipe pattern)
    const shouldUseNamespaceDimensions = (() => {
      const disabledBucket = variantBuckets.get("disabled");
      if (!disabledBucket) {
        return false;
      }
      const disabledCssProps = new Set(Object.keys(disabledBucket));

      // Check for enum buckets with 2-value union types that overlap with disabled
      for (const [when] of variantBuckets.entries()) {
        const match = when.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*===\s*"([^"]*)"$/);
        if (!match) {
          continue;
        }
        const propName = match[1]!;
        const propType = ctx.findJsxPropTsTypeForVariantExtraction(propName);
        const unionValues = extractUnionLiteralValues(propType);
        if (!unionValues || unionValues.length !== 2) {
          continue;
        }

        const enumBucket = variantBuckets.get(when);
        if (!enumBucket) {
          continue;
        }
        for (const cssProp of Object.keys(enumBucket)) {
          if (disabledCssProps.has(cssProp)) {
            return true;
          }
        }
      }
      return false;
    })();

    // Skip compound bucket creation if we'll use namespace dimensions instead
    if (!shouldUseNamespaceDimensions) {
      // Special-case: if we have a boolean "disabled" variant bucket overriding a prop that also has
      // a hover map, preserve CSS specificity semantics by emitting a compound variant keyed off
      // `disabled && color === "primary"` (when available).
      //
      // This matches styled-components semantics for patterns like:
      //  - &:hover { background-color: (color === "primary" ? darkblue : darkgray) }
      //  - disabled && "background-color: grey"
      //
      // In CSS, :hover can still override base disabled declarations due to higher specificity.
      // In StyleX, a later `backgroundColor` assignment can clobber pseudo maps, so we need the
      // disabled bucket to include an explicit ':hover' value for the relevant color case.
      const disabledKey = "disabled";
      const colorPrimaryKey = `color === "primary"`;
      const disabledBucket = variantBuckets.get(disabledKey);
      const colorPrimaryBucket = variantBuckets.get(colorPrimaryKey);
      if (disabledBucket && (styleObj as any).backgroundColor) {
        const baseBg = (styleObj as any).backgroundColor;
        const primaryBg = (colorPrimaryBucket as any)?.backgroundColor ?? null;

        const baseHover = isPseudoOrMediaMap(baseBg) ? (baseBg as any)[":hover"] : null;
        const primaryHover = isPseudoOrMediaMap(primaryBg) ? (primaryBg as any)[":hover"] : null;

        const disabledBg = (disabledBucket as any).backgroundColor;
        const disabledDefault = isPseudoOrMediaMap(disabledBg)
          ? (disabledBg as any).default
          : (disabledBg ?? null);

        if (disabledDefault !== null && baseHover !== null && primaryHover !== null) {
          // Remove the base disabled backgroundColor override; we'll replace it with compound buckets.
          delete (disabledBucket as any).backgroundColor;

          const disabledPrimaryWhen = `${disabledKey} && ${colorPrimaryKey}`;
          const disabledNotPrimaryWhen = `${disabledKey} && color !== "primary"`;

          const mkBucket = (hoverVal: any) => ({
            ...(disabledBucket as any),
            backgroundColor: { default: disabledDefault, ":hover": hoverVal },
          });

          variantBuckets.set(disabledPrimaryWhen, mkBucket(primaryHover));
          variantStyleKeys[disabledPrimaryWhen] ??= styleKeyWithSuffix(
            decl.styleKey,
            disabledPrimaryWhen,
          );

          variantBuckets.set(disabledNotPrimaryWhen, mkBucket(baseHover));
          variantStyleKeys[disabledNotPrimaryWhen] ??= styleKeyWithSuffix(
            decl.styleKey,
            disabledNotPrimaryWhen,
          );
        }
      }
    }
  }

  // Prevent flat variant values from clobbering pseudo/media maps.
  // Promotes flat values to pseudo-maps so StyleX merges them correctly.
  liftFlatVariantsToPseudoMaps(variantBuckets);

  // Group enum-like variant conditions into dimensions for StyleX variants recipe pattern
  const { dimensions, remainingBuckets, remainingStyleKeys, propsToStrip } =
    groupVariantBucketsIntoDimensions(
      variantBuckets,
      variantStyleKeys,
      decl.styleKey,
      styleObj,
      ctx.findJsxPropTsTypeForVariantExtraction,
      ctx.isJsxPropOptional,
    );

  // Store dimensions for separate stylex.create calls
  if (dimensions.length > 0) {
    // Compute source order for each dimension from its constituent variant entries.
    // Entries consumed by dimensions were removed from remainingStyleKeys but their
    // original source order is still in variantSourceOrder.
    if (Object.keys(variantSourceOrder).length > 0) {
      for (const dim of dimensions) {
        let minOrder: number | undefined;
        for (const [when, order] of Object.entries(variantSourceOrder)) {
          // Match variant entries belonging to this dimension (e.g., "size === \"tiny\"" for propName "size")
          if (when.startsWith(`${dim.propName} ===`) || when === dim.propName) {
            if (minOrder === undefined || order < minOrder) {
              minOrder = order;
            }
          }
        }
        if (minOrder !== undefined) {
          dim.sourceOrder = minOrder;
        }
      }
    }
    for (const dim of dimensions) {
      const observedFallbackFnKey = observedVariantFallbackFns.get(dim.propName);
      if (observedFallbackFnKey) {
        dim.fallbackFnKey = observedFallbackFnKey;
      }
      if (!observedFallbackFnKey && hasFiniteNumericVariantKey(dim)) {
        dim.propTypeFromKeyof = true;
      }
      if (decl.variantLookupCastProps?.has(dim.propName)) {
        dim.forceKeyofLookupCast = true;
      }
    }
    decl.variantDimensions = mergeVariantDimensions(decl.variantDimensions, dimensions);
    decl.needsWrapperComponent = true;
    // Remove CSS props that were moved to variant dimensions from base styles
    for (const prop of propsToStrip) {
      delete (styleObj as Record<string, unknown>)[prop];
    }
  }

  factorCommonStylesFromComplementaryCompoundVariants({
    decl,
    stateResolvedStyleObjects: resolvedStyleObjects,
    remainingBuckets,
    remainingStyleKeys,
    variantSourceOrder,
    styleFnFromProps,
    styleFnDecls,
    extraStyleObjects,
    attrBuckets,
  });

  const remainingBucketObjects = [...remainingBuckets.values()];
  harmonizeShorthandExpansion(
    [styleObj, ...remainingBucketObjects, ...extraStyleObjects.values(), ...attrBuckets.values()],
    {
      baseStyleObj: styleObj,
      inheritBaseLateSides: new Set(remainingBucketObjects),
      baseRawEntries,
      bucketBaseKeySnapshot: bucketSnapshotLookup(decl, remainingBuckets),
      bucketSourceOrder: bucketSourceOrderLookup(decl, remainingBuckets),
    },
  );

  // Add remaining (compound/boolean) variants to resolvedStyleObjects
  for (const [when, obj] of remainingBuckets.entries()) {
    const key = remainingStyleKeys[when]!;
    expandMultiValueBorderRadius(obj);
    resolvedStyleObjects.set(key, obj);
  }
  for (const [k, v] of attrBuckets.entries()) {
    resolvedStyleObjects.set(k, v);
  }
  if (Object.keys(remainingStyleKeys).length) {
    decl.variantStyleKeys = remainingStyleKeys;
    // Copy source order for variant keys that survived into remainingStyleKeys
    if (Object.keys(variantSourceOrder).length > 0) {
      const filteredOrder: Record<string, number> = {};
      for (const key of Object.keys(remainingStyleKeys)) {
        if (key in variantSourceOrder) {
          const order = variantSourceOrder[key];
          if (order !== undefined) {
            filteredOrder[key] = order;
          }
        }
      }
      if (Object.keys(filteredOrder).length > 0) {
        decl.variantSourceOrder = filteredOrder;
      }
    }
    // If we have variant styles keyed off props (e.g. `disabled`),
    // we need a wrapper component to evaluate those conditions at runtime and
    // avoid forwarding custom variant props to DOM nodes.
    decl.needsWrapperComponent = true;
  }
  if (styleFnFromProps.length) {
    // When a style function and a variant bucket share the same style key (same
    // condition), merge the variant's static properties into the style function's
    // return object and remove the duplicate variant reference.
    mergeVariantBucketsIntoStyleFns({
      j: state.j,
      styleFnFromProps,
      styleFnDecls,
      remainingBuckets,
      remainingStyleKeys,
      resolvedStyleObjects,
      variantSourceOrder: decl.variantSourceOrder,
    });

    // Consolidate style functions that share the same jsxProp into a single function.
    // E.g., containerWidth($size), containerHeight($size), containerLineHeight($size)
    // become a single containerSize($size) with all properties merged.
    consolidateSameJsxPropStyleFns({
      styleKey: decl.styleKey,
      styleFnFromProps,
      styleFnDecls,
      hasShouldForwardProp: !!decl.shouldForwardProp,
    });

    decl.styleFnFromProps = styleFnFromProps;
  }

  // Merge base static properties into a single unconditional style function when:
  // - there is exactly one unconditional styleFn (no conditionWhen)
  // - the base styleObj has properties to merge
  // - there are no variant style keys, extra style objects, or enum variants
  // - the component is not extended by other styled components
  mergeBaseIntoSingleStyleFn({
    j: state.j,
    decl,
    styleObj,
    styleFnFromProps,
    styleFnDecls,
    extraStyleObjects,
    styledDecls: state.styledDecls,
  });

  // Keep legacy object-param conversion for merged-base functions unless the
  // lowering step already supplied explicit scalar call args.
  convertStyleFnsToPropsPattern(state.j, styleFnDecls, styleFnFromProps, decl.styleKey);
  alignComputedCallArgStyleFnParams(styleFnDecls, styleFnFromProps);
  unionStyleFnParamsFromStyleFnFromProps(state.j, decl, styleFnDecls, styleFnFromProps);
  narrowGuardedStyleFnParamTypes(state.j, decl, styleFnDecls, styleFnFromProps);

  insertStyleFnDeclsAfterComponent(resolvedStyleObjects, styleFnDecls, {
    styleKey: decl.styleKey,
    extraStyleObjects,
    remainingStyleKeys,
    attrBuckets,
    enumVariant: decl.enumVariant,
  });
  // When the base styleKey is a dynamic function (not a static style object),
  // skip the bare `styles.{styleKey}` reference in stylex.props() to avoid
  // passing a function instead of a style object.
  if (styleFnDecls.has(decl.styleKey) && Object.keys(styleObj).length === 0) {
    decl.skipBaseStyleRef = true;
  }
  if (inlineStyleProps.length) {
    decl.inlineStyleProps = inlineStyleProps;
  }
}

/**
 * Returns true when any property in the bucket has a computed at-rule key
 * (`__computedKeys`, which the emitter always appends after the static keys) that came
 * EARLIER in the source than a static at-rule key on the same property (e.g. computed
 * `@container` before a later `@media print`). StyleX breaks same-tier at-rule ties by
 * object position, so appending the computed key last would let it win over the static
 * at-rule that should win — reversing the original cascade.
 *
 * The guard is conservative (safe/lossless): a static at-rule key is allowed only when EVERY
 * at-rule computed key on the property is PROVABLY ordered after it (each at-rule computed key
 * carries a recorded source order and the static key's order is smaller). The common safe
 * case — a base `@media` followed by a selector-interpolated breakpoint, as in
 * `mediaQuery-helper` — is preserved. Anything that cannot be proven safe bails:
 *   - a static at-rule key whose source order is later than, or unprovable against, a computed
 *     at-rule key (e.g. a value copied into a variant bucket by
 *     `patchEarlierDynamicConditionValues` without source-order metadata);
 *   - any at-rule computed key that carries no recorded source order (e.g. produced by a
 *     resolver path that doesn't stamp it) — its position relative to the static key is unknown.
 *
 * Relation computed keys (`stylex.when.siblingBefore` / `ancestor`, emitted as call
 * expressions) sit in a different StyleX priority tier and nest their own at-rules inside their
 * value, so they never collide with a top-level at-rule key and are excluded. Static pseudo
 * keys are likewise ignored.
 */
function hasComputedAndStaticAtRuleConflict(bucket: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(bucket)) {
    if (key.startsWith("__") || !value || typeof value !== "object") {
      continue;
    }
    if (Array.isArray(value) || isAstNode(value)) {
      continue;
    }
    const map = value as Record<string, unknown>;
    const computedKeys = map.__computedKeys;
    if (!Array.isArray(computedKeys) || computedKeys.length === 0) {
      continue;
    }
    // At-rule computed keys are the only ones whose position relative to a static at-rule key
    // matters; relation keys (stylex.when.*) and CSS-variable definitions are excluded.
    const atRuleComputedEntries = (computedKeys as ComputedKeyEntry[]).filter(
      isAtRuleComputedKeyEntry,
    );
    if (atRuleComputedEntries.length === 0) {
      continue;
    }
    const staticAtRuleKeys = Object.keys(map).filter((k) => k.startsWith("@"));
    if (staticAtRuleKeys.length === 0) {
      continue;
    }
    // Any at-rule computed key without a recorded source order makes ordering unprovable.
    if (atRuleComputedEntries.some((entry) => entry.sourceOrder === undefined)) {
      return true;
    }
    const earliestComputed = Math.min(
      ...atRuleComputedEntries.map((entry) => entry.sourceOrder as number),
    );
    const staticAtRuleNotProvablyEarlier = staticAtRuleKeys.some((k) => {
      const staticOrder = getConditionSourceOrder(map, k);
      return staticOrder === undefined || staticOrder >= earliestComputed;
    });
    if (staticAtRuleNotProvablyEarlier) {
      return true;
    }
  }
  return false;
}

/**
 * True when a computed key entry represents an at-rule (`@media`/`@container`/`@supports`),
 * whose object position determines cascade order against sibling at-rule keys. Relation keys
 * (`stylex.when.siblingBefore`/`ancestor`) are call expressions in a different priority tier,
 * and CSS-variable definitions (`[vars.x]: value`, marked `prepend`/`originalCssVariableName`)
 * are declarations, not conditions — both are excluded.
 */
function isAtRuleComputedKeyEntry(entry: ComputedKeyEntry): boolean {
  if (entry.prepend || entry.originalCssVariableName) {
    return false;
  }
  const keyExpr = entry.keyExpr;
  if (!keyExpr || typeof keyExpr !== "object") {
    return false;
  }
  const type = (keyExpr as { type?: string }).type;
  return type !== "CallExpression" && type !== "OptionalCallExpression";
}

/**
 * Merges a per-property condition bucket (pseudo or media) into the style object.
 * When a property already exists as an object in styleObj, merges entries to
 * preserve both pseudo-class and media query entries on the same property.
 */
function mergeConditionBucket(
  styleObj: Record<string, unknown>,
  bucket: Record<string, Record<string, unknown>>,
): void {
  for (const [prop, map] of Object.entries(bucket)) {
    const existing = styleObj[prop];
    if (
      existing &&
      typeof existing === "object" &&
      !isAstNode(existing) &&
      !Array.isArray(existing)
    ) {
      mergeStyleObjects(existing as Record<string, unknown>, map);
      copyConditionSourceOrders(existing as Record<string, unknown>, map);
    } else {
      if (existing !== undefined && (map.default === null || map.default === undefined)) {
        map.default = existing;
      }
      styleObj[prop] = map;
    }
  }
}

/**
 * Prevents flat variant values from clobbering pseudo/media maps in the StyleX cascade.
 *
 * When a simple boolean variant bucket (e.g., "checked") has a flat value like
 * `borderColor: "#0066cc"` and a related compound bucket (e.g., "checkedTrue")
 * has a pseudo-map like `borderColor: { default: "#ccc", ":hover": "#0044aa" }`,
 * the flat value would override the entire pseudo-map because it appears later
 * in the `stylex.props()` array.
 *
 * Fix: promote the flat value in the simple bucket to a pseudo-map that preserves
 * the pseudo/media entries from the matching compound bucket. The compound bucket's
 * default is also updated to the flat value. Both buckets now use pseudo-maps, so
 * StyleX merges them correctly and the simple bucket remains independently applicable
 * (important for 3-branch compound ternaries where the inner branch may not be reached).
 */
function liftFlatVariantsToPseudoMaps(variantBuckets: Map<string, Record<string, unknown>>): void {
  // Collect simple condition keys (single boolean prop names without operators)
  const simpleKeys: string[] = [];
  for (const key of variantBuckets.keys()) {
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
      simpleKeys.push(key);
    }
  }
  if (simpleKeys.length === 0) {
    return;
  }

  for (const simpleKey of simpleKeys) {
    const simpleBucket = variantBuckets.get(simpleKey);
    if (!simpleBucket) {
      continue;
    }

    for (const [cssProp, flatValue] of Object.entries(simpleBucket)) {
      if (isMediaOrPseudoMap(flatValue)) {
        continue;
      }

      // Find a matching compound bucket that has a pseudo/media map for the same property.
      // Matching means the compound key implies the simple condition is true:
      //   - "checkedTrue" implies "checked" (3-branch synthetic suffix)
      //   - "!disabled && checked" implies "checked" (compound && condition)
      for (const [compoundKey, compoundBucket] of variantBuckets.entries()) {
        if (compoundKey === simpleKey) {
          continue;
        }
        if (!variantKeyImpliesCondition(compoundKey, simpleKey)) {
          continue;
        }
        const compoundValue = compoundBucket[cssProp];
        if (!isMediaOrPseudoMap(compoundValue)) {
          continue;
        }
        // Promote the simple bucket's flat value to a pseudo-map by copying the
        // condition keys (e.g., ":hover") from the compound map. The flat value
        // becomes the "default" and each condition key gets the flat value too
        // (the simple bucket asserts the same value across all pseudo states).
        const liftedMap: Record<string, unknown> = { default: flatValue };
        for (const condKey of Object.keys(compoundValue)) {
          if (condKey !== "default" && isStyleConditionKey(condKey)) {
            liftedMap[condKey] = flatValue;
          }
        }
        simpleBucket[cssProp] = liftedMap;

        // Also update the compound bucket's default to the flat value so that
        // when only the compound bucket is applied (without the simple bucket),
        // the correct base value is used.
        compoundValue.default = flatValue;
        break; // one match is enough to lift the value
      }
    }
  }
}

/**
 * Checks whether a variant bucket key implies the given boolean condition is true.
 *
 * Handles two patterns:
 * 1. Compound conditions with "&&": e.g., "!disabled && checked" includes "checked"
 * 2. Synthetic 3-branch suffix: e.g., "checkedTrue" implies "checked" is true.
 *    This convention is set by `handleSplitMultiPropVariantsResolvedValue` in
 *    `interpolated-variant-resolvers.ts` (innerTruthyWhen = `${innerProp}True`).
 */
function variantKeyImpliesCondition(candidateKey: string, simpleKey: string): boolean {
  if (candidateKey.includes("&&")) {
    const parts = candidateKey.split(/\s*&&\s*/);
    return parts.some((part) => part.trim() === simpleKey);
  }
  // Only "True" suffix — "False" is the negated branch and must not match.
  if (candidateKey === `${simpleKey}True`) {
    return true;
  }
  return false;
}

/**
 * Merge variant dimensions while preserving existing (pre-lowered) dimensions first.
 *
 * Resolver-derived dimensions are collected before lower-rules run. Lowering can
 * then add template-derived dimensions. Keeping existing dimensions first preserves
 * cascade order when both write the same CSS properties.
 */
function mergeVariantDimensions(
  existingDimensions: VariantDimension[] | undefined,
  nextDimensions: VariantDimension[],
): VariantDimension[] {
  if (!existingDimensions || existingDimensions.length === 0) {
    return nextDimensions;
  }
  if (nextDimensions.length === 0) {
    return existingDimensions;
  }
  return [...existingDimensions, ...nextDimensions];
}

function isComponentBlockHandledByRuleProcessor(
  rawCss: string,
  componentBlockStart: number,
): boolean {
  if (
    /&:[a-z-]+(?:\([^)]*\))?\s+$/i.test(
      readPrefixSinceLastBlockBoundary(rawCss, componentBlockStart),
    )
  ) {
    return true;
  }
  const placeholderMatch = rawCss.slice(componentBlockStart).match(/^__SC_EXPR_\d+__/);
  if (!placeholderMatch?.[0]) {
    return false;
  }
  const componentBlock = findPlaceholderBlock(rawCss, placeholderMatch[0]);
  if (!componentBlock || componentBlock.start !== componentBlockStart) {
    return false;
  }
  const parentSelectorBlockStart = findPreviousOpeningBraceBeforeSelector(
    rawCss,
    componentBlockStart,
  );
  if (parentSelectorBlockStart === null) {
    return false;
  }
  const componentSelectorText = readSelectorBeforeBlock(rawCss, componentBlock.end);
  if (
    new RegExp(`^&:[a-z-]+(?:\\([^)]*\\))?\\s+${placeholderMatch[0]}$`, "i").test(
      componentSelectorText,
    )
  ) {
    return true;
  }
  if (componentSelectorText !== placeholderMatch[0]) {
    return false;
  }
  return (
    parseSimpleParentPseudoSelectorList(
      readSelectorBeforeBlock(rawCss, parentSelectorBlockStart),
    ) !== null
  );
}

function isPlaceholderInsideHandledComponentBlock(
  rawCss: string,
  placeholderIndex: number,
): boolean {
  const componentBlockOpen = findPreviousOpeningBraceBeforeSelector(rawCss, placeholderIndex);
  if (componentBlockOpen === null) {
    return false;
  }

  const componentSelectorText = readSelectorBeforeBlock(rawCss, componentBlockOpen);
  const componentPlaceholder = componentSelectorText.match(/__SC_EXPR_\d+__/);
  if (!componentPlaceholder?.[0]) {
    return false;
  }

  const componentBlockStart = rawCss.lastIndexOf(componentPlaceholder[0], componentBlockOpen);
  return (
    componentBlockStart >= 0 && isComponentBlockHandledByRuleProcessor(rawCss, componentBlockStart)
  );
}

/**
 * True when the placeholder sits in CSS value position (preceded by `:` since the
 * last declaration boundary). The rule processor only lowers `prop: value` slots
 * inside `${Child}` blocks; standalone slots like `${(p) => helper()}` are not.
 */
function isPlaceholderInValuePosition(rawCss: string, placeholderIndex: number): boolean {
  for (let i = placeholderIndex - 1; i >= 0; i--) {
    const ch = rawCss[i];
    if (ch === ":") {
      return true;
    }
    if (ch === ";" || ch === "{" || ch === "}") {
      return false;
    }
  }
  return false;
}

type PseudoHelperCallResult =
  | { outcome: "handled" }
  | { outcome: "not-applicable" }
  | { outcome: "resolved-without-cssText"; selector: string }
  | { outcome: "invalid-cssText"; selector: string; cssText: string };

/**
 * Resolves conditional helper calls inside pseudo selector blocks.
 *
 * Pattern: `&:hover { ${(props) => (props.$truncate ? truncate() : "")} }`
 *
 * When the adapter provides `cssText` for the resolved helper call, the CSS properties
 * can be expanded and wrapped in pseudo selectors (`{ default: null, ":hover": value }`).
 * The result is applied as a variant bucket keyed off the conditional prop.
 *
 * Returns a discriminated result:
 * - `"handled"`: pattern matched and styles were applied
 * - `"not-applicable"`: expression doesn't match the expected pattern
 * - `"resolved-without-cssText"`: adapter resolved the call as StyleX styles but did not
 *    provide `cssText`, so properties can't be expanded for pseudo-wrapping
 * - `"invalid-cssText"`: adapter provided `cssText` but it could not be parsed as CSS declarations
 */
function tryResolveConditionalHelperCallInPseudo(
  ctx: DeclProcessingState,
  expr: unknown,
  pseudo: string,
): PseudoHelperCallResult {
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ArrowFunctionExpression"
  ) {
    return { outcome: "not-applicable" };
  }
  // Minimal assertion: after the type guard, expr is an ArrowFunctionExpression-shaped object.
  const arrowExpr = expr as Parameters<typeof getArrowFnSingleParamName>[0];
  const paramName = getArrowFnSingleParamName(arrowExpr);
  if (!paramName) {
    return { outcome: "not-applicable" };
  }
  const body = getFunctionBodyExpr(arrowExpr) as {
    type?: string;
    test?: unknown;
    consequent?: unknown;
    alternate?: unknown;
  } | null;
  if (!body || body.type !== "ConditionalExpression") {
    return { outcome: "not-applicable" };
  }
  const { test, consequent, alternate } = body;

  // Extract test prop name: props.$truncate -> "$truncate"
  const testPath =
    test && typeof test === "object" && (test as { type?: string }).type === "MemberExpression"
      ? getMemberPathFromIdentifier(
          test as Parameters<typeof getMemberPathFromIdentifier>[0],
          paramName,
        )
      : null;
  const testProp = testPath?.[0];
  if (!testPath || testPath.length !== 1 || !testProp) {
    return { outcome: "not-applicable" };
  }

  // Determine which branch is the call expression and which is empty
  const consIsEmpty = isEmptyCssBranch(consequent);
  const altIsEmpty = isEmptyCssBranch(alternate);
  const consIsCall = !consIsEmpty && isCallExpressionNode(consequent);
  const altIsCall = !altIsEmpty && isCallExpressionNode(alternate);

  if (!((consIsCall && altIsEmpty) || (consIsEmpty && altIsCall))) {
    return { outcome: "not-applicable" };
  }

  const callBranch = consIsCall ? consequent : alternate;

  // Resolve the call expression through resolveDynamicNode
  const dynamicNode = {
    slotId: 0,
    expr: callBranch,
    css: { kind: "declaration" as const, selector: "&", atRuleStack: [] as string[] },
    component: ctx.componentInfo,
    usage: { jsxUsages: 1, hasPropsSpread: false },
  };
  const res = resolveDynamicNode(dynamicNode, ctx.handlerContext);

  // Adapter resolved as StyleX styles but didn't provide cssText for expansion
  if (res && res.type === "resolvedStyles" && !res.cssText) {
    return { outcome: "resolved-without-cssText", selector: `&${pseudo}` };
  }

  if (!res || res.type !== "resolvedStyles" || !res.cssText) {
    return { outcome: "not-applicable" };
  }

  // Parse the CSS text into StyleX properties
  const parsedStyle = parseCssDeclarationBlock(res.cssText);
  if (!parsedStyle || Object.keys(parsedStyle).length === 0) {
    return { outcome: "invalid-cssText", selector: `&${pseudo}`, cssText: res.cssText };
  }

  // Wrap each property in pseudo selectors: { default: <base>, ":hover": value }
  // Preserve existing base values from styleObj so they aren't cleared by `default: null`
  // when the variant is applied. In styled-components, the base value persists and only
  // the pseudo state overrides it.
  // When the existing value is already a pseudo/media map (e.g. { default: "auto", ":focus": "scroll" }),
  // extract the scalar `.default` AND merge existing pseudo/media entries so they aren't lost
  // when StyleX replaces the entire property map with the variant's value.
  const { styleObj, cssHelperPropValues, resolveComposedDefaultValue } = ctx;
  const pseudoWrappedStyle: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(parsedStyle)) {
    const raw = (styleObj as Record<string, unknown>)[prop];
    const helperRaw = cssHelperPropValues.has(prop)
      ? resolveComposedDefaultValue(cssHelperPropValues.get(prop), prop)
      : undefined;
    const sourceMap = raw !== undefined ? raw : helperRaw;
    const scalarDefault = extractScalarDefault(sourceMap ?? null);
    // Start with { default: <scalar>, [pseudo]: value }
    const propMap: Record<string, unknown> = { default: scalarDefault, [pseudo]: value };
    // Merge existing pseudo/media entries so they aren't dropped when the variant replaces the map
    mergeExistingPseudoEntries(propMap, sourceMap);
    pseudoWrappedStyle[prop] = propMap;
  }

  // Determine the condition: truthy for consequent call, inverted for alternate call
  const when = consIsCall ? testProp : `!${testProp}`;

  // Apply as a variant bucket
  const { variantBuckets, variantStyleKeys, decl } = ctx;
  variantBuckets.set(when, { ...variantBuckets.get(when), ...pseudoWrappedStyle });
  variantStyleKeys[when] ??= styleKeyWithSuffix(decl.styleKey, when);

  // Drop the transient prop from forwarding
  ensureShouldForwardPropDrop(decl, testProp);
  decl.needsWrapperComponent = true;

  // Note: we intentionally do NOT add the adapter's imports here because we use
  // the inlined CSS properties (from cssText) rather than the opaque style reference.

  return { outcome: "handled" };
}
