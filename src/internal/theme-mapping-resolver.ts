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
import { interpolateExpr, MAPPING_NO_MATCH, matchPattern } from "./mapping-utils.js";

// ────────────────────────────────────────────────────────────────────────────
// Exports
// ────────────────────────────────────────────────────────────────────────────

/** Sentinel: no entry in the mapping matched — fall through to resolveValue. */
export const THEME_MAPPING_NO_MATCH: typeof MAPPING_NO_MATCH = MAPPING_NO_MATCH;

type ThemeMappingResult =
  | ResolveValueResult
  | ResolveValueDirectionalResult
  | typeof MAPPING_NO_MATCH
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

  return MAPPING_NO_MATCH;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

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
