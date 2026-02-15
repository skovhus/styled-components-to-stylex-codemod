/**
 * Shared string formatting utilities.
 * Core concepts: casing conversions and whitespace normalization.
 */
/**
 * Capitalizes the first character of a string.
 * @example capitalize("hello") => "Hello"
 */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converts a kebab-case string to camelCase.
 * @example kebabToCamelCase("focus-visible") => "focusVisible"
 * @example kebabToCamelCase("placeholder-shown") => "placeholderShown"
 * @example kebabToCamelCase("hover") => "hover"
 */
export function kebabToCamelCase(s: string): string {
  return s.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Lowercases the first character of a string.
 * @example lowerFirst("Hello") => "hello"
 */
export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Removes non-alphanumeric characters (except underscores) from a string.
 * Useful for sanitizing strings to be valid JavaScript identifiers.
 * @example sanitizeIdentifier("my-var!") => "my_var_"
 */
export function sanitizeIdentifier(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Checks if a CSS value looks like a length unit (px, rem, em, %, etc.).
 * Matches numeric values with optional CSS length units.
 * @example looksLikeLength("10px") => true
 * @example looksLikeLength("1.5rem") => true
 * @example looksLikeLength("auto") => false
 */
export function looksLikeLength(token: string): boolean {
  return /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|svh|svw|dvh|dvw|cqw|cqh|%)?$/.test(token);
}

/**
 * Checks if a CSS value appears to be a background image (gradient or url).
 * @example isBackgroundImageValue("linear-gradient(red, blue)") => true
 * @example isBackgroundImageValue("url(image.png)") => true
 * @example isBackgroundImageValue("#fff") => false
 */
export function isBackgroundImageValue(value: string): boolean {
  return (
    /\b(linear|radial|conic|repeating-linear|repeating-radial|repeating-conic)-gradient\b/.test(
      value,
    ) || /\burl\s*\(/.test(value)
  );
}

/**
 * Escapes special regex characters in a string so it can be safely used in a RegExp.
 * @example escapeRegex("foo.bar") => "foo\\.bar"
 * @example escapeRegex("$test") => "\\$test"
 */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes whitespace in a CSS value string.
 * Collapses all sequences of whitespace (including newlines) to single spaces
 * and trims leading/trailing whitespace.
 *
 * This is useful for multiline template literals that are used for formatting
 * convenience but should produce compact CSS values.
 *
 * @example normalizeWhitespace("  foo\n    bar  ") => "foo bar"
 * @example normalizeWhitespace("\n  value  \n") => "value"
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
