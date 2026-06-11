/**
 * Maps CSS declarations to StyleX properties and expands shorthands.
 * Core concepts: background resolution and shorthand splitting.
 */
import type { CssDeclarationIR, CssValue, CssValuePart } from "./css-ir.js";
import { expandBorderRadiusShorthandValue } from "./css-border-radius.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";
import {
  isBackgroundImageValue,
  isSingleBackgroundComponent,
  looksLikeLength,
} from "./utilities/string-utils.js";

export {
  isCssShorthandProperty,
  isUnsupportedStylexProperty,
  isUnsupportedBackgroundShorthandValue,
  isStylexStringOnlyCssProp,
  setUseLogicalProperties,
  getUseLogicalProperties,
};

type StylexPropDecl = { prop: string; value: CssValue };

/** Module-level flag controlling whether 2-value shorthand expansion uses logical properties. */
let useLogicalProperties = false;

function setUseLogicalProperties(value: boolean): void {
  useLogicalProperties = value;
}

function getUseLogicalProperties(): boolean {
  return useLogicalProperties;
}

function isStylexStringOnlyCssProp(prop: string): boolean {
  return STYLEX_STRING_ONLY_CSS_PROPS.has(prop);
}

type DirectionalProp = "padding" | "margin" | "scrollMargin" | "scrollPadding";

const DIRECTIONAL_SHORTHAND_MAP: Record<string, DirectionalProp> = {
  padding: "padding",
  margin: "margin",
  "scroll-margin": "scrollMargin",
  "scroll-padding": "scrollPadding",
};

/**
 * CSS properties that accept numeric values in standard CSS / React inline styles
 * but are typed as `string` in StyleX. Numeric values must be emitted as strings.
 */
const STYLEX_STRING_ONLY_CSS_PROPS = new Set([
  "gridRow",
  "gridColumn",
  "gridRowStart",
  "gridRowEnd",
  "gridColumnStart",
  "gridColumnEnd",
  "outlineOffset",
  "outlineWidth",
]);

const GRID_LINE_STYLEX_PROPS = new Set(["gridArea", "gridColumn", "gridRow"]);

const UNSUPPORTED_STYLEX_CSS_PROPS = new Set([
  // StyleX rejects the CSS-wide reset property. It is too broad to expand
  // safely without element-specific knowledge, so callers should bail instead
  // of emitting `all` into stylex.create().
  "all",
  // StyleX does not currently accept logical scroll longhands, and converting
  // them to physical sides would change behavior in RTL or vertical writing modes.
  "scroll-margin-block",
  "scroll-margin-block-start",
  "scroll-margin-block-end",
  "scroll-margin-inline",
  "scroll-margin-inline-start",
  "scroll-margin-inline-end",
  "scroll-padding-block",
  "scroll-padding-block-start",
  "scroll-padding-block-end",
  "scroll-padding-inline",
  "scroll-padding-inline-start",
  "scroll-padding-inline-end",
]);

/**
 * Returns true if the CSS property is a shorthand that StyleX cannot express directly
 * and requires expansion (e.g., `padding`, `margin`, `border`, `background`).
 */
function isCssShorthandProperty(cssProp: string): boolean {
  return (
    cssProp in DIRECTIONAL_SHORTHAND_MAP ||
    cssProp === "border" ||
    /^border-(top|right|bottom|left)$/.test(cssProp) ||
    cssProp === "background"
  );
}

function isUnsupportedStylexProperty(cssProp: string): boolean {
  return UNSUPPORTED_STYLEX_CSS_PROPS.has(cssProp.trim());
}

function isUnsupportedBackgroundShorthandValue(rawValue: string): boolean {
  const value = rawValue.trim();
  return value !== "none" && !isSingleBackgroundComponent(value);
}

/**
 * For a `background` CSS property, determine the appropriate StyleX property name.
 * Returns `backgroundImage` for gradients/images, `backgroundColor` for colors.
 */
export function resolveBackgroundStylexProp(value: string): "backgroundImage" | "backgroundColor" {
  return isBackgroundImageValue(value) ? "backgroundImage" : "backgroundColor";
}

/**
 * For a `background` CSS property with multiple variant values, determine the
 * appropriate StyleX property name if all values are consistent.
 * Returns null if values are heterogeneous (mix of gradients and colors).
 */
export function resolveBackgroundStylexPropForVariants(
  values: string[],
): "backgroundImage" | "backgroundColor" | null {
  const hasGradient = values.some(isBackgroundImageValue);
  const hasColor = values.some((v) => !isBackgroundImageValue(v));
  if (hasGradient && hasColor) {
    return null; // Heterogeneous - can't safely transform
  }
  return hasGradient ? "backgroundImage" : "backgroundColor";
}

export function parseInterpolatedBorderStaticParts(args: {
  prop: string;
  prefix: string;
  suffix: string;
}): {
  widthProp: string;
  styleProp: string;
  colorProp: string;
  width?: string;
  style?: string;
} | null {
  const { prop, prefix, suffix } = args;
  const borderMatch = prop.match(/^border(-top|-right|-bottom|-left)?$/);
  if (!borderMatch) {
    return null;
  }
  const directionRaw = borderMatch[1] ?? "";
  const direction = directionRaw
    ? directionRaw.slice(1).charAt(0).toUpperCase() + directionRaw.slice(2)
    : "";
  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;

  const tokens = `${prefix}${suffix}`.trim().split(/\s+/).filter(Boolean);
  let width: string | undefined;
  let style: string | undefined;
  for (const token of tokens) {
    if (!width && looksLikeLength(token)) {
      width = token;
      continue;
    }
    if (!style && BORDER_STYLES.has(token)) {
      style = token;
      continue;
    }
    return null;
  }
  if (!width && !style) {
    return null;
  }
  return { widthProp, styleProp, colorProp, width, style };
}

export function parseBorderShorthandParts(valueRaw: string): {
  width?: string;
  style?: string;
  color?: string;
} | null {
  const tokens = valueRaw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }
  return classifyBorderTokens(tokens);
}

/**
 * Converts a CSS declaration to StyleX property declarations.
 *
 * IMPORTANT: StyleX does not support CSS shorthand properties like `border`, `margin`, `padding`.
 * This function expands shorthands to their longhand equivalents (e.g., `border` → `borderWidth`,
 * `borderStyle`, `borderColor`).
 *
 * When adding new CSS-to-StyleX conversion logic elsewhere in the codebase:
 * - ALWAYS use this function or its helpers (like `parseInterpolatedBorderStaticParts`)
 * - NEVER directly map CSS property names to StyleX without considering shorthand expansion
 * - For interpolated/dynamic values, see `lower-rules/borders.ts` for border handling patterns
 *
 * @see parseInterpolatedBorderStaticParts - For parsing border shorthands with dynamic color values
 * @see lower-rules/borders.ts - For handling interpolated border values in styled-components
 */
export function cssDeclarationToStylexDeclarations(decl: CssDeclarationIR): StylexPropDecl[] {
  const prop = decl.property.trim();

  const directionalProp = DIRECTIONAL_SHORTHAND_MAP[prop];
  if (directionalProp && decl.value.kind === "static") {
    const entries = splitDirectionalProperty({
      prop: directionalProp,
      rawValue: decl.valueRaw.trim(),
      important: decl.important,
      useLogical: useLogicalProperties,
    });
    if (entries.length > 0) {
      return entries.map((entry) => ({
        prop: entry.prop,
        value: { kind: "static", value: entry.value },
      }));
    }
  }

  if (prop === "background") {
    const rawVal = (decl.valueRaw ?? "").trim();
    // `background: none` resets the image layer and color. StyleX cannot emit
    // the shorthand, so preserve the visible reset with longhands.
    if (rawVal === "none") {
      return [
        { prop: "backgroundImage", value: decl.value },
        { prop: "backgroundColor", value: { kind: "static", value: "transparent" } },
      ];
    }
    const stylexProp = resolveBackgroundStylexProp(rawVal);
    return [{ prop: stylexProp, value: decl.value }];
  }

  if (prop === "display" && decl.value.kind === "static" && decl.valueRaw.trim() === "wrap") {
    return [];
  }

  if (prop === "animation" && decl.value.kind === "static" && decl.valueRaw.trim() === "none") {
    return [{ prop: "animationName", value: decl.value }];
  }

  if (prop === "border") {
    const raw = decl.valueRaw.trim();
    if (decl.value.kind === "interpolated") {
      return expandInterpolatedBorder(prop, "", decl.value);
    }
    return borderShorthandToStylex(raw, "");
  }

  if (prop === "border-radius" && decl.value.kind === "static") {
    const expanded = borderRadiusShorthandToStylex(decl.valueRaw.trim());
    if (expanded.length > 0) {
      return expanded.map(({ prop, value }) => ({
        prop,
        value: { kind: "static", value },
      }));
    }
  }

  // Handle directional border shorthands: border-top, border-right, border-bottom, border-left
  const borderDirectionMatch = prop.match(/^border-(top|right|bottom|left)$/);
  if (borderDirectionMatch) {
    const direction = borderDirectionMatch[1]!;
    const directionCapitalized = direction.charAt(0).toUpperCase() + direction.slice(1);
    const raw = decl.valueRaw.trim();
    if (decl.value.kind === "interpolated") {
      return expandInterpolatedBorder(prop, directionCapitalized, decl.value);
    }
    return borderShorthandToStylex(raw, directionCapitalized);
  }

  const stylexProp = cssPropertyToStylexProp(prop);
  return [{ prop: stylexProp, value: normalizeGridLineSlashSpacing(stylexProp, decl.value) }];
}

export function cssPropertyToStylexProp(prop: string): string {
  if (prop.startsWith("--")) {
    return prop;
  }
  return prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

// --- Non-exported helpers ---

export const BORDER_STYLES = new Set([
  "none",
  "solid",
  "dashed",
  "dotted",
  "double",
  "groove",
  "ridge",
  "inset",
  "outset",
]);

function normalizeGridLineSlashSpacing(stylexProp: string, value: CssValue): CssValue {
  if (!GRID_LINE_STYLEX_PROPS.has(stylexProp) || value.kind !== "static") {
    return value;
  }
  return { kind: "static", value: normalizeUnescapedSlashSpacing(value.value) };
}

function borderRadiusShorthandToStylex(raw: string): Array<{ prop: string; value: string }> {
  const expanded = expandBorderRadiusShorthandValue(raw);
  if (!expanded) {
    return [];
  }
  return [
    { prop: "borderTopLeftRadius", value: expanded.topLeft },
    { prop: "borderTopRightRadius", value: expanded.topRight },
    { prop: "borderBottomRightRadius", value: expanded.bottomRight },
    { prop: "borderBottomLeftRadius", value: expanded.bottomLeft },
  ];
}

function normalizeUnescapedSlashSpacing(value: string): string {
  let output = "";
  for (let index = 0; index < value.length; index++) {
    const char = value.charAt(index);
    if (char === "/" && !isEscapedAt(value, index)) {
      output = output.replace(/\s+$/g, "");
      output += " / ";
      while (index + 1 < value.length && /\s/.test(value.charAt(index + 1))) {
        index++;
      }
      continue;
    }
    output += char;
  }
  return output;
}

function isEscapedAt(value: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value.charAt(cursor) === "\\"; cursor--) {
    backslashCount++;
  }
  return backslashCount % 2 === 1;
}

/**
 * Expands an interpolated border shorthand into separate width/style/color properties.
 * Extracts static width and style tokens from the value parts, leaving the interpolated
 * expression(s) as the color value.
 */
function expandInterpolatedBorder(
  prop: string,
  direction: string,
  value: CssValue & { kind: "interpolated" },
): StylexPropDecl[] {
  const parts = value.parts;
  const slotParts = parts.filter((p): p is CssValuePart & { kind: "slot" } => p.kind === "slot");
  const singleSlot = slotParts.length === 1 ? slotParts[0] : undefined;
  if (!singleSlot) {
    // Multiple slots — can't reliably determine which is the color
    return [{ prop: direction ? `border${direction}` : "border", value }];
  }

  // Extract prefix (static text before the slot) and suffix (after)
  const slotIndex = parts.indexOf(singleSlot);
  const prefix = parts
    .slice(0, slotIndex)
    .filter((p): p is CssValuePart & { kind: "static" } => p.kind === "static")
    .map((p) => p.value)
    .join("")
    .trim();
  const suffix = parts
    .slice(slotIndex + 1)
    .filter((p): p is CssValuePart & { kind: "static" } => p.kind === "static")
    .map((p) => p.value)
    .join("")
    .trim();

  const borderParts = parseInterpolatedBorderStaticParts({ prop, prefix, suffix });
  if (!borderParts) {
    return [{ prop: direction ? `border${direction}` : "border", value }];
  }

  const result: StylexPropDecl[] = [];
  if (borderParts.width) {
    result.push({
      prop: borderParts.widthProp,
      value: { kind: "static", value: borderParts.width },
    });
  }
  if (borderParts.style) {
    result.push({
      prop: borderParts.styleProp,
      value: { kind: "static", value: borderParts.style },
    });
  }
  // Color gets the interpolated value — strip static prefix/suffix so the value
  // contains only the slot expression(s)
  const colorParts: CssValuePart[] = [{ kind: "slot", slotId: singleSlot.slotId }];
  result.push({ prop: borderParts.colorProp, value: { kind: "interpolated", parts: colorParts } });
  return result;
}

/**
 * Expands a border shorthand value into separate width/style/color properties.
 * @param valueRaw - The raw CSS value like "1px solid red"
 * @param direction - Optional direction suffix like "Top", "Right", "Bottom", "Left"
 *                    Empty string for the base "border" property
 */
function borderShorthandToStylex(valueRaw: string, direction: string): StylexPropDecl[] {
  const v = valueRaw.trim();
  const widthProp = `border${direction}Width`;
  const styleProp = `border${direction}Style`;
  const colorProp = `border${direction}Color`;
  const baseProp = direction ? `border${direction}` : "border";

  if (v === "none") {
    return [
      { prop: widthProp, value: { kind: "static", value: "0" } },
      { prop: styleProp, value: { kind: "static", value: "none" } },
      { prop: colorProp, value: { kind: "static", value: "initial" } },
    ];
  }

  const classified = classifyBorderTokens(v.split(/\s+/));
  if (!classified) {
    return [{ prop: baseProp, value: { kind: "static", value: v } }];
  }
  const out: StylexPropDecl[] = [];
  if (classified.width) {
    out.push({ prop: widthProp, value: { kind: "static", value: classified.width } });
  }
  if (classified.style) {
    out.push({ prop: styleProp, value: { kind: "static", value: classified.style } });
  }
  if (classified.color) {
    out.push({ prop: colorProp, value: { kind: "static", value: classified.color } });
  }
  return out.length > 0 ? out : [{ prop: baseProp, value: { kind: "static", value: v } }];
}

/**
 * Classifies whitespace-separated border shorthand tokens into width, style, and color.
 * Returns null if no tokens could be classified.
 */
function classifyBorderTokens(tokens: string[]): {
  width?: string;
  style?: string;
  color?: string;
} | null {
  let width: string | undefined;
  let style: string | undefined;
  const colorParts: string[] = [];
  for (const token of tokens) {
    if (!width && looksLikeLength(token)) {
      width = token;
      continue;
    }
    if (!style && BORDER_STYLES.has(token)) {
      style = token;
      continue;
    }
    colorParts.push(token);
  }
  const color = colorParts.join(" ").trim() || undefined;
  if (!width && !style && !color) {
    return null;
  }
  return { width, style, color };
}
