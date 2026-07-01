import { splitCssValueWhitespace } from "./css-value-split.js";

export const BORDER_RADIUS_LONGHAND_PROPS = [
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
] as const;

type BorderRadiusLonghands<T = string> = {
  topLeft: T;
  topRight: T;
  bottomRight: T;
  bottomLeft: T;
};

export function expandBorderRadiusInStyleObject(
  styleObj: Record<string, unknown>,
  expanded: BorderRadiusLonghands<unknown>,
  options?: { omitCorners?: ReadonlySet<string> },
): Record<string, unknown> {
  const entries = Object.entries(styleObj);
  const shorthandIndex = entries.findIndex(([key]) => key === "borderRadius");
  if (shorthandIndex < 0) {
    return styleObj;
  }

  const replacements = borderRadiusReplacementEntries(entries, shorthandIndex, expanded).filter(
    ([prop]) => !options?.omitCorners?.has(prop),
  );
  const next: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    if (key === "borderRadius") {
      for (const [prop, replacement] of replacements) {
        next[prop] = replacement;
      }
      continue;
    }
    if (isBorderRadiusLonghandProp(key)) {
      continue;
    }
    next[key] = value;
  }

  return next;
}

export function expandBorderRadiusShorthandValue(
  value: string,
  options?: { includeSingleValue?: boolean },
): BorderRadiusLonghands | null {
  if (value.includes("/")) {
    return null;
  }
  const parts = splitCssValueWhitespace(value.trim());
  const minParts = options?.includeSingleValue === true ? 1 : 2;
  if (parts.length < minParts || parts.length > 4) {
    return null;
  }
  const topLeft = parts[0];
  if (topLeft === undefined) {
    return null;
  }
  const topRight = parts[1] ?? topLeft;
  const bottomRight = parts[2] ?? topLeft;
  const bottomLeft = parts[3] ?? topRight;
  return { topLeft, topRight, bottomRight, bottomLeft };
}

const BORDER_RADIUS_LONGHAND_ENTRIES = [
  [BORDER_RADIUS_LONGHAND_PROPS[0], "topLeft"],
  [BORDER_RADIUS_LONGHAND_PROPS[1], "topRight"],
  [BORDER_RADIUS_LONGHAND_PROPS[2], "bottomRight"],
  [BORDER_RADIUS_LONGHAND_PROPS[3], "bottomLeft"],
] as const satisfies ReadonlyArray<readonly [string, keyof BorderRadiusLonghands<unknown>]>;

function borderRadiusReplacementEntries(
  entries: Array<[string, unknown]>,
  shorthandIndex: number,
  expanded: BorderRadiusLonghands<unknown>,
): Array<[string, unknown]> {
  return BORDER_RADIUS_LONGHAND_ENTRIES.map(([prop, corner]) => [
    prop,
    latestBorderRadiusCornerValue(entries, shorthandIndex, prop, expanded[corner]),
  ]);
}

function latestBorderRadiusCornerValue(
  entries: Array<[string, unknown]>,
  shorthandIndex: number,
  prop: string,
  shorthandValue: unknown,
): unknown {
  let latest = { index: shorthandIndex, value: shorthandValue };
  for (let index = shorthandIndex + 1; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }
    const [key, value] = entry;
    if (key === prop) {
      latest = {
        index,
        value: mergeConditionMapDefault(value, latest.value),
      };
    }
  }
  return latest.value;
}

function isBorderRadiusLonghandProp(prop: string): boolean {
  return BORDER_RADIUS_LONGHAND_ENTRIES.some(([longhand]) => prop === longhand);
}

function mergeConditionMapDefault(value: unknown, defaultValue: unknown): unknown {
  if (!isConditionMap(value)) {
    return value;
  }
  const merged = isConditionMap(defaultValue) ? { ...defaultValue, ...value } : { ...value };
  if (merged.default === null || merged.default === undefined) {
    merged.default = conditionMapDefault(defaultValue);
  }
  return merged;
}

function conditionMapDefault(value: unknown): unknown {
  return isConditionMap(value) ? value.default : value;
}

function isConditionMap(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.includes("default") || keys.some((key) => key.startsWith(":") || key.startsWith("@"));
}
