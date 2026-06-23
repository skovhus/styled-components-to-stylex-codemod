/**
 * Maps CSS declarations to StyleX properties and expands shorthands.
 * Core concepts: background resolution and shorthand splitting.
 */
import type { CssDeclarationIR, CssValue, CssValuePart } from "./css-ir.js";
import { expandBorderRadiusShorthandValue } from "./css-border-radius.js";
import { splitCssValueWhitespace } from "./css-value-split.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";
import {
  hasTopLevelMatch,
  isBackgroundImageValue,
  isSingleBackgroundComponent,
  looksLikeLength,
} from "./utilities/string-utils.js";

export {
  isCssShorthandProperty,
  isLogicalScrollAxisShorthand,
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
  // StyleX compiles the block-axis scroll-margin longhands to physical
  // `scroll-margin-top`/`scroll-margin-bottom`, which changes behavior in
  // vertical writing modes (the shorthand expands to those longhands, so it is
  // equally lossy). The inline-axis scroll-margin and all scroll-padding
  // logical properties are preserved losslessly and are supported.
  "scroll-margin-block",
  "scroll-margin-block-start",
  "scroll-margin-block-end",
]);

/**
 * Logical scroll shorthands that expand to Start/End longhands. StyleX's
 * valid-styles rule accepts only the longhand forms.
 */
const LOGICAL_SCROLL_AXIS_SHORTHANDS: Record<string, string> = {
  "scroll-margin-inline": "scrollMarginInline",
  "scroll-padding-block": "scrollPaddingBlock",
  "scroll-padding-inline": "scrollPaddingInline",
};

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

/**
 * True for the logical scroll axis shorthands (`scroll-margin-inline`,
 * `scroll-padding-block`, `scroll-padding-inline`). StyleX accepts only their
 * Start/End longhands, so a static value is expanded; a dynamic value cannot be
 * split losslessly and must bail.
 */
function isLogicalScrollAxisShorthand(cssProp: string): boolean {
  return cssProp.trim() in LOGICAL_SCROLL_AXIS_SHORTHANDS;
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

/**
 * Expands a static multi-component `background` shorthand (single layer) into
 * the full set of StyleX background longhands, e.g.
 * `#fff url(a.svg) no-repeat center / cover`. Components omitted from the
 * shorthand are emitted at their CSS initial value (e.g. `backgroundColor:
 * transparent`), reproducing the shorthand's reset semantics so the expansion
 * fully overrides any background longhand inherited from a merged/extended base.
 *
 * Returns null when the value cannot be expanded losslessly: multiple layers
 * (top-level commas), unrecognized tokens, duplicate components, or fewer than
 * two explicit components (single components keep the single-longhand path).
 */
export function expandBackgroundShorthandComponents(
  rawValue: string,
): Array<{ prop: string; value: string }> | null {
  const value = rawValue.trim();
  if (!value || hasTopLevelMatch(value, /,/)) {
    return null;
  }
  const tokens = tokenizeBackgroundValue(value);
  if (!tokens) {
    return null;
  }

  let color: string | undefined;
  let image: string | undefined;
  let attachment: string | undefined;
  const repeatTokens: string[] = [];
  const positionTokens: string[] = [];
  const sizeTokens: string[] = [];
  const boxTokens: string[] = [];
  let inSizeMode = false;

  for (const token of tokens) {
    if (token === "/") {
      if (inSizeMode || positionTokens.length === 0) {
        return null;
      }
      inSizeMode = true;
      continue;
    }
    if (inSizeMode) {
      if (sizeTokens.length >= 2 || !isBackgroundSizeToken(token)) {
        return null;
      }
      sizeTokens.push(token);
      continue;
    }
    if (token === "none" || isBackgroundImageValue(token)) {
      if (image !== undefined) {
        return null;
      }
      image = token;
      continue;
    }
    if (isCssColorToken(token)) {
      if (color !== undefined) {
        return null;
      }
      color = token;
      continue;
    }
    if (BACKGROUND_REPEAT_KEYWORDS.has(token)) {
      if (repeatTokens.length >= 2) {
        return null;
      }
      repeatTokens.push(token);
      continue;
    }
    if (BACKGROUND_ATTACHMENT_KEYWORDS.has(token)) {
      if (attachment !== undefined) {
        return null;
      }
      attachment = token;
      continue;
    }
    if (BACKGROUND_BOX_KEYWORDS.has(token)) {
      if (boxTokens.length >= 2) {
        return null;
      }
      boxTokens.push(token);
      continue;
    }
    if (isBackgroundPositionToken(token)) {
      if (positionTokens.length >= 2) {
        return null;
      }
      positionTokens.push(token);
      continue;
    }
    return null;
  }

  if (inSizeMode && sizeTokens.length === 0) {
    return null;
  }

  // Count explicitly-present components: a single component keeps the existing
  // single-longhand mapping path (handled by the caller).
  const presentCount =
    (color !== undefined ? 1 : 0) +
    (image !== undefined ? 1 : 0) +
    (attachment !== undefined ? 1 : 0) +
    (repeatTokens.length ? 1 : 0) +
    (positionTokens.length ? 1 : 0) +
    (sizeTokens.length ? 1 : 0) +
    (boxTokens.length ? 1 : 0);
  if (presentCount < 2) {
    return null;
  }

  // Emit every background longhand. Omitted components reset to their CSS
  // initial value, matching the shorthand's reset semantics, so the expansion
  // fully overrides any background longhand inherited from a merged/extended
  // base (e.g. a `styled(Base)` whose base sets `background-color`).
  return [
    { prop: "backgroundColor", value: color ?? "transparent" },
    { prop: "backgroundImage", value: image ?? "none" },
    { prop: "backgroundRepeat", value: repeatTokens.length ? repeatTokens.join(" ") : "repeat" },
    { prop: "backgroundAttachment", value: attachment ?? "scroll" },
    {
      prop: "backgroundPosition",
      value: positionTokens.length ? positionTokens.join(" ") : "0% 0%",
    },
    { prop: "backgroundSize", value: sizeTokens.length ? sizeTokens.join(" ") : "auto" },
    // Per spec, a single <box> value sets both origin and clip.
    { prop: "backgroundOrigin", value: boxTokens[0] ?? "padding-box" },
    { prop: "backgroundClip", value: boxTokens[1] ?? boxTokens[0] ?? "border-box" },
  ];
}

/**
 * Parse a `border` / `border-<side>` property into its StyleX directional
 * longhand prop names (and the PascalCase `direction` segment). Returns `null`
 * for any property that is not a (directional) border shorthand.
 */
export function borderLonghandProps(prop: string): {
  direction: string;
  widthProp: string;
  styleProp: string;
  colorProp: string;
} | null {
  const borderMatch = prop.match(/^border(-top|-right|-bottom|-left)?$/);
  if (!borderMatch) {
    return null;
  }
  const directionRaw = borderMatch[1] ?? "";
  const direction = directionRaw
    ? directionRaw.slice(1).charAt(0).toUpperCase() + directionRaw.slice(2)
    : "";
  return {
    direction,
    widthProp: `border${direction}Width`,
    styleProp: `border${direction}Style`,
    colorProp: `border${direction}Color`,
  };
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
  const longhand = borderLonghandProps(prop);
  if (!longhand) {
    return null;
  }
  const { widthProp, styleProp, colorProp } = longhand;

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

  // Logical scroll shorthands (e.g. `scroll-margin-inline: 4px 8px`) are valid
  // CSS but not accepted by StyleX's valid-styles rule; expand them to their
  // Start/End longhands, which StyleX preserves losslessly. Split at top-level
  // whitespace only so function arguments (e.g. `var(--gap, 1rem)`,
  // `calc(1px + 2px)`) are kept intact rather than broken apart.
  const logicalScrollAxis = LOGICAL_SCROLL_AXIS_SHORTHANDS[prop];
  if (logicalScrollAxis && decl.value.kind === "static") {
    const values = splitCssValueWhitespace(decl.valueRaw.trim());
    if (values.length >= 1 && values.length <= 2) {
      const start = values[0]!;
      const end = values[1] ?? start;
      const withImportant = (value: string): string =>
        decl.important ? `${value} !important` : value;
      return [
        {
          prop: `${logicalScrollAxis}Start`,
          value: { kind: "static", value: withImportant(start) },
        },
        { prop: `${logicalScrollAxis}End`, value: { kind: "static", value: withImportant(end) } },
      ];
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

  // `overflow: <x> <y>` two-value shorthand — StyleX's `overflow` type only accepts a
  // single keyword, so expand to the overflowX/overflowY longhands.
  if (prop === "overflow" && decl.value.kind === "static") {
    const tokens = decl.valueRaw.trim().split(/\s+/);
    if (tokens.length === 2) {
      return [
        { prop: "overflowX", value: { kind: "static", value: tokens[0]! } },
        { prop: "overflowY", value: { kind: "static", value: tokens[1]! } },
      ];
    }
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

const BACKGROUND_REPEAT_KEYWORDS = new Set([
  "repeat",
  "repeat-x",
  "repeat-y",
  "no-repeat",
  "space",
  "round",
]);

const BACKGROUND_ATTACHMENT_KEYWORDS = new Set(["scroll", "fixed", "local"]);

const BACKGROUND_BOX_KEYWORDS = new Set(["border-box", "padding-box", "content-box"]);

const BACKGROUND_POSITION_KEYWORDS = new Set(["left", "right", "top", "bottom", "center"]);

const CSS_COLOR_FUNCTION_RE = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i;

// Standard CSS named colors (CSS Color Module Level 4) plus transparent/currentcolor.
const CSS_NAMED_COLORS = new Set(
  (
    "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue " +
    "blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk " +
    "crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki " +
    "darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen " +
    "darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue " +
    "dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite " +
    "gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki " +
    "lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
    "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
    "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen " +
    "linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple " +
    "mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred " +
    "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab " +
    "orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip " +
    "peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue " +
    "saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue " +
    "slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet " +
    "wheat white whitesmoke yellow yellowgreen transparent currentcolor"
  ).split(" "),
);

function isCssColorToken(token: string): boolean {
  if (token.startsWith("#")) {
    return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(token);
  }
  if (CSS_COLOR_FUNCTION_RE.test(token)) {
    return true;
  }
  return CSS_NAMED_COLORS.has(token.toLowerCase());
}

function isBackgroundPositionToken(token: string): boolean {
  return (
    BACKGROUND_POSITION_KEYWORDS.has(token.toLowerCase()) ||
    /^-?\d*\.?\d+(?:[a-z%]*)$/i.test(token) ||
    /^calc\(/i.test(token)
  );
}

function isBackgroundSizeToken(token: string): boolean {
  const lower = token.toLowerCase();
  return (
    lower === "cover" ||
    lower === "contain" ||
    lower === "auto" ||
    /^-?\d*\.?\d+(?:[a-z%]*)$/i.test(token) ||
    /^calc\(/i.test(token)
  );
}

/**
 * Splits a background shorthand value into top-level tokens, keeping function
 * calls intact and emitting `/` (position/size separator) as its own token.
 * Returns null for values containing placeholders or unbalanced parens.
 */
function tokenizeBackgroundValue(value: string): string[] | null {
  if (value.includes("__SC_EXPR_")) {
    return null;
  }
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  const flush = (): void => {
    if (current) {
      tokens.push(current);
      current = "";
    }
  };
  for (const c of value) {
    if (c === "(") {
      depth++;
      current += c;
      continue;
    }
    if (c === ")") {
      depth = Math.max(0, depth - 1);
      current += c;
      continue;
    }
    if (depth === 0 && /\s/.test(c)) {
      flush();
      continue;
    }
    if (depth === 0 && c === "/") {
      flush();
      tokens.push("/");
      continue;
    }
    current += c;
  }
  if (depth !== 0) {
    return null;
  }
  flush();
  return tokens.length ? tokens : null;
}
