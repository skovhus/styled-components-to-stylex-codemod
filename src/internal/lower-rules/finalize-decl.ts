/**
 * Finalizes per-declaration style objects after rule processing.
 * Core concepts: merge pseudo/media buckets, rewrite CSS vars, and emit variants.
 */
import { cssPropertyToStylexProp, resolveBackgroundStylexProp } from "../css-prop-mapping.js";
import { cssValueToJs, toStyleKey, toSuffixFromProp } from "../transform/helpers.js";
import { extractUnionLiteralValues, groupVariantBucketsIntoDimensions } from "./variants.js";
import {
  getArrowFnSingleParamName,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  isAstNode,
  isCallExpressionNode,
} from "../utilities/jscodeshift-utils.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { DeclProcessingState } from "./decl-setup.js";

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
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    attrBuckets,
    inlineStyleProps,
    localVarValues,
  } = ctx;
  const {
    rewriteCssVarsInStyleObject,
    descendantOverridePseudoBuckets,
    descendantOverrides,
    ancestorSelectorParents,
    resolvedStyleObjects,
    warnings,
  } = state;

  for (const [prop, map] of Object.entries(perPropPseudo)) {
    styleObj[prop] = map;
  }
  for (const [prop, map] of Object.entries(perPropMedia)) {
    styleObj[prop] = map;
  }
  // Merge computed media keys (from adapter.resolveSelector)
  // Preserves any existing @media or pseudo entries already in styleObj[prop]
  for (const [prop, entry] of perPropComputedMedia) {
    const existing = styleObj[prop];
    // If the prop already has a media/pseudo map, merge into it
    if (existing && typeof existing === "object" && !isAstNode(existing)) {
      const merged = existing as Record<string, unknown>;
      // Add default if not already present
      if (!("default" in merged)) {
        merged.default = entry.defaultValue;
      }
      // Add computed keys to existing object
      (merged as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
        keyExpr: e.keyExpr,
        value: e.value,
      }));
    } else {
      // No existing map, create a new nested object with default and __computedKeys
      const nested: Record<string, unknown> = { default: entry.defaultValue };
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
    let didApply = false;
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
      // Only add to descendantOverrides once per override key
      if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
        descendantOverrides.push({
          parentStyleKey: decl.styleKey,
          childStyleKey: childDecl.styleKey,
          overrideStyleKey,
        });
      }
      // Get or create the pseudo buckets map for this override key
      let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
      if (!pseudoBuckets) {
        pseudoBuckets = new Map();
        descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
      }
      // Get or create the bucket for this specific pseudo (or null for base)
      let bucket = pseudoBuckets.get(ancestorPseudo);
      if (!bucket) {
        bucket = {};
        pseudoBuckets.set(ancestorPseudo, bucket);
      }
      didApply = true;

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
        if (/__SC_EXPR_\d+__/.test(value)) {
          continue;
        }
        // Convert CSS property name to camelCase (e.g., outline-offset -> outlineOffset)
        const outProp = cssPropertyToStylexProp(
          prop === "background" ? resolveBackgroundStylexProp(value) : prop,
        );
        const jsVal = cssValueToJs({ kind: "static", value } as any, false, outProp);
        (bucket as Record<string, unknown>)[outProp] = jsVal;
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

    if (didApply) {
      delete styleObj.width;
      delete styleObj.height;
      delete styleObj.opacity;
      delete styleObj.transform;
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
      return (
        keys.includes("default") ||
        keys.some((k) => k.startsWith(":") || k.startsWith("@media") || k.startsWith("::"))
      );
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
          variantStyleKeys[disabledPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
            disabledPrimaryWhen,
          )}`;

          variantBuckets.set(disabledNotPrimaryWhen, mkBucket(baseHover));
          variantStyleKeys[disabledNotPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
            disabledNotPrimaryWhen,
          )}`;
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
    decl.variantDimensions = dimensions;
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
    // If we have variant styles keyed off props (e.g. `disabled`),
    // we need a wrapper component to evaluate those conditions at runtime and
    // avoid forwarding custom variant props to DOM nodes.
    decl.needsWrapperComponent = true;
  }
  if (styleFnFromProps.length) {
    decl.styleFnFromProps = styleFnFromProps;
    for (const [k, v] of styleFnDecls.entries()) {
      resolvedStyleObjects.set(k, v);
    }
  }
  if (inlineStyleProps.length) {
    decl.inlineStyleProps = inlineStyleProps;
  }
}

// --- Non-exported helpers ---

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
 * Checks if a conditional branch is an empty CSS value (empty string, null, undefined, false).
 */
function isEmptyBranch(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; value?: unknown; name?: string };
  if ((n.type === "StringLiteral" || n.type === "Literal") && n.value === "") {
    return true;
  }
  if (n.type === "NullLiteral") {
    return true;
  }
  if (n.type === "Identifier" && n.name === "undefined") {
    return true;
  }
  if (n.type === "BooleanLiteral" && n.value === false) {
    return true;
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
  const consIsEmpty = isEmptyBranch(consequent);
  const altIsEmpty = isEmptyBranch(alternate);
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
  variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;

  // Drop the transient prop from forwarding
  ensureShouldForwardPropDrop(decl, testProp);
  decl.needsWrapperComponent = true;

  // Note: we intentionally do NOT add the adapter's imports here because we use
  // the inlined CSS properties (from cssText) rather than the opaque style reference.

  return { outcome: "handled" };
}
