import type { StyledDecl } from "../transform-types.js";

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
  button: "HTMLButtonElement",
  div: "HTMLDivElement",
  form: "HTMLFormElement",
  h1: "HTMLHeadingElement",
  h2: "HTMLHeadingElement",
  h3: "HTMLHeadingElement",
  h4: "HTMLHeadingElement",
  h5: "HTMLHeadingElement",
  h6: "HTMLHeadingElement",
  img: "HTMLImageElement",
  input: "HTMLInputElement",
  label: "HTMLLabelElement",
  li: "HTMLLIElement",
  nav: "HTMLElement",
  ol: "HTMLOListElement",
  p: "HTMLParagraphElement",
  section: "HTMLElement",
  select: "HTMLSelectElement",
  span: "HTMLSpanElement",
  table: "HTMLTableElement",
  textarea: "HTMLTextAreaElement",
  ul: "HTMLUListElement",
};

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
