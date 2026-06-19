/**
 * Resolves StyleX box-model conflicts: shorthand vs. axis vs. side longhands for
 * `padding`/`margin`, logical/physical side pairs, and `borderRadius` corners.
 * Harmonizes shorthand expansion across a declaration's style-object family so
 * later lower-level values can still override earlier higher-level ones.
 */
import { getUseLogicalProperties } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";
import { getVariantBaseKeySnapshot, getVariantSourceOrder } from "./variant-utils.js";
import { getConditionSourceOrder } from "./condition-source-order.js";
import type { WarningLog } from "../logger.js";
import { isProvenSingleTokenValue, mergeStyleObjects } from "./utils.js";
import {
  expandBorderRadiusInStyleObject,
  expandBorderRadiusShorthandValue,
} from "../css-border-radius.js";
import { staticStringValue } from "./style-object-normalization.js";
import { splitCssValueWhitespace } from "../css-value-split.js";
import { cloneAstNode, isAstNode } from "../utilities/jscodeshift-utils.js";

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

/**
 * Checks whether a value is a media/pseudo map (object with `default` or `@`/`:` keys).
 */
export function isMediaOrPseudoMap(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
    return false;
  }
  const keys = Object.keys(v as Record<string, unknown>);
  return keys.includes("default") || keys.some((k) => k.startsWith(":") || k.startsWith("@"));
}

export function resolveBoxShorthandConflicts(styleObj: Record<string, unknown>): void {
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
export function resolveDirectionalConflicts(
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

export function harmonizeShorthandExpansion(
  styleObjs: ReadonlyArray<Record<string, unknown>>,
  options?: HarmonizeShorthandOptions,
): void {
  harmonizeBoxShorthandExpansion(styleObjs, options);
  harmonizeBorderRadiusExpansion(styleObjs, options);
}

/** Resolve a bucket object back to its `when` snapshot recorded during decl processing. */
export function bucketSnapshotLookup(
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

export function bucketSourceOrderLookup(
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

export function expandMultiValueBorderRadius(
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

/**
 * Emits a warning when a full shorthand property has an opaque (AST node) value
 * that StyleX will expand to longhands. If the value contains multiple parts
 * (e.g., "6px 12px"), each longhand will receive the full value, producing
 * invalid CSS. The adapter should use `directional` in resolveValue instead.
 */
export function warnOpaqueShorthands(
  styleObj: Record<string, unknown>,
  decl: StyledDecl,
  warnings: WarningLog[],
): void {
  for (const prop of OPAQUE_SHORTHAND_PROPS) {
    const val = styleObj[prop];
    if (val !== undefined && isAstNode(val) && !isProvenSingleTokenValue(val)) {
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
export function extractScalarDefault(value: unknown): unknown {
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
export function mergeExistingPseudoEntries(target: Record<string, unknown>, source: unknown): void {
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

// --- Non-exported helpers ---

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
