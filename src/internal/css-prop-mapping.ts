import type { CssDeclarationIR, CssValue } from "./css-ir.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";

export type StylexPropDecl = { prop: string; value: CssValue };

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

  if (prop === "background") {
    const stylexProp =
      decl.value.kind === "static" && isBackgroundImageValue(decl.valueRaw)
        ? "backgroundImage"
        : "backgroundColor";
    return [{ prop: stylexProp, value: decl.value }];
  }

  if (prop === "border") {
    const raw = decl.valueRaw.trim();
    if (decl.value.kind === "interpolated") {
      return [{ prop: "border", value: decl.value }];
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
      return [{ prop: cssPropertyToStylexProp(prop), value: decl.value }];
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

/**
 * Check if a CSS value contains a gradient or image that requires `backgroundImage`
 * instead of `backgroundColor`. StyleX doesn't support the `background` shorthand.
 */
function isBackgroundImageValue(value: string): boolean {
  return (
    /\b(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\b/.test(
      value,
    ) || /\burl\s*\(/.test(value)
  );
}

const BORDER_STYLES = new Set([
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

function looksLikeLength(token: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|svh|svw|dvh|dvw|cqw|cqh|%)?$/.test(token);
}
