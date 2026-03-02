/**
 * Helper utilities for wrapper typing and element metadata.
 * Core concepts: variant sorting and intrinsic tag classification.
 */
import type { StyledDecl } from "../transform-types.js";
import { SX_PROP_TYPE_TEXT } from "./wrapper-emitter.js";

/**
 * Sorts variant style entries by condition specificity.
 * Less specific conditions (fewer && operators) come before more specific ones.
 * This ensures base styles are applied before override styles in stylex.props.
 */
export function sortVariantEntriesBySpecificity<T>(
  entries: Array<[string, T]>,
): Array<[string, T]> {
  const countAndOps = (s: string): number => (s.match(/&&/g) || []).length;
  return entries.slice().sort(([a], [b]) => countAndOps(a) - countAndOps(b));
}

export const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

// Mapping from HTML tag names to their corresponding HTMLElement types
// Used to generate correct ref types for .attrs({ as: "tag" }) patterns
export const TAG_TO_HTML_ELEMENT: Record<string, string> = {
  a: "HTMLAnchorElement",
  article: "HTMLElement",
  aside: "HTMLElement",
  button: "HTMLButtonElement",
  div: "HTMLDivElement",
  footer: "HTMLElement",
  form: "HTMLFormElement",
  h1: "HTMLHeadingElement",
  h2: "HTMLHeadingElement",
  h3: "HTMLHeadingElement",
  h4: "HTMLHeadingElement",
  h5: "HTMLHeadingElement",
  h6: "HTMLHeadingElement",
  header: "HTMLElement",
  hr: "HTMLHRElement",
  img: "HTMLImageElement",
  input: "HTMLInputElement",
  label: "HTMLLabelElement",
  li: "HTMLLIElement",
  main: "HTMLElement",
  nav: "HTMLElement",
  ol: "HTMLOListElement",
  p: "HTMLParagraphElement",
  section: "HTMLElement",
  select: "HTMLSelectElement",
  span: "HTMLSpanElement",
  table: "HTMLTableElement",
  td: "HTMLTableCellElement",
  textarea: "HTMLTextAreaElement",
  th: "HTMLTableCellElement",
  ul: "HTMLUListElement",
  // SVG elements
  circle: "SVGCircleElement",
  ellipse: "SVGEllipseElement",
  g: "SVGGElement",
  line: "SVGLineElement",
  path: "SVGPathElement",
  polygon: "SVGPolygonElement",
  polyline: "SVGPolylineElement",
  rect: "SVGRectElement",
  svg: "SVGSVGElement",
  text: "SVGTextElement",
  use: "SVGUseElement",
};

/**
 * Builds a map from prop name to variant object name for dimensions
 * that derive their prop type via `keyof typeof variantObj`.
 * Shared by emit-intrinsic-simple and emit-intrinsic-should-forward-prop.
 */
export function buildVariantDimPropTypeMap(d: StyledDecl): Map<string, string> {
  return new Map(
    (d.variantDimensions ?? [])
      .filter((dim) => dim.propTypeFromKeyof)
      .map((dim) => [dim.propName, dim.variantObjectName]),
  );
}

export function getAttrsAsString(d: StyledDecl): string | null {
  const v = d.attrsInfo?.staticAttrs?.as;
  return typeof v === "string" ? v : null;
}

export function injectRefPropIntoTypeLiteralString(
  typeText: string,
  refElementType: string,
): string {
  // If it's already there, don't add it again.
  if (/\bref\s*\?\s*:/.test(typeText)) {
    return typeText;
  }
  const trimmed = typeText.trim();
  // Best-effort: if this is a type literal (`{ ... }`), inject before the final `}`.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const indent = "\n  ";
    const injection = `${indent}ref?: React.Ref<${refElementType}>;`;
    // Keep the closing brace on its own line when multiline.
    if (trimmed.includes("\n")) {
      return typeText.replace(/\n\}$/, `${injection}\n}`);
    }
    return typeText.replace(/\}$/, `${injection} }`);
  }
  // Fallback: intersect with a minimal ref prop type.
  return `${typeText} & { ref?: React.Ref<${refElementType}> }`;
}

/**
 * Injects className and/or style props at the start of a type literal string.
 * Used when wrapping external components that may not have these props in their type.
 */
export function injectStylePropsIntoTypeLiteralString(
  typeText: string,
  options: { className?: boolean; style?: boolean; sx?: boolean },
): string {
  const propsToAdd: string[] = [];
  // Match both optional (className?:) and required (className:) declarations
  if (options.className && !/\bclassName\s*\??\s*:/.test(typeText)) {
    propsToAdd.push("className?: string");
  }
  if (options.style && !/\bstyle\s*\??\s*:/.test(typeText)) {
    propsToAdd.push("style?: React.CSSProperties");
  }
  if (options.sx && !/\bsx\s*\??\s*:/.test(typeText)) {
    propsToAdd.push(SX_PROP_TYPE_TEXT);
  }
  if (propsToAdd.length === 0) {
    return typeText;
  }
  const trimmed = typeText.trim();
  // Best-effort: if this is a type literal (`{ ... }`), inject at the start.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const injection = propsToAdd.join(", ");
    // Check if the literal has content (not just `{}`)
    const innerContent = trimmed.slice(1, -1).trim();
    if (innerContent) {
      // Insert after opening brace, before existing content
      return typeText.replace(/^\{\s*/, `{ ${injection}; `);
    }
    // Empty literal - just add the props
    return `{ ${injection} }`;
  }
  // Fallback: intersect with a minimal props type.
  return `${typeText} & { ${propsToAdd.join(", ")} }`;
}
