/**
 * DOM attribute filtering (inline-to-intrinsic only)
 *
 * When we inline a styled component into a native DOM/SVG element, we remove the component boundary.
 * That can turn "custom" props (which styled-components might have forwarded) into invalid DOM attrs.
 *
 * We keep a small allowlist here to avoid leaking obvious non-DOM props while preserving the props
 * commonly used in fixtures. This is intentionally conservative and centralized so it's easy to audit.
 */
const KNOWN_SAFE_DOM_ATTRS = new Set<string>([
  // Core React props
  "className",
  "style",
  "ref",
  "key",

  // Common HTML/SVG attributes used throughout fixtures
  "id",
  "title",
  "role",
  "tabIndex",
  "href",
  "target",
  "rel",
  "type",
  "name",
  "value",
  "placeholder",
  "disabled",
  "readOnly",
  "htmlFor",
  "src",
  "alt",
  "width",
  "height",
  "viewBox",
  "d",
  "x",
  "y",
  "rx",
  "ry",
  "fill",
]);

export function isLikelyValidDomAttr(name: string): boolean {
  if (KNOWN_SAFE_DOM_ATTRS.has(name)) {
    return true;
  }
  if (name.startsWith("data-") || name.startsWith("aria-")) {
    return true;
  }
  // Event handlers: onClick, onChange, onMouseEnter, etc.
  if (/^on[A-Z]/.test(name)) {
    return true;
  }
  return false;
}
