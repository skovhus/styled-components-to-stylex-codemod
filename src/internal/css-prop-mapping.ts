import type { CssDeclarationIR, CssValue } from "./css-ir.js";

export type StylexPropDecl = { prop: string; value: CssValue };

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

export function cssDeclarationToStylexDeclarations(decl: CssDeclarationIR): StylexPropDecl[] {
  const prop = decl.property.trim();

  if (prop === "background") {
    return [{ prop: "backgroundColor", value: decl.value }];
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
