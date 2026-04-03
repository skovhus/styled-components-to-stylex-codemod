/**
 * Resolves theme lookups from a declarative ThemeMapping configuration.
 * Core concepts: pattern matching, placeholder interpolation, first-match-wins.
 */
import type {
  ResolveValueDirectionalResult,
  ResolveValueResult,
  ThemeMapping,
  ThemeMappingValue,
} from "../adapter.js";

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

/** Sentinel: no entry in the mapping matched — fall through to resolveValue. */
export const THEME_MAPPING_NO_MATCH = Symbol("THEME_MAPPING_NO_MATCH");

type ThemeMappingResult =
  | ResolveValueResult
  | ResolveValueDirectionalResult
  | typeof THEME_MAPPING_NO_MATCH
  | undefined; // undefined = bail

/**
 * Resolve a theme lookup against a declarative ThemeMapping.
 *
 * Returns:
 * - A `ResolveValueResult` or `ResolveValueDirectionalResult` on match
 * - `undefined` when a bail entry matched (caller should bail)
 * - `THEME_MAPPING_NO_MATCH` when no entry matched (caller should fall through)
 */
export function resolveThemeFromMapping(
  mapping: ThemeMapping,
  ctx: {
    path: string;
    cssProperty?: string;
    indexedLookup?: boolean;
  },
): ThemeMappingResult {
  for (const [pattern, entry] of mapping) {
    const match = matchPattern(pattern, ctx.path);
    if (!match) {
      continue;
    }

    // Guard: indexed entries only match when ctx.indexedLookup is true
    if (isResolveEntry(entry) && entry.indexed && !ctx.indexedLookup) {
      continue;
    }

    // Guard: directional entries may be scoped to specific CSS properties
    if (isDirectionalEntry(entry)) {
      if (
        entry.cssProperties &&
        (!ctx.cssProperty || !entry.cssProperties.includes(ctx.cssProperty))
      ) {
        continue;
      }
      return { directional: entry.directional };
    }

    // Bail entry
    if (isBailEntry(entry)) {
      return undefined;
    }

    // Resolve entry — interpolate placeholders
    const expr = interpolateExpr(entry.expr, match, ctx);
    return {
      expr,
      imports: entry.imports,
      ...(entry.usage ? { usage: entry.usage } : {}),
      ...(entry.dynamicArgUsage ? { dynamicArgUsage: entry.dynamicArgUsage } : {}),
    };
  }

  return THEME_MAPPING_NO_MATCH;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

type PatternMatch = { property: string };

/** Match a pattern string against a theme path. */
function matchPattern(pattern: string, path: string): PatternMatch | null {
  // Catch-all wildcard
  if (pattern === "*") {
    // property = last segment of the path
    const lastDot = path.lastIndexOf(".");
    return { property: lastDot >= 0 ? path.slice(lastDot + 1) : path };
  }
  // Prefix match: "color.*" matches "color.labelBase" and "color" (object-level)
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    if (path.startsWith(prefix + ".")) {
      return { property: path.slice(prefix.length + 1) };
    }
    if (path === prefix) {
      return { property: "" };
    }
    return null;
  }
  // Exact match only
  if (path === pattern) {
    return { property: "" };
  }
  return null;
}

/** Replace `{property}` and `{cssProperty}` placeholders in an expression. */
function interpolateExpr(
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

function isResolveEntry(
  entry: ThemeMappingValue,
): entry is import("../adapter.js").ThemeMappingResolveEntry {
  return "expr" in entry;
}

function isBailEntry(
  entry: ThemeMappingValue,
): entry is import("../adapter.js").ThemeMappingBailEntry {
  return "bail" in entry;
}

function isDirectionalEntry(
  entry: ThemeMappingValue,
): entry is import("../adapter.js").ThemeMappingDirectionalEntry {
  return "directional" in entry;
}
