/**
 * Finalizes per-declaration style objects after rule processing.
 * Core concepts: merge pseudo/media buckets, rewrite CSS vars, and emit variants.
 */
import {
  cssDeclarationToStylexDeclarations,
  getUseLogicalProperties,
} from "../css-prop-mapping.js";
import {
  cssValueToJs,
  literalToAst,
  objectToAst,
  toStyleKey,
  styleKeyWithSuffix,
} from "../transform/helpers.js";
import type { StyledDecl } from "../transform-types.js";
import type { JSCodeshift } from "jscodeshift";
import {
  extractUnionLiteralValues,
  groupVariantBucketsIntoDimensions,
  hasFiniteNumericVariantKey,
} from "./variants.js";
import { findCssVarCallsInString } from "../css-vars.js";
import {
  cloneAstNode,
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
import { getVariantBaseKeySnapshot, getVariantSourceOrder } from "./variant-utils.js";
import { copyConditionSourceOrders, getConditionSourceOrder } from "./condition-source-order.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  findPlaceholderBlock,
  findPreviousOpeningBraceBeforeSelector,
  getOrCreateRelationOverrideBucket,
  parseSimpleParentPseudoSelectorList,
  readPrefixSinceLastBlockBoundary,
  readSelectorBeforeBlock,
} from "./shared.js";
import type { VariantDimension } from "../transform-types.js";
import type { WarningLog } from "../logger.js";
import { isStyleConditionKey, mapAst, mergeStyleObjects, walkAst } from "./utils.js";
import { stylexVarMemberExpression } from "../transform-css-vars.js";
import {
  expandBorderRadiusInStyleObject,
  expandBorderRadiusShorthandValue,
} from "../css-border-radius.js";
import { staticStringValue } from "./style-object-normalization.js";
import { splitCssValueWhitespace } from "../css-value-split.js";

export { extractSingleRawCssVarStyleFnProperty, replaceIdentifierInAst };

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
      }));
    } else {
      // No existing map, create a new nested object with default and __computedKeys
      const nested: Record<string, unknown> = { default: resolvedDefault };
      (nested as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
        keyExpr: e.keyExpr,
        value: e.value,
        leadingComment: e.leadingComment,
      }));
      styleObj[prop] = nested;
    }
  }
  for (const [sel, obj] of Object.entries(nestedSelectors)) {
    styleObj[sel] = obj;
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

function alignComputedCallArgStyleFnParams(
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  for (const entry of styleFnFromProps) {
    if (!entry.callArg || entry.jsxProp === "__props") {
      continue;
    }
    const fnAst = styleFnDecls.get(entry.fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const paramName = getArrowFnSingleParamName(
      fnAst as Parameters<typeof getArrowFnSingleParamName>[0],
    );
    if (!paramName || paramName === entry.jsxProp) {
      continue;
    }
    renameIdentifierInAst(fnAst, entry.jsxProp, paramName);
  }
}

/**
 * Ensures every style-fn declaration declares all the parameters the call site
 * will pass. When `styleFnFromProps` reports that a single fnKey is called
 * with both a primary jsxProp and extra call args (e.g.
 * `styles.panel(compact, isExpanded)`), but the function definition only
 * declares the primary as a parameter, the body's references to the extras
 * become dangling identifiers — TS2304 "Cannot find name 'isExpanded'" plus
 * TS2554 "Expected 1 arguments, but got 2" on the call site.
 *
 * This post-process step inspects all styleFnFromProps entries for each fnKey,
 * collects the union of jsxProps referenced as primary + extra args, and adds
 * any missing identifiers as additional parameters at the end of the
 * function's parameter list.
 */
function unionStyleFnParamsFromStyleFnFromProps(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  const requiredParamsByFn = new Map<string, string[]>();
  for (const entry of styleFnFromProps) {
    if (entry.jsxProp === "__props" || entry.jsxProp === "__helper") {
      continue;
    }
    const requiredParams = requiredParamsByFn.get(entry.fnKey) ?? [];
    if (!requiredParams.includes(entry.jsxProp)) {
      requiredParams.push(entry.jsxProp);
    }
    if (entry.extraCallArgs) {
      for (const extra of entry.extraCallArgs) {
        if (extra.jsxProp === "__props" || extra.jsxProp === "__helper") {
          continue;
        }
        if (!requiredParams.includes(extra.jsxProp)) {
          requiredParams.push(extra.jsxProp);
        }
      }
    }
    requiredParamsByFn.set(entry.fnKey, requiredParams);
  }
  for (const [fnKey, requiredParams] of requiredParamsByFn) {
    if (requiredParams.length < 2) {
      continue;
    }
    const fnAst = styleFnDecls.get(fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const params = (fnAst as { params?: Array<{ name?: string }> }).params;
    if (!Array.isArray(params)) {
      continue;
    }
    const existingParamNames = new Set(
      params.map((p) => p?.name).filter((name): name is string => typeof name === "string"),
    );
    for (const required of requiredParams) {
      if (!existingParamNames.has(required)) {
        params.push(buildStyleFnParam(j, decl, required) as never);
        existingParamNames.add(required);
      }
    }
  }
}

function narrowGuardedStyleFnParamTypes(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  const entriesByFnKey = new Map<string, NonNullable<StyledDecl["styleFnFromProps"]>>();
  for (const entry of styleFnFromProps) {
    const entries = entriesByFnKey.get(entry.fnKey) ?? [];
    entries.push(entry);
    entriesByFnKey.set(entry.fnKey, entries);
  }

  for (const fnKey of styleFnDecls.keys()) {
    const fnAst = styleFnDecls.get(fnKey);
    if (!isArrowFunctionWithParams(fnAst)) {
      continue;
    }
    const firstParam = fnAst.params[0];
    if (!firstParam) {
      continue;
    }
    const entries = entriesByFnKey.get(fnKey);
    const paramName = readParamName(firstParam);
    const variantWhens = Object.entries(decl.variantStyleKeys ?? {})
      .filter(([, key]) => key === fnKey)
      .map(([when]) => when);
    const extraStylexCalls = collectExtraStylexPropsArgCalls(decl, fnKey);
    const variantCallIsGuarded =
      paramName !== null &&
      variantWhens.length > 0 &&
      variantWhens.every((when) => conditionWhenGuardsProp(when, paramName));
    const extraStylexCallIsGuarded =
      extraStylexCalls.length > 0 &&
      extraStylexCalls.every((call) => extraStylexCallGuardsPrimaryArg(call));
    const isGuarded = entries
      ? entries.every(styleFnEntryGuardsPrimaryArg)
      : variantCallIsGuarded || extraStylexCallIsGuarded;
    if (!isGuarded) {
      continue;
    }
    removeUndefinedFromParamType(j, firstParam);
  }
}

function styleFnEntryGuardsPrimaryArg(
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): boolean {
  if (entry.jsxProp === "__props" || entry.jsxProp === "__helper") {
    return false;
  }
  if (!styleFnEntryPrimaryArgIsProp(entry)) {
    return false;
  }
  if (entry.condition === "truthy") {
    return true;
  }
  if (entry.condition === "always") {
    return false;
  }
  return entry.conditionWhen ? conditionWhenGuardsProp(entry.conditionWhen, entry.jsxProp) : false;
}

function styleFnEntryPrimaryArgIsProp(
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): boolean {
  if (!entry.callArg) {
    return true;
  }
  const argName = readIdentifierLikeName(entry.callArg);
  return argName !== null && normalizePropName(argName) === normalizePropName(entry.jsxProp);
}

function conditionWhenGuardsProp(when: string, propName: string): boolean {
  const prop = escapeRegExp(normalizePropName(propName));
  const trimmed = when.trim();
  return (
    new RegExp(`^${prop}$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*\\|\\|\\s*false$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*!=\\s*null$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*!==?\\s*undefined$`).test(trimmed)
  );
}

function collectExtraStylexPropsArgCalls(
  decl: StyledDecl,
  fnKey: string,
): Array<{ when: string | undefined; condition: ExpressionKind | null; argName: string | null }> {
  const calls: Array<{
    when: string | undefined;
    condition: ExpressionKind | null;
    argName: string | null;
  }> = [];
  for (const entry of decl.extraStylexPropsArgs ?? []) {
    const call = readExtraStylexPropsArgCall(entry.expr);
    if (call?.fnKey === fnKey) {
      calls.push({ when: entry.when, condition: call.condition, argName: call.argName });
    }
  }
  return calls;
}

function extraStylexCallGuardsPrimaryArg(call: {
  when: string | undefined;
  condition: ExpressionKind | null;
  argName: string | null;
}): boolean {
  if (call.argName === null) {
    return false;
  }
  if (call.when !== undefined) {
    return conditionWhenGuardsProp(call.when, call.argName);
  }
  return call.condition !== null && conditionExprGuardsProp(call.condition, call.argName);
}

function readExtraStylexPropsArgCall(
  expr: ExpressionKind,
): { fnKey: string; argName: string | null; condition: ExpressionKind | null } | null {
  const direct = readStyleFnCall(expr);
  if (direct) {
    return { ...direct, condition: null };
  }
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ConditionalExpression"
  ) {
    return null;
  }
  const conditional = expr as { test?: ExpressionKind; consequent?: ExpressionKind };
  if (!conditional.test || !conditional.consequent) {
    return null;
  }
  const consequentCall = readStyleFnCall(conditional.consequent);
  return consequentCall ? { ...consequentCall, condition: conditional.test } : null;
}

function readStyleFnCall(expr: ExpressionKind): { fnKey: string; argName: string | null } | null {
  if (!expr || typeof expr !== "object" || (expr as { type?: string }).type !== "CallExpression") {
    return null;
  }
  const call = expr as { callee?: unknown; arguments?: ExpressionKind[] };
  const callee = call.callee;
  if (!callee || typeof callee !== "object") {
    return null;
  }
  const member = callee as { type?: string; property?: unknown; computed?: boolean };
  if (member.type !== "MemberExpression" || member.computed) {
    return null;
  }
  const property = member.property;
  const fnKey =
    property &&
    typeof property === "object" &&
    (property as { type?: string }).type === "Identifier"
      ? ((property as { name?: string }).name ?? null)
      : null;
  if (!fnKey) {
    return null;
  }
  return {
    fnKey,
    argName: call.arguments?.[0] ? readIdentifierLikeName(call.arguments[0]) : null,
  };
}

function conditionExprGuardsProp(condition: ExpressionKind, propName: string): boolean {
  if (!condition || typeof condition !== "object") {
    return false;
  }
  const normalizedProp = normalizePropName(propName);
  const conditionName = readIdentifierLikeName(condition);
  if (conditionName !== null) {
    return normalizePropName(conditionName) === normalizedProp;
  }
  const typed = condition as {
    type?: string;
    operator?: string;
    left?: ExpressionKind;
    right?: ExpressionKind;
  };
  if (typed.type === "LogicalExpression" && typed.operator === "||") {
    return (
      typed.left !== undefined &&
      typed.right !== undefined &&
      conditionExprGuardsProp(typed.left, propName) &&
      isFalseLiteral(typed.right)
    );
  }
  if (typed.type === "BinaryExpression" && typed.left && typed.right) {
    const leftName = readIdentifierLikeName(typed.left);
    const leftMatches = leftName !== null && normalizePropName(leftName) === normalizedProp;
    if (!leftMatches) {
      return false;
    }
    return (
      (typed.operator === "!=" && isNullLiteral(typed.right)) ||
      ((typed.operator === "!==" || typed.operator === "!=") && isUndefinedIdentifier(typed.right))
    );
  }
  return false;
}

function isFalseLiteral(node: ExpressionKind): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    (((node as { type?: string; value?: unknown }).type === "BooleanLiteral" &&
      (node as { value?: unknown }).value === false) ||
      ((node as { type?: string; value?: unknown }).type === "Literal" &&
        (node as { value?: unknown }).value === false))
  );
}

function isNullLiteral(node: ExpressionKind): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    ((node as { type?: string }).type === "NullLiteral" ||
      ((node as { type?: string; value?: unknown }).type === "Literal" &&
        (node as { value?: unknown }).value === null))
  );
}

function isUndefinedIdentifier(node: ExpressionKind): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Identifier" &&
    (node as { name?: string }).name === "undefined"
  );
}

function readIdentifierLikeName(node: ExpressionKind): string | null {
  let current: ExpressionKind | undefined = node;
  while (current && typeof current === "object") {
    const typed = current as {
      type?: string;
      name?: string;
      expression?: ExpressionKind;
      expressions?: ExpressionKind[];
    };
    if (typed.type === "Identifier") {
      return typed.name ?? null;
    }
    if (
      typed.type === "ParenthesizedExpression" ||
      typed.type === "TSAsExpression" ||
      typed.type === "TSNonNullExpression"
    ) {
      current = typed.expression;
      continue;
    }
    if (typed.type === "TemplateLiteral" && typed.expressions?.length === 1) {
      current = typed.expressions[0];
      continue;
    }
    break;
  }
  return null;
}

function normalizePropName(name: string): string {
  return name.startsWith("$") ? name.slice(1) : name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isArrowFunctionWithParams(node: unknown): node is {
  type: "ArrowFunctionExpression";
  params: unknown[];
} {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "ArrowFunctionExpression" &&
    Array.isArray((node as { params?: unknown }).params)
  );
}

function readParamName(param: unknown): string | null {
  return param && typeof param === "object" && (param as { type?: string }).type === "Identifier"
    ? ((param as { name?: string }).name ?? null)
    : null;
}

function removeUndefinedFromParamType(j: StyleFnParamBuilderJ, param: unknown): void {
  const typedParam = param as { typeAnnotation?: { typeAnnotation?: unknown } };
  const typeAnnotation = typedParam.typeAnnotation?.typeAnnotation;
  if (!typeAnnotation || typeof typeAnnotation !== "object") {
    return;
  }
  const typeNode = typeAnnotation as { type?: string; types?: unknown[] };
  if (typeNode.type !== "TSUnionType" || !typeNode.types) {
    return;
  }
  const narrowedTypes = typeNode.types.filter(
    (member) =>
      !(
        member &&
        typeof member === "object" &&
        (member as { type?: string }).type === "TSUndefinedKeyword"
      ),
  );
  if (narrowedTypes.length === typeNode.types.length || narrowedTypes.length === 0) {
    return;
  }
  typedParam.typeAnnotation =
    narrowedTypes.length === 1
      ? j.tsTypeAnnotation(narrowedTypes[0] as StyleFnUnionMemberTypeNode)
      : j.tsTypeAnnotation(j.tsUnionType(narrowedTypes as StyleFnUnionMemberTypeNode[]));
}

type StyleFnParamBuilderJ = {
  identifier: JSCodeshift["identifier"];
  tsBooleanKeyword: JSCodeshift["tsBooleanKeyword"];
  tsNumberKeyword: JSCodeshift["tsNumberKeyword"];
  tsStringKeyword: JSCodeshift["tsStringKeyword"];
  tsTypeAnnotation: JSCodeshift["tsTypeAnnotation"];
  tsUnionType: JSCodeshift["tsUnionType"];
};
type StyleFnParamTypeNode = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type StyleFnUnionMemberTypeNode = Parameters<JSCodeshift["tsUnionType"]>[0][number];

function buildStyleFnParam(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  propName: string,
): ReturnType<JSCodeshift["identifier"]> {
  const param = j.identifier(propName);
  const typeNode = typeNodeFromPropTypeText(j, decl.typeScriptPropTypes?.get(propName));
  if (typeNode) {
    param.typeAnnotation = j.tsTypeAnnotation(typeNode);
  }
  return param;
}

function typeNodeFromPropTypeText(
  j: StyleFnParamBuilderJ,
  typeText: string | undefined,
): StyleFnParamTypeNode | null {
  const normalized = typeText?.replace(/\|\s*undefined\b/g, "").trim();
  if (normalized === "boolean") {
    return j.tsBooleanKeyword() as StyleFnParamTypeNode;
  }
  if (normalized === "number") {
    return j.tsNumberKeyword() as StyleFnParamTypeNode;
  }
  if (normalized === "string") {
    return j.tsStringKeyword() as StyleFnParamTypeNode;
  }
  return null;
}

// --- Non-exported helpers ---

type ComplementaryCompoundPair = {
  parentWhen: string;
  positiveWhen: string;
  negativeWhen: string;
};

type TrailingBooleanConjunction = {
  parentWhen: string;
  propName: string;
  negated: boolean;
};

function factorCommonStylesFromComplementaryCompoundVariants(args: {
  decl: StyledDecl;
  stateResolvedStyleObjects: Map<string, unknown>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  variantSourceOrder: Record<string, number>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
}): void {
  const { decl, remainingBuckets, remainingStyleKeys, variantSourceOrder, styleFnFromProps } = args;
  const complementaryPairs = collectComplementaryCompoundPairs(remainingBuckets);

  for (const pair of complementaryPairs) {
    const positiveBucket = remainingBuckets.get(pair.positiveWhen);
    const negativeBucket = remainingBuckets.get(pair.negativeWhen);
    if (!positiveBucket || !negativeBucket) {
      continue;
    }
    const parentStyleKey = styleKeyWithSuffix(decl.styleKey, pair.parentWhen);
    const sourceOrders = getSafeFactoredSourceOrders({
      decl,
      pair,
      parentStyleKey,
      variantSourceOrder,
      remainingBuckets,
      remainingStyleKeys,
      styleFnFromProps,
      styleFnDecls: args.styleFnDecls,
      extraStyleObjects: args.extraStyleObjects,
      attrBuckets: args.attrBuckets,
      stateResolvedStyleObjects: args.stateResolvedStyleObjects,
    });
    if (!sourceOrders) {
      continue;
    }

    const parentBucket = remainingBuckets.get(pair.parentWhen) ?? {};
    const commonStyles = extractMovableCommonStyles(positiveBucket, negativeBucket, parentBucket);
    if (Object.keys(commonStyles).length === 0) {
      continue;
    }

    mergeStyleObjects(parentBucket, commonStyles);
    remainingBuckets.set(pair.parentWhen, parentBucket);
    remainingStyleKeys[pair.parentWhen] ??= parentStyleKey;

    removeStyleProps(positiveBucket, commonStyles);
    removeStyleProps(negativeBucket, commonStyles);
    removeEmptyVariantBucket(pair.positiveWhen, remainingBuckets, remainingStyleKeys);
    removeEmptyVariantBucket(pair.negativeWhen, remainingBuckets, remainingStyleKeys);

    variantSourceOrder[pair.parentWhen] = Math.min(...sourceOrders) - 0.1;
  }
}

function getSafeFactoredSourceOrders(args: {
  decl: StyledDecl;
  pair: ComplementaryCompoundPair;
  parentStyleKey: string;
  variantSourceOrder: Record<string, number>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
  stateResolvedStyleObjects: Map<string, unknown>;
}): [number, number] | null {
  const { decl, pair, parentStyleKey, variantSourceOrder, remainingBuckets, styleFnFromProps } =
    args;
  if (remainingBuckets.has(pair.parentWhen)) {
    return null;
  }
  if (isReservedFactoredStyleKey(args)) {
    return null;
  }
  if (hasInverseVariantBucket(pair.parentWhen, remainingBuckets)) {
    return null;
  }
  if (styleFnFromProps.some((entry) => entry.conditionWhen === pair.parentWhen)) {
    return null;
  }
  if (styleFnFromProps.some((entry) => entry.jsxProp === pair.parentWhen)) {
    return null;
  }
  if (hasPotentialConsolidatedStyleFnKey(parentStyleKey, decl, styleFnFromProps)) {
    return null;
  }

  const positiveOrder = variantSourceOrder[pair.positiveWhen];
  const negativeOrder = variantSourceOrder[pair.negativeWhen];
  if (typeof positiveOrder !== "number" || typeof negativeOrder !== "number") {
    return null;
  }

  const startOrder = Math.min(positiveOrder, negativeOrder);
  for (const [when, order] of Object.entries(variantSourceOrder)) {
    if (when === pair.positiveWhen || when === pair.negativeWhen) {
      continue;
    }
    if (order > startOrder && when !== pair.parentWhen) {
      return null;
    }
  }
  for (const entry of styleFnFromProps) {
    const order = entry.sourceOrder;
    if (typeof order === "number" && order > startOrder) {
      return null;
    }
  }

  return [positiveOrder, negativeOrder];
}

function isReservedFactoredStyleKey(args: {
  decl: StyledDecl;
  pair: ComplementaryCompoundPair;
  parentStyleKey: string;
  remainingStyleKeys: Record<string, string>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
  stateResolvedStyleObjects: Map<string, unknown>;
}): boolean {
  const {
    decl,
    pair,
    parentStyleKey,
    remainingStyleKeys,
    styleFnDecls,
    extraStyleObjects,
    attrBuckets,
    stateResolvedStyleObjects,
  } = args;

  for (const [when, styleKey] of Object.entries(remainingStyleKeys)) {
    if (when !== pair.parentWhen && styleKey === parentStyleKey) {
      return true;
    }
  }
  for (const staticVariant of decl.staticBooleanVariants ?? []) {
    if (staticVariant.styleKey === parentStyleKey) {
      return true;
    }
  }
  for (const combinedStyle of decl.callSiteCombinedStyles ?? []) {
    if (combinedStyle.styleKey === parentStyleKey) {
      return true;
    }
  }

  return (
    styleFnDecls.has(parentStyleKey) ||
    extraStyleObjects.has(parentStyleKey) ||
    attrBuckets.has(parentStyleKey) ||
    stateResolvedStyleObjects.has(parentStyleKey)
  );
}

function hasPotentialConsolidatedStyleFnKey(
  parentStyleKey: string,
  decl: StyledDecl,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): boolean {
  if (!decl.shouldForwardProp) {
    return false;
  }

  const countsByProp = new Map<string, number>();
  for (const entry of styleFnFromProps) {
    if (entry.jsxProp === "__props" || entry.conditionWhen || !entry.jsxProp.startsWith("$")) {
      continue;
    }
    countsByProp.set(entry.jsxProp, (countsByProp.get(entry.jsxProp) ?? 0) + 1);
  }

  for (const [propName, count] of countsByProp) {
    if (count < 2) {
      continue;
    }
    const suffix = propName.slice(1).charAt(0).toUpperCase() + propName.slice(2);
    if (`${decl.styleKey}${suffix}` === parentStyleKey) {
      return true;
    }
  }
  return false;
}

function hasInverseVariantBucket(
  parentWhen: string,
  remainingBuckets: Map<string, Record<string, unknown>>,
): boolean {
  for (const when of remainingBuckets.keys()) {
    if (conditionsAreInverses(parentWhen, when)) {
      return true;
    }
  }
  return false;
}

function conditionsAreInverses(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  const unwrappedLeftNegation = unwrapNegatedCondition(normalizedLeft);
  const unwrappedRightNegation = unwrapNegatedCondition(normalizedRight);
  if (unwrappedLeftNegation === normalizedRight || unwrappedRightNegation === normalizedLeft) {
    return true;
  }

  const leftComparison = parseSimpleComparison(normalizedLeft);
  const rightComparison = parseSimpleComparison(normalizedRight);
  return (
    !!leftComparison &&
    !!rightComparison &&
    leftComparison.left === rightComparison.left &&
    leftComparison.right === rightComparison.right &&
    leftComparison.operator !== rightComparison.operator
  );
}

function unwrapNegatedCondition(condition: string): string | null {
  if (condition.startsWith("!(") && condition.endsWith(")")) {
    return condition.slice(2, -1).trim();
  }
  if (condition.startsWith("!")) {
    return condition.slice(1).trim();
  }
  return null;
}

function parseSimpleComparison(
  condition: string,
): { left: string; operator: "===" | "!=="; right: string } | null {
  const match = condition.match(/^(.+?)\s*(===|!==)\s*(.+)$/);
  if (!match) {
    return null;
  }
  const [, left, operator, right] = match;
  if (!left || !right || (operator !== "===" && operator !== "!==")) {
    return null;
  }
  return { left: left.trim(), operator, right: right.trim() };
}

function collectComplementaryCompoundPairs(
  remainingBuckets: Map<string, Record<string, unknown>>,
): ComplementaryCompoundPair[] {
  const candidates = new Map<
    string,
    {
      parentWhen: string;
      positiveWhen?: string;
      negativeWhen?: string;
    }
  >();

  for (const when of remainingBuckets.keys()) {
    const parsed = parseTrailingBooleanConjunction(when);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.parentWhen}\0${parsed.propName}`;
    const candidate = candidates.get(key) ?? { parentWhen: parsed.parentWhen };
    if (parsed.negated) {
      candidate.negativeWhen = when;
    } else {
      candidate.positiveWhen = when;
    }
    candidates.set(key, candidate);
  }

  return [...candidates.values()].flatMap((candidate) =>
    candidate.positiveWhen && candidate.negativeWhen
      ? [
          {
            parentWhen: candidate.parentWhen,
            positiveWhen: candidate.positiveWhen,
            negativeWhen: candidate.negativeWhen,
          },
        ]
      : [],
  );
}

function parseTrailingBooleanConjunction(when: string): TrailingBooleanConjunction | null {
  if (when.includes("||") || when.includes("(") || when.includes(")")) {
    return null;
  }

  const parts = when.split(/\s+&&\s+/).map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const leaf = parts[parts.length - 1];
  if (!leaf) {
    return null;
  }

  const match = leaf.match(/^(!)?([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (!match) {
    return null;
  }
  const [, negation, propName] = match;
  if (!propName) {
    return null;
  }

  return {
    parentWhen: parts.slice(0, -1).join(" && "),
    propName,
    negated: negation === "!",
  };
}

function extractMovableCommonStyles(
  positiveBucket: Record<string, unknown>,
  negativeBucket: Record<string, unknown>,
  parentBucket: Record<string, unknown>,
): Record<string, unknown> {
  const commonStyles: Record<string, unknown> = {};
  for (const [prop, positiveValue] of Object.entries(positiveBucket)) {
    if (!(prop in negativeBucket)) {
      continue;
    }

    const negativeValue = negativeBucket[prop];
    if (!styleValuesAreEqual(positiveValue, negativeValue)) {
      continue;
    }

    const parentValue = parentBucket[prop];
    if (parentValue !== undefined && !styleValuesAreEqual(parentValue, positiveValue)) {
      continue;
    }

    commonStyles[prop] = positiveValue;
  }
  return commonStyles;
}

function styleValuesAreEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  return astShapeKey(a) === astShapeKey(b);
}

function removeStyleProps(
  bucket: Record<string, unknown>,
  stylesToRemove: Record<string, unknown>,
): void {
  for (const prop of Object.keys(stylesToRemove)) {
    delete bucket[prop];
  }
}

function removeEmptyVariantBucket(
  when: string,
  remainingBuckets: Map<string, Record<string, unknown>>,
  remainingStyleKeys: Record<string, string>,
): void {
  const bucket = remainingBuckets.get(when);
  if (bucket && Object.keys(bucket).length === 0) {
    remainingBuckets.delete(when);
    delete remainingStyleKeys[when];
  }
}

function moveUnsafeRawCssVarPropsToInlineStyles(args: {
  styleObj: Record<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  unsafeProps: ReadonlySet<string>;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const { styleObj, inlineStyleProps, staticInlineStyleProps, unsafeProps, j } = args;
  for (const [prop, value] of Object.entries(styleObj)) {
    if (prop.startsWith("__") || prop.startsWith("--")) {
      continue;
    }
    if (unsafeProps.has(prop)) {
      continue;
    }
    if (typeof value !== "string" || findCssVarCallsInString(value).length === 0) {
      continue;
    }

    delete styleObj[prop];
    const expr = j.stringLiteral(value);
    inlineStyleProps.push({ prop, expr });
    staticInlineStyleProps.push({ prop, expr });
  }
}

function moveCustomPropertyOnlyBaseToInlineStyles(args: {
  styleObj: Record<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  unsafeProps: ReadonlySet<string>;
  hasOpaqueExtraStylexPropsArgs: boolean;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const {
    styleObj,
    inlineStyleProps,
    staticInlineStyleProps,
    unsafeProps,
    hasOpaqueExtraStylexPropsArgs,
    j,
  } = args;
  const entries = Object.entries(styleObj).filter(([prop]) => !prop.startsWith("__"));
  if (
    entries.length === 0 ||
    hasOpaqueExtraStylexPropsArgs ||
    entries.some(([prop]) => !prop.startsWith("--")) ||
    entries.some(([prop]) => unsafeProps.has(prop)) ||
    entries.some(([, value]) => isConditionalCustomPropertyValue(value))
  ) {
    return;
  }

  for (const [prop, value] of entries) {
    delete styleObj[prop];
    const expr = isAstNode(value)
      ? (cloneAstNode(value) as ExpressionKind)
      : (literalToAst(j, value) as ExpressionKind);
    inlineStyleProps.push({ prop, expr });
    staticInlineStyleProps.push({ prop, expr });
  }

  for (const prop of Object.keys(styleObj)) {
    if (prop.startsWith("__")) {
      delete styleObj[prop];
    }
  }
}

function isConditionalCustomPropertyValue(value: unknown): boolean {
  return !!value && typeof value === "object" && !isAstNode(value);
}

function moveUnsafeRawCssVarStyleFnsToInlineStyles(args: {
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  inlineStyleProps: NonNullable<StyledDecl["inlineStyleProps"]>;
  staticInlineStyleProps: NonNullable<StyledDecl["staticInlineStyleProps"]>;
  baseRawCssVarProps: ReadonlySet<string>;
  rawCss: string | undefined;
  unsafeProps: ReadonlySet<string>;
  j: Parameters<typeof literalToAst>[0];
}): void {
  const {
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    staticInlineStyleProps,
    baseRawCssVarProps,
    rawCss,
    unsafeProps,
    j,
  } = args;
  const fnKeyUseCounts = new Map<string, number>();
  for (const entry of styleFnFromProps) {
    fnKeyUseCounts.set(entry.fnKey, (fnKeyUseCounts.get(entry.fnKey) ?? 0) + 1);
  }
  const staticInlineProps = new Set(staticInlineStyleProps.map((entry) => entry.prop));
  const styleFnPropUseCounts = collectStyleFnPropUseCounts(styleFnDecls);
  const movedEntries: Array<{
    index: number;
    sourceOrder: number;
    inlineStyleProp: NonNullable<StyledDecl["inlineStyleProps"]>[number];
    fnKey: string;
  }> = [];

  for (let i = styleFnFromProps.length - 1; i >= 0; i--) {
    const entry = styleFnFromProps[i];
    if (
      !entry ||
      entry.conditionWhen ||
      entry.extraCallArgs?.length ||
      fnKeyUseCounts.get(entry.fnKey) !== 1
    ) {
      continue;
    }
    const fnAst = styleFnDecls.get(entry.fnKey);
    const extracted = extractSingleRawCssVarStyleFnProperty(fnAst);
    const dynamicDeclarationIsLast =
      extracted && rawCssVarDeclarationOrderHasDynamicLast(rawCss, extracted.prop);
    if (
      !extracted ||
      unsafeProps.has(extracted.prop) ||
      (styleFnPropUseCounts.get(extracted.prop) ?? 0) > 1 ||
      (rawCss !== undefined && !dynamicDeclarationIsLast) ||
      (baseRawCssVarProps.has(extracted.prop) && !dynamicDeclarationIsLast) ||
      (staticInlineProps.has(extracted.prop) && !dynamicDeclarationIsLast) ||
      expressionContainsStyleConditionKey(extracted.value)
    ) {
      continue;
    }

    const expr = rewriteStyleFnValueForWrapperScope({
      j,
      value: extracted.value,
      fnParamName: extracted.paramName,
      entry,
    });
    if (!expr) {
      continue;
    }

    movedEntries.push({
      index: i,
      sourceOrder: entry.sourceOrder ?? i,
      inlineStyleProp: {
        prop: extracted.prop,
        expr,
        ...(entry.jsxProp && entry.jsxProp !== "__props" ? { jsxProp: entry.jsxProp } : {}),
      },
      fnKey: entry.fnKey,
    });
  }

  movedEntries.sort((a, b) => a.sourceOrder - b.sourceOrder);
  for (const moved of movedEntries) {
    inlineStyleProps.push(moved.inlineStyleProp);
  }
  for (const moved of [...movedEntries].sort((a, b) => b.index - a.index)) {
    styleFnDecls.delete(moved.fnKey);
    styleFnFromProps.splice(moved.index, 1);
  }
}

function collectStyleFnPropUseCounts(styleFnDecls: Map<string, unknown>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const fnAst of styleFnDecls.values()) {
    const props = new Set<string>();
    collectObjectExpressionPropertyNames(fnAst, props);
    for (const prop of props) {
      counts.set(prop, (counts.get(prop) ?? 0) + 1);
    }
  }
  return counts;
}

function collectRawCssVarStyleObjectProps(styleObj: Record<string, unknown>): Set<string> {
  const props = new Set<string>();
  for (const [prop, value] of Object.entries(styleObj)) {
    if (
      !prop.startsWith("__") &&
      !prop.startsWith("--") &&
      typeof value === "string" &&
      findCssVarCallsInString(value).length > 0
    ) {
      props.add(prop);
    }
  }
  return props;
}

function rawCssVarDeclarationOrderHasDynamicLast(
  rawCss: string | undefined,
  stylexProp: string,
): boolean {
  if (!rawCss) {
    return false;
  }
  const cssProp = stylexProp.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  const declarationPattern = /([-\w]+)\s*:\s*([^;{}]+);/g;
  let last: "dynamic" | "static" | null = null;
  let match: RegExpExecArray | null;
  while ((match = declarationPattern.exec(rawCss))) {
    if (match[1] !== cssProp) {
      continue;
    }
    const value = match[2] ?? "";
    if (value.includes("__SC_EXPR_")) {
      last = "dynamic";
    } else {
      last = "static";
    }
  }
  return last === "dynamic";
}

function extractSingleRawCssVarStyleFnProperty(fnAst: unknown): {
  prop: string;
  value: ExpressionKind;
  paramName: string | null;
} | null {
  if (!fnAst || typeof fnAst !== "object" || !isAstNode(fnAst)) {
    return null;
  }
  const fn = fnAst as {
    params?: unknown[];
  };
  if (!Array.isArray(fn.params) || fn.params.length > 1) {
    return null;
  }
  const param = fn.params[0] as { type?: string; name?: string } | undefined;
  const paramName = param?.type === "Identifier" ? (param.name ?? null) : null;
  const body = getFunctionBodyExpr(fnAst as Parameters<typeof getFunctionBodyExpr>[0]);
  if (!body || (body as { type?: string }).type !== "ObjectExpression") {
    return null;
  }
  const properties = (body as { properties?: unknown[] }).properties ?? [];
  if (properties.some((property) => (property as { type?: string }).type === "SpreadElement")) {
    return null;
  }
  if (properties.length !== 1) {
    return null;
  }

  const property = properties[0] as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string; value?: unknown };
    value?: unknown;
  };
  if (
    property.type !== "Property" &&
    property.type !== "ObjectProperty" &&
    property.type !== "ObjectMethod"
  ) {
    return null;
  }
  if (property.computed || !property.key || !property.value) {
    return null;
  }
  const prop =
    property.key.type === "Identifier"
      ? property.key.name
      : (property.key.type === "StringLiteral" || property.key.type === "Literal") &&
          typeof property.key.value === "string"
        ? property.key.value
        : null;
  if (!prop || !expressionContainsRawCssVar(property.value)) {
    return null;
  }
  return { prop, value: property.value as ExpressionKind, paramName };
}

function expressionContainsRawCssVar(expr: unknown): boolean {
  let found = false;
  walkAst(expr, (node) => {
    if (found) {
      return;
    }
    const n = node as { type?: string; value?: unknown; extra?: { raw?: string } };
    if (
      (n.type === "StringLiteral" || n.type === "Literal") &&
      typeof n.value === "string" &&
      stringContainsRawCssVarRef(n.value)
    ) {
      found = true;
      return;
    }
    if (
      n.type === "TemplateElement" &&
      typeof n.value === "object" &&
      n.value &&
      "raw" in n.value &&
      typeof n.value.raw === "string" &&
      stringContainsRawCssVarRef(n.value.raw)
    ) {
      found = true;
      return;
    }
    if (typeof n.extra?.raw === "string" && stringContainsRawCssVarRef(n.extra.raw)) {
      found = true;
    }
  });
  return found;
}

function expressionContainsStyleConditionKey(expr: unknown): boolean {
  let found = false;
  walkAst(expr, (node) => {
    if (found) {
      return;
    }
    const n = node as { type?: string; properties?: unknown[] };
    if (n.type !== "ObjectExpression" || !Array.isArray(n.properties)) {
      return;
    }
    for (const property of n.properties) {
      const p = property as {
        type?: string;
        computed?: boolean;
        key?: { type?: string; name?: string; value?: unknown };
      };
      if (p.type !== "Property" && p.type !== "ObjectProperty") {
        continue;
      }
      if (p.computed) {
        found = true;
        return;
      }
      const key =
        p.key?.type === "Identifier"
          ? p.key.name
          : (p.key?.type === "StringLiteral" || p.key?.type === "Literal") &&
              typeof p.key.value === "string"
            ? p.key.value
            : null;
      if (key && isStyleConditionKey(key)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

function stringContainsRawCssVarRef(value: string): boolean {
  return findCssVarCallsInString(value).length > 0 || value.includes("var(--");
}

function rewriteStyleFnValueForWrapperScope(args: {
  j: Parameters<typeof literalToAst>[0];
  value: ExpressionKind;
  fnParamName: string | null;
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number];
}): ExpressionKind | null {
  const { j, value, fnParamName, entry } = args;
  let expr = cloneAstNode(value);
  if (fnParamName) {
    const replacement = styleFnEntryArgumentExpression(j, entry);
    if (!replacement) {
      return null;
    }
    expr = mapAst(expr, (node) => {
      if ((node as { type?: string; name?: string }).type !== "Identifier") {
        return undefined;
      }
      if ((node as { name?: string }).name !== fnParamName) {
        return undefined;
      }
      return cloneAstNode(replacement);
    }) as ExpressionKind;
  }
  if (entry.condition === "truthy") {
    const condition = styleFnEntryArgumentExpression(j, entry);
    if (!condition) {
      return null;
    }
    expr = j.conditionalExpression(
      cloneAstNode(condition) as Parameters<typeof j.conditionalExpression>[0],
      expr,
      j.identifier("undefined"),
    );
  }
  return expr;
}

function styleFnEntryArgumentExpression(
  j: Parameters<typeof literalToAst>[0],
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): ExpressionKind | null {
  if (entry.callArg) {
    return cloneAstNode(entry.callArg);
  }
  if (entry.jsxProp === "__props") {
    return j.identifier("props");
  }
  if (!entry.jsxProp) {
    return null;
  }
  if (/^[A-Za-z_$][\w$]*$/.test(entry.jsxProp)) {
    return j.memberExpression(j.identifier("props"), j.identifier(entry.jsxProp));
  }
  return j.memberExpression(j.identifier("props"), j.stringLiteral(entry.jsxProp), true);
}

function collectStyleOverrideProps(args: {
  afterBaseStyleKeys: readonly string[];
  cssHelperPropValues: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  resolvedStyleObjects: Map<string, unknown>;
  variantBuckets: Map<string, Record<string, unknown>>;
  styleFnDecls: Map<string, unknown>;
}): Set<string> {
  const {
    afterBaseStyleKeys,
    cssHelperPropValues,
    extraStyleObjects,
    resolvedStyleObjects,
    variantBuckets,
    styleFnDecls,
  } = args;
  const props = new Set<string>();
  for (const prop of cssHelperPropValues.keys()) {
    props.add(prop);
  }
  for (const styleKey of afterBaseStyleKeys) {
    const styleObject = resolvedStyleObjects.get(styleKey);
    if (isStyleObjectForCssVarDrop(styleObject)) {
      addBucketProps(styleObject, props);
    }
  }
  for (const bucket of extraStyleObjects.values()) {
    addBucketProps(bucket, props);
  }
  for (const bucket of variantBuckets.values()) {
    addBucketProps(bucket, props);
  }
  for (const fnAst of styleFnDecls.values()) {
    collectObjectExpressionPropertyNames(fnAst, props);
  }
  return props;
}

function addBucketProps(bucket: Record<string, unknown>, props: Set<string>): void {
  for (const prop of Object.keys(bucket)) {
    if (!prop.startsWith("__")) {
      props.add(prop);
    }
  }
}

function registerLocalStylexVarFallbacks(
  state: DeclProcessingState["state"],
  decl: StyledDecl,
  styleObj: Record<string, unknown>,
): void {
  for (const [prop, value] of Object.entries(styleObj)) {
    if (prop.startsWith("--") || typeof value !== "string") {
      continue;
    }
    for (const call of findCssVarCallsInString(value)) {
      if (!call.fallback || !hasCustomPropertyDefinition(decl, call.name)) {
        continue;
      }
      state.getOrCreateLocalStylexVar(call.name, call.fallback);
    }
  }
}

function collectObjectExpressionPropertyNames(node: unknown, props: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectObjectExpressionPropertyNames(child, props);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.type === "ObjectExpression" && Array.isArray(record.properties)) {
    for (const property of record.properties) {
      const propName = readObjectPropertyName(property);
      if (propName && !propName.startsWith("__")) {
        props.add(propName);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    collectObjectExpressionPropertyNames(child, props);
  }
}

function readObjectPropertyName(property: unknown): string | null {
  if (!property || typeof property !== "object") {
    return null;
  }
  const record = property as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string; value?: unknown };
  };
  if (record.type !== "Property" || record.computed) {
    return null;
  }
  if (record.key?.type === "Identifier") {
    return record.key.name ?? null;
  }
  if (
    (record.key?.type === "Literal" || record.key?.type === "StringLiteral") &&
    typeof record.key.value === "string"
  ) {
    return record.key.value;
  }
  return null;
}

function findLocalCustomPropertyFallbackFromRules(
  cssName: string,
  decl: StyledDecl,
): string | null {
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
  return null;
}

function hasCustomPropertyDefinition(decl: StyledDecl, cssName: string): boolean {
  return decl.rules.some((rule) =>
    rule.declarations.some((candidate) => candidate.property === cssName),
  );
}

function dropCssVariableDefinitionsFromBucket(bucket: Record<string, unknown>, name: string): void {
  delete bucket[name];

  const computedKeys = bucket.__computedKeys;
  if (Array.isArray(computedKeys)) {
    const retained = computedKeys.filter((entry) => {
      const cssVariableName = readComputedEntryCssVariableName(entry);
      return cssVariableName !== name;
    });

    if (retained.length === 0) {
      delete bucket.__computedKeys;
    } else if (retained.length !== computedKeys.length) {
      bucket.__computedKeys = retained;
    }
  }

  for (const [key, value] of Object.entries(bucket)) {
    if (key.startsWith("__")) {
      continue;
    }
    if (!isStyleObjectForCssVarDrop(value)) {
      continue;
    }
    dropCssVariableDefinitionsFromBucket(value, name);
  }
}

function readComputedEntryCssVariableName(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  if (!("originalCssVariableName" in entry)) {
    return null;
  }

  const cssVariableName = entry.originalCssVariableName;
  return typeof cssVariableName === "string" ? cssVariableName : null;
}

function isStyleObjectForCssVarDrop(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value));
}

/**
 * Inserts styleFnDecls entries into resolvedStyleObjects right after the last
 * entry belonging to the current component. This ensures dynamic style functions
 * appear adjacent to their static counterparts in stylex.create() output.
 */
function insertStyleFnDeclsAfterComponent(
  resolvedStyleObjects: Map<string, unknown>,
  styleFnDecls: Map<string, unknown>,
  component: {
    styleKey: string;
    extraStyleObjects: Map<string, Record<string, unknown>>;
    remainingStyleKeys: Record<string, string>;
    attrBuckets: Map<string, Record<string, unknown>>;
    enumVariant?: { baseKey: string; cases: Array<{ styleKey: string }> } | null;
  },
): void {
  if (styleFnDecls.size === 0) {
    return;
  }

  // Collect all keys this component added to resolvedStyleObjects
  const componentKeys = new Set<string>();
  componentKeys.add(component.styleKey);
  for (const k of component.extraStyleObjects.keys()) {
    componentKeys.add(k);
  }
  for (const k of Object.values(component.remainingStyleKeys)) {
    componentKeys.add(k);
  }
  for (const k of component.attrBuckets.keys()) {
    componentKeys.add(k);
  }
  if (component.enumVariant) {
    componentKeys.add(component.enumVariant.baseKey);
    for (const c of component.enumVariant.cases) {
      componentKeys.add(c.styleKey);
    }
  }

  // Also include keys from styleFnDecls that are already in resolvedStyleObjects
  // (e.g. merged variant buckets that share a key with the styleFn).
  for (const k of styleFnDecls.keys()) {
    if (resolvedStyleObjects.has(k)) {
      componentKeys.add(k);
    }
  }

  // Find the last component key in the Map's insertion order
  let lastComponentKey: string | null = null;
  for (const k of resolvedStyleObjects.keys()) {
    if (componentKeys.has(k)) {
      lastComponentKey = k;
    }
  }

  if (lastComponentKey === null) {
    // Fallback: append at end
    for (const [k, v] of styleFnDecls.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    return;
  }

  // Rebuild the Map, inserting styleFnDecls right after lastComponentKey.
  // When a styleFnDecl key matches an existing entry (e.g. a merged variant bucket
  // or a fully-dynamic base), replace the value in-place. New styleFnDecl keys
  // are inserted after lastComponentKey.
  const emittedFnKeys = new Set<string>();
  const entries = [...resolvedStyleObjects.entries()];
  resolvedStyleObjects.clear();
  for (const [k, v] of entries) {
    if (styleFnDecls.has(k)) {
      resolvedStyleObjects.set(k, styleFnDecls.get(k));
      emittedFnKeys.add(k);
    } else {
      resolvedStyleObjects.set(k, v);
    }
    if (k === lastComponentKey) {
      for (const [fk, fv] of styleFnDecls.entries()) {
        if (!emittedFnKeys.has(fk)) {
          resolvedStyleObjects.set(fk, fv);
          emittedFnKeys.add(fk);
        }
      }
    }
  }
}

/**
 * Merges static base properties into a single unconditional style function.
 *
 * When a styled component has both static CSS properties and a single
 * unconditional dynamic style function, the static properties are folded
 * into the function's return object so that the emitted code uses a single
 * `styles.key(arg)` call instead of separate `styles.key, styles.keyDynamic(arg)`.
 *
 * Preconditions:
 * - Exactly one unconditional styleFn entry (no conditionWhen)
 * - Base styleObj has at least one property
 * - No extra style objects (css`` helpers interleave with base)
 * - No enum variants
 * - The component is not extended by other styled components
 */
function mergeBaseIntoSingleStyleFn(args: {
  j: Parameters<typeof literalToAst>[0];
  decl: StyledDecl;
  styleObj: Record<string, unknown>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  styledDecls: StyledDecl[];
}): void {
  const { j, decl, styleObj, styleFnFromProps, styleFnDecls, extraStyleObjects, styledDecls } =
    args;

  // Must have base properties to merge
  if (Object.keys(styleObj).length === 0) {
    return;
  }

  // Must have styleFn entries
  if (styleFnFromProps.length === 0) {
    return;
  }

  // Must have no extra style objects (css`` helpers interleave with base)
  if (extraStyleObjects.size > 0) {
    return;
  }

  // Must have no enum variant
  if (decl.enumVariant) {
    return;
  }

  // Must not be extended by other styled components
  for (const other of styledDecls) {
    if (other !== decl && other.extendsStyleKey === decl.styleKey) {
      return;
    }
  }

  // Base properties can only be folded into a dynamic function when that function
  // is the sole dynamic entry. Otherwise the merged base may move after another
  // dynamic override in `stylex.props()` and change CSS source-order semantics.
  if (styleFnFromProps.length !== 1) {
    return;
  }

  // Find unconditional styleFn entries with "always" condition.
  // Entries with "truthy" condition are guarded (e.g. `prop ? styles.fn(prop) : undefined`),
  // so the base static properties must remain separate as defaults when the guard is false.
  const unconditionalEntries = styleFnFromProps.filter(
    (p) => !p.conditionWhen && p.condition === "always",
  );
  if (unconditionalEntries.length !== 1) {
    return;
  }

  const entry = unconditionalEntries[0]!;
  const fnKey = entry.fnKey;
  const fnAst = styleFnDecls.get(fnKey);
  if (!fnAst || typeof fnAst !== "object") {
    return;
  }

  // Extract the function body (ObjectExpression)
  const body = getFunctionBodyExpr(fnAst as { body?: unknown });
  if (!body || (body as { type?: string }).type !== "ObjectExpression") {
    return;
  }
  const bodyObj = body as { properties?: unknown[] };
  if (!Array.isArray(bodyObj.properties)) {
    return;
  }

  // Collect existing property keys in the function body
  const existingKeys = new Set<string>();
  for (const prop of bodyObj.properties) {
    const key = (prop as { key?: { name?: string; value?: string } }).key;
    if (key) {
      existingKeys.add(key.name ?? key.value ?? "");
    }
  }

  const staticKeys = Object.keys(styleObj).filter((k) => !k.startsWith("__"));
  const overlappingKeys = new Set(staticKeys.filter((k) => existingKeys.has(k)));

  // Handle overlapping keys: scalar overlaps are dropped (the function body's
  // value takes precedence since condition === "always"), nested objects
  // (pseudo-elements, media queries) are deep-merged.
  for (const key of overlappingKeys) {
    const staticValue = styleObj[key];
    if (
      !staticValue ||
      typeof staticValue !== "object" ||
      isAstNode(staticValue) ||
      Array.isArray(staticValue)
    ) {
      continue;
    }
    // Nested object overlap — validate and deep-merge into function body
    const fnProp = findBodyProperty(bodyObj.properties as ASTProperty[], key);
    if (!fnProp?.value || (fnProp.value as { type?: string }).type !== "ObjectExpression") {
      return;
    }
    const fnNestedObj = fnProp.value as { properties?: ASTProperty[] };
    if (!Array.isArray(fnNestedObj.properties)) {
      return;
    }
    const fnNestedKeys = new Set(
      fnNestedObj.properties.map((p) => p.key?.name ?? p.key?.value ?? ""),
    );
    for (const nestedKey of Object.keys(staticValue as Record<string, unknown>)) {
      if (fnNestedKeys.has(nestedKey)) {
        return;
      }
    }
    (fnNestedObj.properties as unknown[]).unshift(
      ...styleObjToAstProperties(j, staticValue as Record<string, unknown>),
    );
  }

  // Prepend non-overlapping base static properties to the function body
  bodyObj.properties.unshift(...styleObjToAstProperties(j, styleObj, overlappingKeys));

  // Rename the function key from fnKey to decl.styleKey
  if (fnKey !== decl.styleKey) {
    styleFnDecls.delete(fnKey);
    styleFnDecls.set(decl.styleKey, fnAst);
    entry.fnKey = decl.styleKey;
  }
  if (entry.jsxProp !== "__props" && !entry.propsObjectKey) {
    entry.forceScalarArgs = true;
  }

  // The merged function now contains base properties that must come before
  // any variant overrides in the sx array.  Set sourceOrder to -1 so it
  // sorts before all variant entries (which start at 0).
  //
  // Safety: this won't jump ahead of other ordered entries incorrectly
  // because the guards above ensure no extraStyleObjects (css`` helpers)
  // exist, and only one unconditional styleFn entry is present.
  entry.sourceOrder = -1;

  // Clear the base styleObj so it becomes empty in resolvedStyleObjects
  for (const key of Object.keys(styleObj)) {
    delete styleObj[key];
  }
}

/**
 * Converts single-positional-param style functions to use a named `props`
 * object parameter. Skips functions that already use a `props` parameter
 * (e.g. consolidated multi-param functions).
 *
 * Before: `(color: string) => ({ color })`
 * After:  `(props: { color: string }) => ({ color: props.color })`
 */
function convertStyleFnsToPropsPattern(
  j: Parameters<typeof literalToAst>[0],
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
  baseStyleKey: string,
): void {
  const managedFnKeys = new Set(styleFnFromProps.map((p) => p.fnKey));

  for (const [fnKey, fnAst] of styleFnDecls.entries()) {
    if (fnKey !== baseStyleKey) {
      continue;
    }
    if (!managedFnKeys.has(fnKey)) {
      continue;
    }
    const managedEntries = styleFnFromProps.filter((entry) => entry.fnKey === fnKey);
    if (managedEntries.some((entry) => entry.forceScalarArgs)) {
      continue;
    }
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const fn = fnAst as { params?: unknown[]; body?: unknown };
    if (!Array.isArray(fn.params) || fn.params.length !== 1) {
      continue;
    }

    const param = fn.params[0] as { type?: string; name?: string; typeAnnotation?: unknown };
    if (param.type !== "Identifier" || !param.name || param.name === "props") {
      continue;
    }

    const paramName = param.name;
    const paramTypeAnnotation = param.typeAnnotation;
    const body = getFunctionBodyExpr(fn);
    if (!body || (body as { type?: string }).type !== "ObjectExpression") {
      continue;
    }
    const bodyObj = body as { properties?: ASTProperty[] };

    if (
      Array.isArray(bodyObj.properties) &&
      bodyObj.properties.some((p) => (p.key?.name ?? p.key?.value) === paramName)
    ) {
      continue;
    }

    replaceIdentifierInAst(j, body, paramName);

    const propsParam = j.identifier("props");
    if (paramTypeAnnotation) {
      const innerType = (paramTypeAnnotation as { typeAnnotation?: unknown }).typeAnnotation;
      if (innerType) {
        const propSignature = j.tsPropertySignature(
          j.identifier(paramName),
          j.tsTypeAnnotation(innerType as any),
        );
        (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeLiteral([propSignature]),
        );
      }
    }

    fn.params[0] = propsParam;

    for (const entry of managedEntries) {
      if (!entry.propsObjectKey) {
        entry.propsObjectKey = paramName;
      }
    }
  }
}

type ASTProperty = { key?: { name?: string; value?: string }; value?: unknown };

function findBodyProperty(properties: ASTProperty[], key: string): ASTProperty | undefined {
  return properties.find((p) => (p.key?.name ?? p.key?.value) === key);
}

/**
 * Converts style object entries to AST property nodes for insertion into
 * a function body's ObjectExpression. Used by mergeBaseIntoSingleStyleFn
 * and mergeVariantBucketsIntoStyleFns to fold static properties into
 * dynamic style functions.
 */
function styleObjToAstProperties(
  j: Parameters<typeof literalToAst>[0],
  obj: Record<string, unknown>,
  skip?: ReadonlySet<string>,
): unknown[] {
  const props: unknown[] = [];
  for (const [cssProp, cssValue] of Object.entries(obj)) {
    if (cssProp.startsWith("__") || skip?.has(cssProp)) {
      continue;
    }
    const valueAst =
      cssValue && typeof cssValue === "object" && !isAstNode(cssValue) && !Array.isArray(cssValue)
        ? objectToAst(j, cssValue as Record<string, unknown>)
        : literalToAst(j, cssValue);
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cssProp)
      ? j.identifier(cssProp)
      : j.literal(cssProp);
    props.push(j.property("init", key, valueAst));
  }
  return props;
}

/**
 * Recursively replaces all `Identifier` references matching `oldName` with
 * `props.oldName` (a MemberExpression). Handles shorthand properties by
 * un-shorthanding them.
 */
function replaceIdentifierInAst(
  j: Parameters<typeof literalToAst>[0],
  node: unknown,
  oldName: string,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Record<string, unknown>;

  if (n.type === "ObjectExpression") {
    const properties = n.properties as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(properties)) {
      return;
    }
    for (const prop of properties) {
      if (prop.type === "SpreadElement" || prop.type === "SpreadProperty") {
        if (
          (prop.argument as { type?: string; name?: string })?.type === "Identifier" &&
          (prop.argument as { name?: string }).name === oldName
        ) {
          prop.argument = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, prop.argument, oldName);
        }
        continue;
      }
      if (prop.type !== "Property") {
        continue;
      }
      // Handle shorthand: `{ color }` → `{ color: props.color }`
      if (
        prop.shorthand &&
        (prop.value as { type?: string; name?: string })?.type === "Identifier" &&
        (prop.value as { name?: string }).name === oldName
      ) {
        prop.shorthand = false;
        prop.value = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        continue;
      }
      // Recurse into value (but not key unless computed)
      if (prop.computed) {
        if (
          (prop.key as { type?: string; name?: string })?.type === "Identifier" &&
          (prop.key as { name?: string }).name === oldName
        ) {
          prop.key = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, prop.key, oldName);
        }
      }
      // Direct replacement when value is the target Identifier
      if (
        (prop.value as { type?: string; name?: string })?.type === "Identifier" &&
        (prop.value as { name?: string }).name === oldName
      ) {
        prop.value = j.memberExpression(j.identifier("props"), j.identifier(oldName));
      } else {
        replaceIdentifierInAst(j, prop.value, oldName);
      }
    }
    return;
  }

  // For all other node types, walk children and replace matching Identifiers
  for (const key of Object.keys(n)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "comments") {
      continue;
    }
    // Skip non-computed MemberExpression.property — it's a property name, not a variable reference
    if (key === "property" && n.type === "MemberExpression" && !n.computed) {
      continue;
    }
    const child = n[key];
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (
          (child[i] as { type?: string; name?: string })?.type === "Identifier" &&
          (child[i] as { name?: string }).name === oldName
        ) {
          child[i] = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, child[i], oldName);
        }
      }
    } else if (
      (child as { type?: string; name?: string })?.type === "Identifier" &&
      (child as { name?: string }).name === oldName
    ) {
      n[key] = j.memberExpression(j.identifier("props"), j.identifier(oldName));
    } else if (child && typeof child === "object" && (child as { type?: string }).type) {
      replaceIdentifierInAst(j, child, oldName);
    }
  }
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
 * Axis shorthand → longhand pairs that StyleX treats as conflicting.
 * When both a shorthand (e.g., `paddingBlock`) and one of its longhands
 * (e.g., `paddingBottom`) appear in the same style object, StyleX cannot
 * resolve the overlap. This table drives `resolveDirectionalConflicts`.
 */
const AXIS_PAIRS: Array<{
  shorthand: string;
  start: string;
  end: string;
}> = [
  { shorthand: "paddingBlock", start: "paddingTop", end: "paddingBottom" },
  { shorthand: "paddingInline", start: "paddingLeft", end: "paddingRight" },
  { shorthand: "marginBlock", start: "marginTop", end: "marginBottom" },
  { shorthand: "marginInline", start: "marginLeft", end: "marginRight" },
];

const BOX_SHORTHAND_CONFLICTS: Array<{
  shorthand: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  block: string;
  inline: string;
}> = [
  {
    shorthand: "padding",
    top: "paddingTop",
    right: "paddingRight",
    bottom: "paddingBottom",
    left: "paddingLeft",
    block: "paddingBlock",
    inline: "paddingInline",
  },
  {
    shorthand: "margin",
    top: "marginTop",
    right: "marginRight",
    bottom: "marginBottom",
    left: "marginLeft",
    block: "marginBlock",
    inline: "marginInline",
  },
];

const LOGICAL_SIDE_PAIRS: Array<{
  logical: string;
  physical: string;
}> = [
  { logical: "paddingBlockStart", physical: "paddingTop" },
  { logical: "paddingBlockEnd", physical: "paddingBottom" },
  { logical: "paddingInlineStart", physical: "paddingLeft" },
  { logical: "paddingInlineEnd", physical: "paddingRight" },
  { logical: "marginBlockStart", physical: "marginTop" },
  { logical: "marginBlockEnd", physical: "marginBottom" },
  { logical: "marginInlineStart", physical: "marginLeft" },
  { logical: "marginInlineEnd", physical: "marginRight" },
];

/**
 * Checks whether a value is a media/pseudo map (object with `default` or `@`/`:` keys).
 */
function isMediaOrPseudoMap(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
    return false;
  }
  const keys = Object.keys(v as Record<string, unknown>);
  return keys.includes("default") || keys.some((k) => k.startsWith(":") || k.startsWith("@"));
}

function resolveBoxShorthandConflicts(styleObj: Record<string, unknown>): void {
  for (const config of BOX_SHORTHAND_CONFLICTS) {
    const shorthandVal = styleObj[config.shorthand];
    if (shorthandVal === undefined) {
      continue;
    }
    const sideProps = [
      config.top,
      config.right,
      config.bottom,
      config.left,
      config.block,
      config.inline,
    ];
    if (!sideProps.some((prop) => prop in styleObj)) {
      continue;
    }

    const entries = Object.entries(styleObj);
    const shorthandIndex = entries.findIndex(([key]) => key === config.shorthand);
    recordLateSideOverrides(styleObj, config, entries, shorthandIndex);
    const replacements: Record<string, unknown> = {
      [config.top]: resolveBoxSideConflictValue({
        shorthandVal,
        shorthandIndex,
        longhandVal: styleObj[config.top],
        longhandIndex: entries.findIndex(([key]) => key === config.top),
        axisVal: styleObj[config.block],
        axisIndex: entries.findIndex(([key]) => key === config.block),
      }),
      [config.right]: resolveBoxSideConflictValue({
        shorthandVal,
        shorthandIndex,
        longhandVal: styleObj[config.right],
        longhandIndex: entries.findIndex(([key]) => key === config.right),
        axisVal: styleObj[config.inline],
        axisIndex: entries.findIndex(([key]) => key === config.inline),
      }),
      [config.bottom]: resolveBoxSideConflictValue({
        shorthandVal,
        shorthandIndex,
        longhandVal: styleObj[config.bottom],
        longhandIndex: entries.findIndex(([key]) => key === config.bottom),
        axisVal: styleObj[config.block],
        axisIndex: entries.findIndex(([key]) => key === config.block),
      }),
      [config.left]: resolveBoxSideConflictValue({
        shorthandVal,
        shorthandIndex,
        longhandVal: styleObj[config.left],
        longhandIndex: entries.findIndex(([key]) => key === config.left),
        axisVal: styleObj[config.inline],
        axisIndex: entries.findIndex(([key]) => key === config.inline),
      }),
    };

    for (const key of Object.keys(styleObj)) {
      delete styleObj[key];
    }
    for (const [key, val] of entries) {
      if (key === config.shorthand) {
        styleObj[config.top] = replacements[config.top];
        styleObj[config.right] = replacements[config.right];
        styleObj[config.bottom] = replacements[config.bottom];
        styleObj[config.left] = replacements[config.left];
      } else if (sideProps.includes(key)) {
        continue;
      } else {
        styleObj[key] = val;
      }
    }
  }
}

function resolveBoxSideConflictValue(args: {
  shorthandVal: unknown;
  shorthandIndex: number;
  longhandVal: unknown;
  longhandIndex: number;
  axisVal: unknown;
  axisIndex: number;
}): unknown {
  const { shorthandVal, shorthandIndex, longhandVal, longhandIndex, axisVal, axisIndex } = args;
  const base = latestIndexedValue([
    { value: axisVal, index: axisIndex },
    { value: longhandVal, index: longhandIndex },
  ]);
  if (!isMediaOrPseudoMap(shorthandVal)) {
    if (!base || shorthandIndex > base.index) {
      return shorthandVal;
    }
    if (isMediaOrPseudoMap(base.value)) {
      return mergeScalarDefaultIntoLonghand(base.value, shorthandVal);
    }
    return base.value;
  }
  const defaultValue =
    shorthandVal.default != null && (!base || shorthandIndex > base.index)
      ? shorthandVal.default
      : (base?.value ?? shorthandVal.default ?? null);
  if (base && base.index > shorthandIndex && isMediaOrPseudoMap(base.value)) {
    return computeMergedLonghand(base.value, shorthandVal);
  }
  const result: Record<string, unknown> = { default: defaultValue };
  for (const [condition, conditionValue] of Object.entries(shorthandVal)) {
    if (condition !== "default" && conditionValue != null) {
      result[condition] = conditionValue;
    }
  }
  return result;
}

function latestIndexedValue(
  candidates: Array<{ value: unknown; index: number }>,
): { value: unknown; index: number } | null {
  let latest: { value: unknown; index: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.index < 0 || candidate.value === undefined) {
      continue;
    }
    if (!latest || candidate.index > latest.index) {
      latest = candidate;
    }
  }
  return latest;
}

/**
 * Resolves conflicts between directional shorthand properties (e.g., `paddingBlock`)
 * and their individual longhand overrides (e.g., `paddingBottom`).
 *
 * CSS cascade allows `padding: 0 12px; padding-bottom: 10px;` — the shorthand sets
 * both top and bottom to 0, then the longhand overrides bottom to 10px. After
 * `splitDirectionalProperty`, this becomes `paddingBlock: 0` + `paddingBottom: "10px"`.
 * StyleX can't have both `paddingBlock` and `paddingBottom` — they conflict.
 *
 * This function detects such conflicts and splits the shorthand into individual
 * longhands, preserving the override. It also handles media/pseudo map values where
 * the shorthand at a media level needs to reset the overridden longhand.
 *
 * Property ordering is preserved: the split longhands replace the shorthand's
 * position in the object to maintain a natural CSS property order.
 */
function resolveDirectionalConflicts(
  styleObj: Record<string, unknown>,
  options?: { skipNullishShorthandDefault?: boolean },
): void {
  for (const { shorthand, start, end } of AXIS_PAIRS) {
    const shorthandVal = styleObj[shorthand];
    if (shorthandVal === undefined) {
      continue;
    }
    if (options?.skipNullishShorthandDefault === true && hasNullishDefault(shorthandVal)) {
      continue;
    }

    const hasStart = start in styleObj;
    const hasEnd = end in styleObj;
    if (!hasStart && !hasEnd) {
      continue;
    }

    // Rebuild the object in order: replace the shorthand position with start+end,
    // and remove any existing start/end entries from their old positions.
    const entries = Object.entries(styleObj);
    const shorthandIndex = entries.findIndex(([key]) => key === shorthand);

    // Compute replacement values for start/end longhands.
    const startVal = resolveDirectionalConflictValue({
      shorthandVal,
      longhandVal: styleObj[start],
      hasLonghand: hasStart,
      shorthandIndex,
      longhandIndex: entries.findIndex(([key]) => key === start),
    });
    const endVal = resolveDirectionalConflictValue({
      shorthandVal,
      longhandVal: styleObj[end],
      hasLonghand: hasEnd,
      shorthandIndex,
      longhandIndex: entries.findIndex(([key]) => key === end),
    });

    // Clear all keys
    for (const key of Object.keys(styleObj)) {
      delete styleObj[key];
    }
    for (const [key, val] of entries) {
      if (key === shorthand) {
        // Replace shorthand with the two longhands in order
        styleObj[start] = startVal;
        styleObj[end] = endVal;
      } else if (key === start || key === end) {
        // Skip — already inserted at the shorthand's position
        continue;
      } else {
        styleObj[key] = val;
      }
    }
  }
  resolveLogicalSideConflicts(styleObj);
}

function resolveLogicalSideConflicts(styleObj: Record<string, unknown>): void {
  for (const { logical, physical } of LOGICAL_SIDE_PAIRS) {
    const logicalVal = styleObj[logical];
    if (logicalVal === undefined || !(physical in styleObj)) {
      continue;
    }

    const entries = Object.entries(styleObj);
    const logicalIndex = entries.findIndex(([key]) => key === logical);
    const physicalIndex = entries.findIndex(([key]) => key === physical);
    const resolvedVal = resolveDirectionalConflictValue({
      shorthandVal: logicalVal,
      longhandVal: styleObj[physical],
      hasLonghand: true,
      shorthandIndex: logicalIndex,
      longhandIndex: physicalIndex,
    });
    const replacementKey = logicalIndex > physicalIndex ? logical : physical;

    for (const key of Object.keys(styleObj)) {
      delete styleObj[key];
    }
    for (const [key, val] of entries) {
      if (key === replacementKey) {
        styleObj[physical] = resolvedVal;
      } else if (key === logical || key === physical) {
        continue;
      } else {
        styleObj[key] = val;
      }
    }
  }
}

const BORDER_RADIUS_CORNER_PROPS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const;

type HarmonizeShorthandOptions = {
  baseStyleObj?: Record<string, unknown>;
  inheritBaseLateSides?: ReadonlySet<Record<string, unknown>>;
  /** Base style entries captured before shorthand/longhand resolution mutated them. */
  baseRawEntries?: ReadonlyArray<readonly [string, unknown]>;
  /**
   * Base entries present when a variant bucket first received styles. Keys
   * missing from the snapshot — or whose value changed since — were
   * (re)declared after the variant block in source, so they keep winning over
   * the variant's expanded shorthand.
   */
  bucketBaseKeySnapshot?: (
    styleObj: Record<string, unknown>,
  ) => ReadonlyMap<string, unknown> | undefined;
  bucketSourceOrder?: (styleObj: Record<string, unknown>) => number | undefined;
};

function harmonizeShorthandExpansion(
  styleObjs: ReadonlyArray<Record<string, unknown>>,
  options?: HarmonizeShorthandOptions,
): void {
  harmonizeBoxShorthandExpansion(styleObjs, options);
  harmonizeBorderRadiusExpansion(styleObjs, options);
}

/** Resolve a bucket object back to its `when` snapshot recorded during decl processing. */
function bucketSnapshotLookup(
  decl: StyledDecl,
  buckets: ReadonlyMap<string, Record<string, unknown>>,
): (styleObj: Record<string, unknown>) => ReadonlyMap<string, unknown> | undefined {
  const whenByObject = new Map<Record<string, unknown>, string>();
  for (const [when, obj] of buckets.entries()) {
    whenByObject.set(obj, when);
  }
  return (styleObj) => {
    const when = whenByObject.get(styleObj);
    return when === undefined ? undefined : getVariantBaseKeySnapshot(decl, when);
  };
}

function bucketSourceOrderLookup(
  decl: StyledDecl,
  buckets: ReadonlyMap<string, Record<string, unknown>>,
): (styleObj: Record<string, unknown>) => number | undefined {
  const whenByObject = new Map<Record<string, unknown>, string>();
  for (const [when, obj] of buckets.entries()) {
    whenByObject.set(obj, when);
  }
  return (styleObj) => {
    const when = whenByObject.get(styleObj);
    return when === undefined ? undefined : getVariantSourceOrder(decl, when);
  };
}

/**
 * StyleX priorities put side longhands (`paddingTop`) above axis shorthands
 * (`paddingBlock`) above box shorthands (`padding`) regardless of application
 * order. When the declaration family mixes these levels across style objects
 * (e.g. the base expanded `padding: 4px; padding-top: 2px` into side longhands
 * while a variant kept `padding: 8px`), a later-applied lower-level value can
 * never override an earlier higher-level one. Expand statically expandable
 * shorthand/axis values to side longhands in every object so overrides resolve
 * through plain per-property merging.
 */
/**
 * Side props whose longhand was declared after the box shorthand (per style
 * object). A variant carrying the same shorthand must not override these sides
 * when it gets expanded to longhands — the later longhand wins over the
 * variant's shorthand in the original CSS cascade too.
 */
const lateSideOverrides = new WeakMap<Record<string, unknown>, Map<string, Set<string>>>();

function recordLateSideOverrides(
  styleObj: Record<string, unknown>,
  config: (typeof BOX_SHORTHAND_CONFLICTS)[number],
  entries: Array<[string, unknown]>,
  shorthandIndex: number,
): void {
  const lateSides = new Set<string>();
  const markIfLate = (prop: string, ...sides: string[]): void => {
    const index = entries.findIndex(([key]) => key === prop);
    if (index <= shorthandIndex) {
      return;
    }
    const value = entries[index]?.[1];
    // Conditional-only overrides (nullish default) leave the default to the
    // shorthand, so a variant shorthand may still control these sides.
    if (isMediaOrPseudoMap(value) && hasNullishDefault(value)) {
      return;
    }
    for (const side of sides) {
      lateSides.add(side);
    }
  };
  markIfLate(config.top, config.top);
  markIfLate(config.right, config.right);
  markIfLate(config.bottom, config.bottom);
  markIfLate(config.left, config.left);
  markIfLate(config.block, config.top, config.bottom);
  markIfLate(config.inline, config.left, config.right);
  if (lateSides.size === 0) {
    return;
  }
  const byShorthand = lateSideOverrides.get(styleObj) ?? new Map<string, Set<string>>();
  byShorthand.set(config.shorthand, lateSides);
  lateSideOverrides.set(styleObj, byShorthand);
}

/**
 * Sides of `config` whose base longhand/axis declaration is absent from the
 * variant's base-key snapshot — i.e. it was declared after the variant block
 * in source order and must keep winning over the variant's shorthand.
 * Conditional-only values (nullish default) never suppress: their default
 * still falls back to the variant's shorthand.
 */
function baseSidesDeclaredAfterSnapshot(
  baseRawEntries: ReadonlyArray<readonly [string, unknown]>,
  snapshot: ReadonlyMap<string, unknown>,
  config: (typeof BOX_SHORTHAND_CONFLICTS)[number],
): ReadonlySet<string> {
  const lateSides = new Set<string>();
  const sidesByKey = boxSidesByKey(config);
  for (const [key, value] of baseRawEntries) {
    const sides = sidesByKey.get(key);
    if (!sides || !declaredAfterSnapshot(snapshot, key, value)) {
      continue;
    }
    if (isMediaOrPseudoMap(value) && hasNullishDefault(value)) {
      continue;
    }
    for (const side of sides) {
      lateSides.add(side);
    }
  }
  return lateSides;
}

function boxSidesByKey(config: (typeof BOX_SHORTHAND_CONFLICTS)[number]): Map<string, string[]> {
  return new Map<string, string[]>([
    [config.top, [config.top]],
    [config.right, [config.right]],
    [config.bottom, [config.bottom]],
    [config.left, [config.left]],
    [config.block, [config.top, config.bottom]],
    [config.inline, [config.left, config.right]],
  ]);
}

/**
 * Base side/axis condition entries that were added after the variant snapshot.
 * Later pseudo/media condition classes target the same property, and a flat
 * variant value would replace the base map entirely in `stylex.props()`.
 */
function conditionalBaseSidesAfterSnapshot(
  baseRawEntries: ReadonlyArray<readonly [string, unknown]>,
  snapshot: ReadonlyMap<string, unknown> | undefined,
  variantSourceOrder: number | undefined,
  config: (typeof BOX_SHORTHAND_CONFLICTS)[number],
): ReadonlyMap<string, Record<string, unknown>> {
  const conditionMaps = new Map<string, Record<string, unknown>>();
  const sidesByKey = boxSidesByKey(config);
  for (const [key, value] of baseRawEntries) {
    const sides = sidesByKey.get(key);
    const changedConditions = changedConditionEntriesAfterSnapshot(
      snapshot,
      variantSourceOrder,
      key,
      value,
    );
    if (!sides || !changedConditions) {
      continue;
    }
    for (const side of sides) {
      mergeConditionMapForSide(conditionMaps, side, changedConditions);
    }
  }
  return conditionMaps;
}

function mergeConditionMapForSide(
  conditionMaps: Map<string, Record<string, unknown>>,
  side: string,
  changedConditions: Record<string, unknown>,
): void {
  const existing = conditionMaps.get(side);
  if (existing) {
    mergeStyleObjects(existing, changedConditions);
    return;
  }
  conditionMaps.set(side, { ...changedConditions });
}

function changedConditionEntriesAfterSnapshot(
  snapshot: ReadonlyMap<string, unknown> | undefined,
  variantSourceOrder: number | undefined,
  key: string,
  value: unknown,
): Record<string, unknown> | null {
  if (!isMediaOrPseudoMap(value) || !hasNullishDefault(value)) {
    return null;
  }
  const snapshotHasKey = snapshot?.has(key) ?? false;
  const snapshotValue = snapshotHasKey ? snapshot?.get(key) : undefined;
  const snapshotMap = isMediaOrPseudoMap(snapshotValue) ? snapshotValue : null;
  const changed: Record<string, unknown> = {};
  for (const [condition, conditionValue] of Object.entries(value)) {
    if (condition === "default" || conditionValue == null) {
      continue;
    }
    const conditionSourceOrder = getConditionSourceOrder(value, condition);
    if (variantSourceOrder !== undefined && conditionSourceOrder !== undefined) {
      if (conditionSourceOrder <= variantSourceOrder) {
        continue;
      }
      changed[condition] = conditionValue;
      continue;
    }
    if (
      snapshotHasKey &&
      snapshotMap &&
      condition in snapshotMap &&
      styleValuesEquivalent(snapshotMap[condition], conditionValue)
    ) {
      continue;
    }
    changed[condition] = conditionValue;
  }
  return Object.keys(changed).length ? changed : null;
}

/**
 * Merges base condition entries into a variant's expanded side value, keeping
 * the variant in control of the default. Follows the same convention as
 * computeMergedLonghand: condition entries win over the flat value.
 */
function mergeBaseConditionsIntoSideValue(
  variantValue: unknown,
  baseConditionMap: Record<string, unknown> | undefined,
): unknown {
  if (!baseConditionMap) {
    return variantValue;
  }
  const merged: Record<string, unknown> = isMediaOrPseudoMap(variantValue)
    ? { ...variantValue }
    : { default: variantValue };
  for (const [condition, conditionValue] of Object.entries(baseConditionMap)) {
    if (condition === "default" || conditionValue == null || condition in merged) {
      continue;
    }
    merged[condition] = conditionValue;
  }
  return merged;
}

/**
 * A base entry was (re)declared after the variant's snapshot when its key was
 * absent at snapshot time, or its value changed since — a redeclaration after
 * the variant block replaces the value in the base style object.
 */
function declaredAfterSnapshot(
  snapshot: ReadonlyMap<string, unknown>,
  key: string,
  value: unknown,
): boolean {
  return !snapshot.has(key) || !styleValuesEquivalent(snapshot.get(key), value);
}

/**
 * Structural equality for snapshot comparison: condition maps are compared by
 * entries (snapshots clone them, and base merges may replace or mutate the map
 * object), everything else by identity.
 */
function styleValuesEquivalent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (!isPlainStyleValueMap(a) || !isPlainStyleValueMap(b)) {
    return false;
  }
  const aEntries = Object.entries(a);
  if (aEntries.length !== Object.keys(b).length) {
    return false;
  }
  return aEntries.every(([key, value]) => key in b && styleValuesEquivalent(value, b[key]));
}

function isPlainStyleValueMap(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { type?: unknown }).type !== "string"
  );
}

function harmonizeBoxShorthandExpansion(
  styleObjs: ReadonlyArray<Record<string, unknown>>,
  options?: HarmonizeShorthandOptions,
): void {
  for (const config of BOX_SHORTHAND_CONFLICTS) {
    const levels = new Set<string>();
    for (const obj of styleObjs) {
      if (config.shorthand in obj) {
        levels.add("shorthand");
      }
      if (config.block in obj || config.inline in obj) {
        levels.add("axis");
      }
      if (boxSideProps(config).some((prop) => prop in obj)) {
        levels.add("side");
      }
    }
    if (levels.size < 2) {
      continue;
    }
    const baseLateSides = options?.baseStyleObj
      ? lateSideOverrides.get(options.baseStyleObj)?.get(config.shorthand)
      : undefined;
    const conditionalSidesFor = (
      styleObj: Record<string, unknown>,
    ): ReadonlyMap<string, Record<string, unknown>> | undefined => {
      if (!options?.inheritBaseLateSides?.has(styleObj) || !options.baseRawEntries) {
        return undefined;
      }
      return conditionalBaseSidesAfterSnapshot(
        options.baseRawEntries,
        options.bucketBaseKeySnapshot?.(styleObj),
        options.bucketSourceOrder?.(styleObj),
        config,
      );
    };
    const lateSidesFor = (styleObj: Record<string, unknown>): ReadonlySet<string> => {
      const localLateSides = lateSideOverrides.get(styleObj)?.get(config.shorthand);
      if (!options?.inheritBaseLateSides?.has(styleObj)) {
        return localLateSides ?? new Set();
      }
      // Source-order aware path: suppress only sides whose base longhand was
      // declared after this variant first received styles.
      const snapshot = options.bucketBaseKeySnapshot?.(styleObj);
      const inheritedLateSides =
        snapshot && options.baseRawEntries
          ? baseSidesDeclaredAfterSnapshot(options.baseRawEntries, snapshot, config)
          : (baseLateSides ?? new Set<string>());
      if (!inheritedLateSides.size) {
        return localLateSides ?? new Set();
      }
      if (!localLateSides?.size) {
        return inheritedLateSides;
      }
      return new Set([...inheritedLateSides, ...localLateSides]);
    };
    // Expand lower levels up to the highest level present — never past it,
    // or a base expansion would out-prioritize a variant's higher-level keys.
    const targetLevel = levels.has("side") ? "side" : "axis";
    for (const obj of styleObjs) {
      if (targetLevel === "side") {
        expandBoxLevelsToSides(obj, config, lateSidesFor(obj), conditionalSidesFor(obj));
      } else {
        expandBoxShorthandToAxis(obj, config, lateSidesFor(obj));
      }
    }
  }
}

function boxSideProps(config: (typeof BOX_SHORTHAND_CONFLICTS)[number]): string[] {
  return [config.top, config.right, config.bottom, config.left];
}

/**
 * Expands a pure shorthand-level or axis-level style object to side longhands
 * in place. Mixed-level objects were already reconciled per-object by
 * resolveBoxShorthandConflicts / resolveDirectionalConflicts and are left
 * untouched, as are values that cannot be expanded statically.
 */
function expandBoxLevelsToSides(
  styleObj: Record<string, unknown>,
  config: (typeof BOX_SHORTHAND_CONFLICTS)[number],
  lateSides: ReadonlySet<string>,
  conditionalSides?: ReadonlyMap<string, Record<string, unknown>>,
): void {
  const hasSide = boxSideProps(config).some((prop) => prop in styleObj);
  const shorthandVal = styleObj[config.shorthand];
  const withoutLateSides = (
    replacements: ReadonlyArray<readonly [string, unknown]>,
  ): Array<readonly [string, unknown]> =>
    replacements
      .filter(([sideProp]) => !lateSides.has(sideProp))
      .map(([sideProp, value]) => [
        sideProp,
        mergeBaseConditionsIntoSideValue(value, conditionalSides?.get(sideProp)),
      ]);
  if (shorthandVal !== undefined) {
    if (hasSide || config.block in styleObj || config.inline in styleObj) {
      return;
    }
    const expanded = expandBoxShorthandValueToSides(shorthandVal);
    if (!expanded) {
      return;
    }
    replaceStyleKeyInPlace(
      styleObj,
      config.shorthand,
      withoutLateSides([
        [config.top, expanded.top],
        [config.right, expanded.right],
        [config.bottom, expanded.bottom],
        [config.left, expanded.left],
      ]),
    );
    return;
  }
  if (hasSide) {
    return;
  }
  // Axis properties are RTL-aware (paddingInline flips, paddingLeft does not),
  // so rewriting them to physical sides is only safe when the adapter opted
  // into physical properties.
  if (getUseLogicalProperties()) {
    return;
  }
  if (config.block in styleObj) {
    const blockVal = styleObj[config.block];
    replaceStyleKeyInPlace(
      styleObj,
      config.block,
      withoutLateSides([
        [config.top, blockVal],
        [config.bottom, cloneBoxValue(blockVal)],
      ]),
    );
  }
  if (config.inline in styleObj) {
    const inlineVal = styleObj[config.inline];
    replaceStyleKeyInPlace(
      styleObj,
      config.inline,
      withoutLateSides([
        [config.left, inlineVal],
        [config.right, cloneBoxValue(inlineVal)],
      ]),
    );
  }
}

/**
 * Expands a box shorthand to the axis pair (`paddingBlock`/`paddingInline`)
 * when the family's highest conflicting level is the axis level. Values with
 * 3-4 parts cannot be represented per-axis and are left untouched.
 */
function expandBoxShorthandToAxis(
  styleObj: Record<string, unknown>,
  config: (typeof BOX_SHORTHAND_CONFLICTS)[number],
  lateSides: ReadonlySet<string>,
): void {
  const shorthandVal = styleObj[config.shorthand];
  if (
    shorthandVal === undefined ||
    config.block in styleObj ||
    config.inline in styleObj ||
    boxSideProps(config).some((prop) => prop in styleObj)
  ) {
    return;
  }
  const expanded = expandBoxShorthandValueToAxis(shorthandVal);
  if (!expanded) {
    return;
  }
  const replacements: Array<readonly [string, unknown]> = [];
  if (!lateSides.has(config.top) && !lateSides.has(config.bottom)) {
    replacements.push([config.block, expanded.block]);
  }
  if (!lateSides.has(config.left) && !lateSides.has(config.right)) {
    replacements.push([config.inline, expanded.inline]);
  }
  replaceStyleKeyInPlace(styleObj, config.shorthand, replacements);
}

function expandBoxShorthandValueToAxis(value: unknown): {
  block: unknown;
  inline: unknown;
} | null {
  if (typeof value === "number") {
    return { block: value, inline: value };
  }
  const staticString = typeof value === "string" ? value : staticStringValue(value);
  if (staticString !== null) {
    const parts = splitCssValueWhitespace(staticString.trim());
    const block = parts[0];
    if (block === undefined || parts.length > 2) {
      return null;
    }
    return { block, inline: parts[1] ?? block };
  }
  if (!isMediaOrPseudoMap(value)) {
    return null;
  }
  const block: Record<string, unknown> = {};
  const inline: Record<string, unknown> = {};
  for (const [condition, conditionValue] of Object.entries(value)) {
    if (conditionValue == null) {
      block[condition] = conditionValue;
      inline[condition] = conditionValue;
      continue;
    }
    if (isMediaOrPseudoMap(conditionValue)) {
      return null;
    }
    const expanded = expandBoxShorthandValueToAxis(conditionValue);
    if (!expanded) {
      return null;
    }
    block[condition] = expanded.block;
    inline[condition] = expanded.inline;
  }
  return { block, inline };
}

function expandBoxShorthandValueToSides(value: unknown): {
  top: unknown;
  right: unknown;
  bottom: unknown;
  left: unknown;
} | null {
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  const staticString = typeof value === "string" ? value : staticStringValue(value);
  if (staticString !== null) {
    return expandBoxShorthandStringToSides(staticString);
  }
  if (!isMediaOrPseudoMap(value)) {
    return null;
  }
  const top: Record<string, unknown> = {};
  const right: Record<string, unknown> = {};
  const bottom: Record<string, unknown> = {};
  const left: Record<string, unknown> = {};
  for (const [condition, conditionValue] of Object.entries(value)) {
    if (conditionValue == null) {
      top[condition] = conditionValue;
      right[condition] = conditionValue;
      bottom[condition] = conditionValue;
      left[condition] = conditionValue;
      continue;
    }
    if (isMediaOrPseudoMap(conditionValue)) {
      return null;
    }
    const expanded = expandBoxShorthandValueToSides(conditionValue);
    if (!expanded) {
      return null;
    }
    top[condition] = expanded.top;
    right[condition] = expanded.right;
    bottom[condition] = expanded.bottom;
    left[condition] = expanded.left;
  }
  return { top, right, bottom, left };
}

/** CSS box expansion: 1-4 whitespace-separated values to top/right/bottom/left. */
function expandBoxShorthandStringToSides(raw: string): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} | null {
  const parts = splitCssValueWhitespace(raw.trim());
  const top = parts[0];
  if (top === undefined || parts.length > 4) {
    return null;
  }
  const right = parts[1] ?? top;
  const bottom = parts[2] ?? top;
  const left = parts[3] ?? right;
  return { top, right, bottom, left };
}

function replaceStyleKeyInPlace(
  styleObj: Record<string, unknown>,
  key: string,
  replacements: ReadonlyArray<readonly [string, unknown]>,
): void {
  const entries = Object.entries(styleObj);
  for (const existingKey of Object.keys(styleObj)) {
    delete styleObj[existingKey];
  }
  for (const [entryKey, entryValue] of entries) {
    if (entryKey === key) {
      for (const [replacementKey, replacementValue] of replacements) {
        styleObj[replacementKey] = replacementValue;
      }
    } else {
      styleObj[entryKey] = entryValue;
    }
  }
}

function cloneBoxValue(value: unknown): unknown {
  if (isAstNode(value)) {
    return cloneAstNode(value as Parameters<typeof cloneAstNode>[0]);
  }
  if (isMediaOrPseudoMap(value)) {
    const cloned: Record<string, unknown> = {};
    for (const [condition, conditionValue] of Object.entries(value)) {
      cloned[condition] = cloneBoxValue(conditionValue);
    }
    return cloned;
  }
  return value;
}

/**
 * StyleX gives longhand properties priority over shorthands regardless of
 * application order, so a `borderRadius` shorthand in one style object can
 * never override corner longhands applied from another (e.g. a variant's
 * `borderRadius: 4px` losing to base corner longhands expanded from
 * `border-radius: 16px 0`). When any style object in the declaration family
 * carries corner longhands, expand sibling single-value `borderRadius`
 * shorthands too so cascade overrides keep working.
 */
function harmonizeBorderRadiusExpansion(
  styleObjs: ReadonlyArray<Record<string, unknown>>,
  options?: HarmonizeShorthandOptions,
): void {
  const hasCornerLonghand = styleObjs.some((obj) =>
    BORDER_RADIUS_CORNER_PROPS.some((prop) => prop in obj),
  );
  if (!hasCornerLonghand) {
    return;
  }
  for (const obj of styleObjs) {
    expandMultiValueBorderRadius(obj, {
      includeSingleValue: true,
      omitCorners: lateBaseCornersFor(obj, options),
      mergeBaseConditionCorners: conditionalBaseCornersFor(obj, options),
    });
  }
}

/**
 * Corners whose base longhand was (re)declared after the variant block in
 * source order — those keep winning over the variant's expanded borderRadius,
 * so the variant must not emit them.
 */
function lateBaseCornersFor(
  styleObj: Record<string, unknown>,
  options?: HarmonizeShorthandOptions,
): ReadonlySet<string> | undefined {
  if (!options?.inheritBaseLateSides?.has(styleObj) || !options.baseRawEntries) {
    return undefined;
  }
  const snapshot = options.bucketBaseKeySnapshot?.(styleObj);
  if (!snapshot) {
    return undefined;
  }
  const lateCorners = new Set<string>();
  for (const [key, value] of options.baseRawEntries) {
    if (!(BORDER_RADIUS_CORNER_PROPS as readonly string[]).includes(key)) {
      continue;
    }
    if (!declaredAfterSnapshot(snapshot, key, value)) {
      continue;
    }
    if (isMediaOrPseudoMap(value) && hasNullishDefault(value)) {
      continue;
    }
    lateCorners.add(key);
  }
  return lateCorners;
}

/** Conditional-only base corner entries a variant's expanded borderRadius must preserve. */
function conditionalBaseCornersFor(
  styleObj: Record<string, unknown>,
  options?: HarmonizeShorthandOptions,
): ReadonlyMap<string, Record<string, unknown>> | undefined {
  if (!options?.inheritBaseLateSides?.has(styleObj) || !options.baseRawEntries) {
    return undefined;
  }
  const snapshot = options.bucketBaseKeySnapshot?.(styleObj);
  const variantSourceOrder = options.bucketSourceOrder?.(styleObj);
  const conditionMaps = new Map<string, Record<string, unknown>>();
  for (const [key, value] of options.baseRawEntries) {
    if (!(BORDER_RADIUS_CORNER_PROPS as readonly string[]).includes(key)) {
      continue;
    }
    const changedConditions = changedConditionEntriesAfterSnapshot(
      snapshot,
      variantSourceOrder,
      key,
      value,
    );
    if (!changedConditions) {
      continue;
    }
    conditionMaps.set(key, changedConditions);
  }
  return conditionMaps;
}

function expandMultiValueBorderRadius(
  styleObj: Record<string, unknown>,
  options?: {
    includeSingleValue?: boolean;
    omitCorners?: ReadonlySet<string>;
    mergeBaseConditionCorners?: ReadonlyMap<string, Record<string, unknown>>;
  },
): void {
  const value = styleObj.borderRadius;
  if (value === undefined) {
    return;
  }
  const expanded = expandBorderRadiusValue(value, options);
  if (!expanded) {
    return;
  }
  const next = expandBorderRadiusInStyleObject(styleObj, expanded, {
    omitCorners: options?.omitCorners,
  });
  for (const [corner, conditionMap] of options?.mergeBaseConditionCorners ?? []) {
    if (corner in next) {
      next[corner] = mergeBaseConditionsIntoSideValue(next[corner], conditionMap);
    }
  }
  for (const key of Object.keys(styleObj)) {
    delete styleObj[key];
  }
  Object.assign(styleObj, next);
}

function expandBorderRadiusValue(
  value: unknown,
  options?: { includeSingleValue?: boolean },
): {
  topLeft: unknown;
  topRight: unknown;
  bottomRight: unknown;
  bottomLeft: unknown;
} | null {
  const staticExpanded = expandStaticBorderRadiusValue(value, options);
  if (staticExpanded) {
    return staticExpanded;
  }
  if (!isMediaOrPseudoMap(value)) {
    return null;
  }
  const topLeft: Record<string, unknown> = {};
  const topRight: Record<string, unknown> = {};
  const bottomRight: Record<string, unknown> = {};
  const bottomLeft: Record<string, unknown> = {};
  let changed = false;
  for (const [condition, conditionValue] of Object.entries(value)) {
    if (conditionValue == null) {
      topLeft[condition] = conditionValue;
      topRight[condition] = conditionValue;
      bottomRight[condition] = conditionValue;
      bottomLeft[condition] = conditionValue;
      continue;
    }
    const expanded = expandStaticBorderRadiusValue(conditionValue, options);
    if (!expanded) {
      return null;
    }
    changed = true;
    topLeft[condition] = expanded.topLeft;
    topRight[condition] = expanded.topRight;
    bottomRight[condition] = expanded.bottomRight;
    bottomLeft[condition] = expanded.bottomLeft;
  }
  return changed || options?.includeSingleValue === true
    ? { topLeft, topRight, bottomRight, bottomLeft }
    : null;
}

function expandStaticBorderRadiusValue(
  value: unknown,
  options?: { includeSingleValue?: boolean },
): {
  topLeft: unknown;
  topRight: unknown;
  bottomRight: unknown;
  bottomLeft: unknown;
} | null {
  if (typeof value === "number") {
    return options?.includeSingleValue === true
      ? { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value }
      : null;
  }
  const staticString = typeof value === "string" ? value : staticStringValue(value);
  if (staticString === null) {
    return null;
  }
  return expandBorderRadiusShorthandValue(staticString, options);
}

function resolveDirectionalConflictValue(args: {
  shorthandVal: unknown;
  longhandVal: unknown;
  hasLonghand: boolean;
  shorthandIndex: number;
  longhandIndex: number;
}): unknown {
  const { shorthandVal, longhandVal, hasLonghand, shorthandIndex, longhandIndex } = args;
  if (!hasLonghand || longhandIndex < 0) {
    return cloneDirectionalValue(shorthandVal);
  }
  if (shorthandIndex > longhandIndex) {
    if (isMediaOrPseudoMap(shorthandVal) && hasNullishDefault(shorthandVal)) {
      return computeMergedLonghand(longhandVal, shorthandVal, { shorthandOverrides: true });
    }
    if (!isMediaOrPseudoMap(shorthandVal) && isMediaOrPseudoMap(longhandVal)) {
      return mergeScalarDefaultIntoLonghand(longhandVal, shorthandVal, {
        overwriteDefault: true,
      });
    }
    return cloneDirectionalValue(shorthandVal);
  }
  if (isMediaOrPseudoMap(shorthandVal)) {
    return computeMergedLonghand(longhandVal, shorthandVal);
  }
  return mergeScalarDefaultIntoLonghand(longhandVal, shorthandVal);
}

function cloneDirectionalValue(value: unknown): unknown {
  return isMediaOrPseudoMap(value) ? { ...value } : value;
}

function hasNullishDefault(value: unknown): boolean {
  if (!isMediaOrPseudoMap(value)) {
    return false;
  }
  const map = value as Record<string, unknown>;
  return map.default === null || map.default === undefined;
}

/**
 * Computes the merged value for a longhand property that overrides a shorthand.
 * If the shorthand has media/pseudo keys, they get merged into the longhand's value.
 */
function computeMergedLonghand(
  longhandVal: unknown,
  shorthandMap: Record<string, unknown>,
  options?: { shorthandOverrides?: boolean },
): unknown {
  if (isMediaOrPseudoMap(longhandVal)) {
    const merged = { ...(longhandVal as Record<string, unknown>) };
    for (const [key, val] of Object.entries(shorthandMap)) {
      if (
        shouldUseShorthandMapEntry({
          key,
          longhandMap: merged,
          shorthandMap,
          shorthandOverrides: options?.shorthandOverrides === true,
        })
      ) {
        merged[key] = val;
      }
    }
    return merged;
  }
  // Longhand is a simple scalar — wrap as default and add shorthand's media keys
  const merged: Record<string, unknown> = { default: longhandVal };
  for (const [key, val] of Object.entries(shorthandMap)) {
    if (key !== "default") {
      merged[key] = val;
    }
  }
  return merged;
}

function shouldUseShorthandMapEntry(args: {
  key: string;
  longhandMap: Record<string, unknown>;
  shorthandMap: Record<string, unknown>;
  shorthandOverrides: boolean;
}): boolean {
  const { key, longhandMap, shorthandMap, shorthandOverrides } = args;
  if (!shorthandOverrides) {
    if (key === "default" && hasNullishDefault(longhandMap)) {
      return true;
    }
    return !(key in longhandMap);
  }
  if (key !== "default") {
    return true;
  }
  return !hasNullishDefault(shorthandMap) || hasNullishDefault(longhandMap);
}

function mergeScalarDefaultIntoLonghand(
  longhandVal: unknown,
  scalarDefault: unknown,
  options?: { overwriteDefault?: boolean },
): unknown {
  if (!isMediaOrPseudoMap(longhandVal)) {
    return longhandVal;
  }
  const merged = { ...(longhandVal as Record<string, unknown>) };
  if (
    options?.overwriteDefault === true ||
    merged.default === null ||
    merged.default === undefined
  ) {
    merged.default = scalarDefault;
  }
  return merged;
}

/**
 * Full CSS shorthand properties that StyleX will expand to longhands.
 * If the value is an opaque AST node (e.g., a theme token), each longhand
 * will receive the full multi-value token, producing invalid CSS.
 */
const OPAQUE_SHORTHAND_PROPS = new Set(["padding", "margin", "scrollMargin", "scrollPadding"]);

/**
 * Emits a warning when a full shorthand property has an opaque (AST node) value
 * that StyleX will expand to longhands. If the value contains multiple parts
 * (e.g., "6px 12px"), each longhand will receive the full value, producing
 * invalid CSS. The adapter should use `directional` in resolveValue instead.
 */
function warnOpaqueShorthands(
  styleObj: Record<string, unknown>,
  decl: StyledDecl,
  warnings: WarningLog[],
): void {
  for (const prop of OPAQUE_SHORTHAND_PROPS) {
    const val = styleObj[prop];
    if (val !== undefined && isAstNode(val)) {
      warnings.push({
        severity: "warning",
        type: "Shorthand property has an opaque value that StyleX will expand to longhands — use `directional` in resolveValue to return separate longhand tokens",
        loc: decl.loc,
        context: { prop },
      });
    }
  }
}

/**
 * Extracts a scalar default value from a style property value.
 *
 * If the value is already a pseudo/media map (e.g. `{ default: "auto", ":focus": "scroll" }`),
 * returns its `.default` property to avoid nesting maps which produces invalid StyleX values.
 * Otherwise returns the value as-is (string, number, or null).
 */
function extractScalarDefault(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value)) {
    const map = value as Record<string, unknown>;
    return "default" in map ? map.default : null;
  }
  return value ?? null;
}

/**
 * Copies existing pseudo/media entries from a source style value into a target map.
 *
 * When the source is a pseudo/media map (e.g. `{ default: "auto", ":focus": "scroll" }`),
 * copies all entries except `default` (which is handled separately) into the target.
 * This preserves existing pseudo/media rules so they aren't lost when StyleX replaces
 * the entire property map with the variant's value.
 */
function mergeExistingPseudoEntries(target: Record<string, unknown>, source: unknown): void {
  if (!source || typeof source !== "object" || Array.isArray(source) || isAstNode(source)) {
    return;
  }
  const map = source as Record<string, unknown>;
  for (const [key, val] of Object.entries(map)) {
    // Skip `default` (handled by extractScalarDefault) and keys already set in target
    if (key === "default" || key in target) {
      continue;
    }
    target[key] = val;
  }
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

/**
 * Merges variant bucket properties into style functions that share the same
 * condition key. When a ternary condition (e.g., `$open`) produces both static
 * variant values (e.g., `opacity: 1`, `pointerEvents: "inherit"`) and a
 * dynamic style function (e.g., `transitionDelay: \`${props.$delay}ms\``),
 * the static values must be folded into the function's return object to
 * avoid a duplicate bare style reference in `stylex.props()`.
 */
function mergeVariantBucketsIntoStyleFns(args: {
  j: Parameters<typeof literalToAst>[0];
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  resolvedStyleObjects: Map<string, unknown>;
  variantSourceOrder?: Record<string, number>;
}): void {
  const { j, styleFnFromProps, styleFnDecls, remainingBuckets, remainingStyleKeys } = args;

  // Build a map from condition ("when") to the styleFn key that handles it
  const conditionToFnKey = new Map<string, string>();
  for (const sfp of styleFnFromProps) {
    if (sfp.conditionWhen && sfp.fnKey) {
      conditionToFnKey.set(sfp.conditionWhen, sfp.fnKey);
    }
  }

  // Find variant buckets whose condition matches a styleFn condition AND shares the same style key
  for (const [when, variantObj] of remainingBuckets.entries()) {
    const fnKey = conditionToFnKey.get(when);
    if (!fnKey) {
      continue;
    }
    // Only merge when the variant's style key matches the styleFn's key
    const variantKey = remainingStyleKeys[when];
    if (variantKey !== fnKey) {
      continue;
    }
    const fnAst = styleFnDecls.get(fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }

    // Extract the function body (ObjectExpression) from the arrow function
    const body = getFunctionBodyExpr(fnAst);
    if (!body || (body as { type?: string }).type !== "ObjectExpression") {
      continue;
    }
    const bodyObj = body as { properties?: unknown[] };
    if (!Array.isArray(bodyObj.properties)) {
      continue;
    }

    // Get existing property keys in the function body
    const existingKeys = new Set<string>();
    for (const prop of bodyObj.properties) {
      const key = (prop as { key?: { name?: string } }).key?.name;
      if (key) {
        existingKeys.add(key);
      }
    }

    // Merge variant properties that aren't already in the function body
    const propsToMerge = styleObjToAstProperties(j, variantObj, existingKeys);
    bodyObj.properties.unshift(...propsToMerge);

    if (propsToMerge.length > 0) {
      // Remove the variant from remainingBuckets/remainingStyleKeys so it
      // doesn't produce a duplicate bare reference in stylex.props()
      remainingBuckets.delete(when);
      delete remainingStyleKeys[when];
      if (args.variantSourceOrder) {
        delete args.variantSourceOrder[when];
      }
      // Also remove the resolved style object that was set for this variant
      const variantStyleObjKey = Object.entries(args.remainingStyleKeys).find(
        ([w]) => w === when,
      )?.[1];
      if (variantStyleObjKey) {
        args.resolvedStyleObjects.delete(variantStyleObjKey);
      }
    }
  }
}

/**
 * Consolidates style functions that share the same jsxProp into a single
 * function with all properties merged. For example, when multiple CSS
 * declarations depend on the same transient prop `$size`, their separate
 * style functions are merged into one.
 *
 * Before: containerWidth($size), containerHeight($size), containerLineHeight($size)
 * After:  containerSize($size) with all properties combined
 */
function consolidateSameJsxPropStyleFns(args: {
  styleKey: string;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  hasShouldForwardProp: boolean;
}): void {
  const { styleKey, styleFnFromProps, styleFnDecls, hasShouldForwardProp } = args;

  // Group entries by jsxProp — only consolidate transient props ($-prefixed) on
  // shouldForwardProp components. Non-transient props use intentionally separate
  // style functions with individual parameter types.
  if (!hasShouldForwardProp) {
    return;
  }
  const groups = new Map<string, number[]>();
  for (let i = 0; i < styleFnFromProps.length; i++) {
    const entry = styleFnFromProps[i]!;
    if (entry.jsxProp === "__props" || entry.conditionWhen || !entry.jsxProp.startsWith("$")) {
      continue;
    }
    const indices = groups.get(entry.jsxProp) ?? [];
    indices.push(i);
    groups.set(entry.jsxProp, indices);
  }

  // Only consolidate groups with 2+ entries
  const indicesToRemove = new Set<number>();
  for (const [, indices] of groups) {
    if (indices.length < 2) {
      continue;
    }

    // Collect all arrow function bodies and verify they're compatible
    const firstIdx = indices[0]!;
    const firstEntry = styleFnFromProps[firstIdx]!;
    const unifiedParamName = firstEntry.jsxProp;
    const mergedProperties: unknown[] = [];
    let firstFnAst: object | undefined;

    let canMerge = true;
    const firstCallArgKey = astShapeKey(firstEntry.callArg);
    for (const idx of indices) {
      const entry = styleFnFromProps[idx]!;
      if (astShapeKey(entry.callArg) !== firstCallArgKey) {
        canMerge = false;
        break;
      }
      const fnAst = styleFnDecls.get(entry.fnKey);
      if (!fnAst || typeof fnAst !== "object") {
        canMerge = false;
        break;
      }
      if (idx === firstIdx) {
        firstFnAst = fnAst;
      }
      const body = getFunctionBodyExpr(fnAst);
      if (!body || (body as { type?: string }).type !== "ObjectExpression") {
        canMerge = false;
        break;
      }
      // Get the original parameter name for this function
      const origParam = getArrowFnSingleParamName(fnAst as any);
      const bodyProps = (body as { properties?: unknown[] }).properties ?? [];
      if (
        origParam &&
        !bodyProps.every((prop) => objectPropertyValueIsIdentifier(prop, origParam))
      ) {
        canMerge = false;
        break;
      }
      if (origParam && origParam !== unifiedParamName) {
        // Rename all identifier references from the original param to the unified name
        for (const prop of bodyProps) {
          renameIdentifierInAst(prop, origParam, unifiedParamName);
        }
      }
      mergedProperties.push(...bodyProps);
    }
    if (!canMerge || !firstFnAst) {
      continue;
    }

    // Build merged function name: styleKey + suffix from the prop name
    // (without the "$" prefix, e.g., $size → Size)
    const propName = firstEntry.jsxProp;
    const suffix = propName.startsWith("$")
      ? propName.slice(1).charAt(0).toUpperCase() + propName.slice(2)
      : propName.charAt(0).toUpperCase() + propName.slice(1);
    const mergedFnKey = `${styleKey}${suffix}`;

    // Build merged function: take the first function as template, replace body and param
    const firstBody = getFunctionBodyExpr(firstFnAst);
    if (!firstBody) {
      continue;
    }
    // Build the unified param with the jsxProp name
    const firstFn = firstFnAst as { params?: Array<{ name?: string; typeAnnotation?: unknown }> };
    const firstParam = firstFn.params?.[0];
    const unifiedParam = firstParam ? { ...firstParam, name: unifiedParamName } : undefined;
    const mergedBody = { ...(firstBody as object), properties: mergedProperties };
    const mergedFnAst = {
      ...firstFnAst,
      body: mergedBody,
      params: unifiedParam ? [unifiedParam] : (firstFn.params ?? []),
    };

    // Update styleFnDecls: add merged, remove old
    styleFnDecls.set(mergedFnKey, mergedFnAst);
    for (const idx of indices) {
      const entry = styleFnFromProps[idx]!;
      styleFnDecls.delete(entry.fnKey);
    }

    // Update styleFnFromProps: replace first entry, mark rest for removal
    styleFnFromProps[firstIdx] = {
      ...firstEntry,
      fnKey: mergedFnKey,
      // Preserve sourceOrder from the first entry
    };
    for (let k = 1; k < indices.length; k++) {
      indicesToRemove.add(indices[k]!);
    }
  }

  // Remove consolidated entries (in reverse order to preserve indices)
  const sortedRemoveIndices = [...indicesToRemove].sort((a, b) => b - a);
  for (const idx of sortedRemoveIndices) {
    styleFnFromProps.splice(idx, 1);
  }
}

function objectPropertyValueIsIdentifier(prop: unknown, name: string): boolean {
  const p = prop as { type?: string; value?: { type?: string; name?: string } };
  return (
    (p.type === "ObjectProperty" || p.type === "Property") &&
    p.value?.type === "Identifier" &&
    p.value.name === name
  );
}

function astShapeKey(node: unknown): string {
  if (node === undefined) {
    return "";
  }
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (key, value) => {
    if (
      key === "loc" ||
      key === "tokens" ||
      key === "comments" ||
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

/** Recursively renames all Identifier nodes with `oldName` to `newName` in an AST subtree.
 *  Skips property keys (the `key` field of Property nodes) to avoid renaming CSS property names. */
function renameIdentifierInAst(node: unknown, oldName: string, newName: string): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      renameIdentifierInAst(item, oldName, newName);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "Identifier" && n.name === oldName) {
    n.name = newName;
    return;
  }
  for (const key of Object.keys(n)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    // Skip property keys — only rename in values
    if (key === "key" && n.type === "Property") {
      continue;
    }
    const child = n[key];
    if (child && typeof child === "object") {
      renameIdentifierInAst(child, oldName, newName);
    }
  }
}
