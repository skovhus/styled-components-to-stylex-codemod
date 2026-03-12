/**
 * Finalizes per-declaration style objects after rule processing.
 * Core concepts: merge pseudo/media buckets, rewrite CSS vars, and emit variants.
 */
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import {
  cssValueToJs,
  literalToAst,
  toStyleKey,
  styleKeyWithSuffix,
} from "../transform/helpers.js";
import type { StyledDecl } from "../transform-types.js";
import { extractUnionLiteralValues, groupVariantBucketsIntoDimensions } from "./variants.js";
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
import type { DeclProcessingState } from "./decl-setup.js";
import { getOrCreateRelationOverrideBucket } from "./shared.js";
import type { VariantDimension } from "../transform-types.js";
import type { WarningLog } from "../logger.js";
import { isStyleConditionKey, mergeStyleObjects } from "./utils.js";

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
    inlineStyleProps,
    localVarValues,
  } = ctx;
  const {
    rewriteCssVarsInStyleObject,
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
      }));
    } else {
      // No existing map, create a new nested object with default and __computedKeys
      const nested: Record<string, unknown> = { default: resolvedDefault };
      (nested as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
        keyExpr: e.keyExpr,
        value: e.value,
      }));
      styleObj[prop] = nested;
    }
  }
  for (const [sel, obj] of Object.entries(nestedSelectors)) {
    styleObj[sel] = obj;
  }

  resolveDirectionalConflicts(styleObj);
  warnOpaqueShorthands(styleObj, decl, warnings);

  const varsToDrop = new Set<string>();
  rewriteCssVarsInStyleObject(styleObj, localVarValues, varsToDrop);
  for (const name of varsToDrop) {
    delete (styleObj as any)[name];
  }

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
      const before = decl.rawCss.slice(Math.max(0, m.index - 30), m.index);
      // Skip if this is preceded by a pseudo selector pattern
      if (/&:[a-z-]+(?:\([^)]*\))?\s+$/i.test(before)) {
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
      // Skip component identifiers (those are handled above)
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
    resolvedStyleObjects.set(baseKey, styleObj);
    for (const [k, v] of extraStyleObjects.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    for (const c of cases) {
      resolvedStyleObjects.set(c.styleKey, { backgroundColor: c.value });
    }
    decl.needsWrapperComponent = true;
  } else {
    resolvedStyleObjects.set(decl.styleKey, styleObj);
    for (const [k, v] of extraStyleObjects.entries()) {
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
    decl.variantDimensions = mergeVariantDimensions(decl.variantDimensions, dimensions);
    decl.needsWrapperComponent = true;
    // Remove CSS props that were moved to variant dimensions from base styles
    for (const prop of propsToStrip) {
      delete (styleObj as Record<string, unknown>)[prop];
    }
  }

  // Add remaining (compound/boolean) variants to resolvedStyleObjects
  for (const [when, obj] of remainingBuckets.entries()) {
    const key = remainingStyleKeys[when]!;
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

  for (const [k, v] of styleFnDecls.entries()) {
    resolvedStyleObjects.set(k, v);
  }
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

// --- Non-exported helpers ---

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
    } else {
      styleObj[prop] = map;
    }
  }
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
function resolveDirectionalConflicts(styleObj: Record<string, unknown>): void {
  for (const { shorthand, start, end } of AXIS_PAIRS) {
    const shorthandVal = styleObj[shorthand];
    if (shorthandVal === undefined) {
      continue;
    }

    const hasStart = start in styleObj;
    const hasEnd = end in styleObj;
    if (!hasStart && !hasEnd) {
      continue;
    }

    // Compute replacement values for start/end longhands.
    let startVal: unknown;
    let endVal: unknown;

    if (isMediaOrPseudoMap(shorthandVal)) {
      const shorthandMap = shorthandVal as Record<string, unknown>;
      startVal = hasStart
        ? computeMergedLonghand(styleObj[start], shorthandMap)
        : { ...shorthandMap };
      endVal = hasEnd ? computeMergedLonghand(styleObj[end], shorthandMap) : { ...shorthandMap };
    } else {
      startVal = hasStart ? styleObj[start] : shorthandVal;
      endVal = hasEnd ? styleObj[end] : shorthandVal;
    }

    // Rebuild the object in order: replace the shorthand position with start+end,
    // and remove any existing start/end entries from their old positions.
    const entries = Object.entries(styleObj);
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
}

/**
 * Computes the merged value for a longhand property that overrides a shorthand.
 * If the shorthand has media/pseudo keys, they get merged into the longhand's value.
 */
function computeMergedLonghand(
  longhandVal: unknown,
  shorthandMap: Record<string, unknown>,
): unknown {
  if (isMediaOrPseudoMap(longhandVal)) {
    const merged = { ...(longhandVal as Record<string, unknown>) };
    for (const [key, val] of Object.entries(shorthandMap)) {
      if (!(key in merged)) {
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
    let merged = false;
    for (const [cssProp, cssValue] of Object.entries(variantObj)) {
      if (existingKeys.has(cssProp)) {
        continue;
      }
      const valueAst = literalToAst(j, cssValue);
      bodyObj.properties.unshift(j.property("init", j.identifier(cssProp), valueAst));
      merged = true;
    }

    if (merged) {
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
    for (const idx of indices) {
      const entry = styleFnFromProps[idx]!;
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
