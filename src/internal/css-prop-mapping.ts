/**
 * Maps CSS declarations to StyleX properties and expands shorthands.
 * Core concepts: background resolution and shorthand splitting.
 */
import type { CssDeclarationIR, CssValue, CssValuePart } from "./css-ir.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";
import { isBackgroundImageValue, looksLikeLength } from "./utilities/string-utils.js";

type StylexPropDecl = { prop: string; value: CssValue };

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
  const color = colorParts.join(" ").trim();
  if (!width && !style && !color) {
    return null;
  }
  return { width, style, color: color || undefined };
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

  if ((prop === "padding" || prop === "margin") && decl.value.kind === "static") {
    const entries = splitDirectionalProperty({
      prop,
      rawValue: decl.valueRaw.trim(),
      important: decl.important,
    });
    if (entries.length > 0) {
      return entries.map((entry) => ({
        prop: entry.prop,
        value: { kind: "static", value: entry.value },
      }));
    }
  }

  if (prop === "scroll-margin" && decl.value.kind === "static") {
    const entries = splitDirectionalProperty({
      prop: "scrollMargin",
      rawValue: decl.valueRaw.trim(),
      important: decl.important,
      alwaysExpand: true,
    });
    if (entries.length > 0) {
      const order = new Map([
        ["scrollMarginLeft", 0],
        ["scrollMarginTop", 1],
        ["scrollMarginRight", 2],
        ["scrollMarginBottom", 3],
      ]);
      return entries
        .slice()
        .sort((a, b) => (order.get(a.prop) ?? 99) - (order.get(b.prop) ?? 99))
        .map((entry) => ({
          prop: entry.prop,
          value: { kind: "static", value: entry.value },
        }));
    }
  }

  if (prop === "scroll-padding" && decl.value.kind === "static") {
    const entries = splitDirectionalProperty({
      prop: "scrollPadding",
      rawValue: decl.valueRaw.trim(),
      important: decl.important,
      alwaysExpand: true,
    });
    if (entries.length > 0) {
      const order = new Map([
        ["scrollPaddingLeft", 0],
        ["scrollPaddingTop", 1],
        ["scrollPaddingRight", 2],
        ["scrollPaddingBottom", 3],
      ]);
      return entries
        .slice()
        .sort((a, b) => (order.get(a.prop) ?? 99) - (order.get(b.prop) ?? 99))
        .map((entry) => ({
          prop: entry.prop,
          value: { kind: "static", value: entry.value },
        }));
    }
  }

  if (prop === "background") {
    const stylexProp = resolveBackgroundStylexProp(decl.valueRaw ?? "");
    return [{ prop: stylexProp, value: decl.value }];
  }

  if (prop === "border") {
    const raw = decl.valueRaw.trim();
    if (decl.value.kind === "interpolated") {
      return expandInterpolatedBorder(prop, "", decl.value);
    }
    return borderShorthandToStylex(raw, "");
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

  return [{ prop: cssPropertyToStylexProp(prop), value: decl.value }];
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

  const tokens = v.split(/\s+/);

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

  const color = colorParts.join(" ").trim();
  const out: StylexPropDecl[] = [];
  if (width) {
    out.push({ prop: widthProp, value: { kind: "static", value: width } });
  }
  if (style) {
    out.push({ prop: styleProp, value: { kind: "static", value: style } });
  }
  if (color) {
    out.push({ prop: colorProp, value: { kind: "static", value: color } });
  }
  if (out.length === 0) {
    return [{ prop: baseProp, value: { kind: "static", value: v } }];
  }
  return out;
}
