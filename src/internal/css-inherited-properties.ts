/**
 * CSS properties that are inherited by default.
 * Setting these on a parent element propagates the value to all descendants,
 * making `& * { prop: value }` equivalent to setting the property on the parent.
 *
 * Source of truth: W3C CSS2 full property table (https://www.w3.org/TR/CSS2/propidx.html)
 * plus CSS3+ properties verified against MDN formal definitions ("Inherited: yes").
 * Excludes deprecated aural CSS properties (azimuth, speak, voice-family, etc.).
 */

const CSS_INHERITED_PROPERTIES: ReadonlySet<string> = new Set([
  // Text and font
  "color",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-variant",
  "font-stretch",
  "font-size-adjust",
  "font-optical-sizing",
  "font-kerning",
  "font-feature-settings",
  "font-variation-settings",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-indent",
  "text-transform",
  "text-wrap",
  "white-space",
  "word-break",
  "overflow-wrap",
  "word-wrap",
  "hyphens",
  "tab-size",
  "text-shadow",
  "text-decoration-skip-ink",
  "text-underline-offset",
  "text-underline-position",

  // List
  "list-style",
  "list-style-type",
  "list-style-position",
  "list-style-image",

  // Table
  "border-collapse",
  "border-spacing",
  "caption-side",
  "empty-cells",

  // UI and interaction
  "cursor",
  "visibility",
  "pointer-events",
  "accent-color",
  "caret-color",
  "color-scheme",

  // Writing and direction
  "direction",
  "writing-mode",
  "text-orientation",
  "quotes",
  "orphans",
  "widows",
]);

/**
 * Check if a CSS property is inherited by default.
 * Custom properties (--*) are also inherited.
 */
export function isCssInheritedProperty(property: string): boolean {
  return property.startsWith("--") || CSS_INHERITED_PROPERTIES.has(property);
}
