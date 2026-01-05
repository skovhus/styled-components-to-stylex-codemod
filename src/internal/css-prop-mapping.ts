import type { CssDeclarationIR, CssValue } from "./css-ir.js";

export type StylexPropDecl = { prop: string; value: CssValue };

export function cssDeclarationToStylexDeclarations(decl: CssDeclarationIR): StylexPropDecl[] {
  const prop = decl.property.trim();

  if (prop === "background") return [{ prop: "backgroundColor", value: decl.value }];

  if (prop === "border") {
    const raw = decl.valueRaw.trim();
    if (decl.value.kind === "interpolated") return [{ prop: "border", value: decl.value }];
    return borderShorthandToStylex(raw);
  }

  return [{ prop: cssPropertyToStylexProp(prop), value: decl.value }];
}

export function cssPropertyToStylexProp(prop: string): string {
  if (prop.startsWith("--")) return prop;
  return prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function borderShorthandToStylex(valueRaw: string): StylexPropDecl[] {
  const v = valueRaw.trim();
  if (v === "none") {
    return [
      { prop: "borderWidth", value: { kind: "static", value: "0" } },
      { prop: "borderStyle", value: { kind: "static", value: "none" } },
    ];
  }

  const tokens = v.split(/\s+/);
  const borderStyles = new Set([
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

  let width: string | undefined;
  let style: string | undefined;
  const colorParts: string[] = [];

  for (const token of tokens) {
    if (!width && looksLikeLength(token)) {
      width = token;
      continue;
    }
    if (!style && borderStyles.has(token)) {
      style = token;
      continue;
    }
    colorParts.push(token);
  }

  const color = colorParts.join(" ").trim();
  const out: StylexPropDecl[] = [];
  if (width) out.push({ prop: "borderWidth", value: { kind: "static", value: width } });
  if (style) out.push({ prop: "borderStyle", value: { kind: "static", value: style } });
  if (color) out.push({ prop: "borderColor", value: { kind: "static", value: color } });
  if (out.length === 0) return [{ prop: "border", value: { kind: "static", value: v } }];
  return out;
}

function looksLikeLength(token: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|%)?$/.test(token);
}
