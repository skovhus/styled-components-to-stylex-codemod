/**
 * Shared pattern-matching and placeholder interpolation for declarative mappings.
 * Used by themeMapping, callMapping, selectorMapping, and cssVariableMapping resolvers.
 */

/* ── Exports ─────────────────────────────────────────────────────────── */

type PatternMatch = { property: string };

/** Sentinel: no entry in the mapping matched — fall through to the imperative hook. */
export const MAPPING_NO_MATCH = Symbol("MAPPING_NO_MATCH");

/**
 * Match a pattern string against a lookup key.
 *
 * Supported patterns:
 * - `"*"` — catch-all wildcard; `property` = last segment (after last `.`)
 * - `"color.*"` — prefix match; `property` = remainder after `prefix.`
 * - `"color"` — exact match; `property` = `""`
 */
export function matchPattern(pattern: string, key: string): PatternMatch | null {
  if (pattern === "*") {
    const lastDot = key.lastIndexOf(".");
    return { property: lastDot >= 0 ? key.slice(lastDot + 1) : key };
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    if (key.startsWith(prefix + ".")) {
      return { property: key.slice(prefix.length + 1) };
    }
    if (key === prefix) {
      return { property: "" };
    }
    return null;
  }
  if (key === pattern) {
    return { property: "" };
  }
  return null;
}

/**
 * Replace `{property}` and `{cssProperty}` placeholders in an expression template.
 */
export function interpolateExpr(
  template: string,
  match: PatternMatch,
  ctx: { cssProperty?: string },
): string {
  let result = template;
  if (result.includes("{property}")) {
    result = result.replace(/\{property\}/g, match.property);
  }
  if (result.includes("{cssProperty}")) {
    const camelProp = ctx.cssProperty
      ? ctx.cssProperty.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      : "";
    result = result.replace(/\{cssProperty\}/g, camelProp);
  }
  return result;
}
