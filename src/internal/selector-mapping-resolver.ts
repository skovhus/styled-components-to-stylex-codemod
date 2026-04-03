/**
 * Resolves selector interpolations from a declarative SelectorMapping configuration.
 */
import type { SelectorMapping, SelectorResolveContext, SelectorResolveResult } from "../adapter.js";
import { interpolateExpr, MAPPING_NO_MATCH, matchPattern } from "./mapping-utils.js";

/* ── Exports ─────────────────────────────────────────────────────────── */

export { MAPPING_NO_MATCH as SELECTOR_MAPPING_NO_MATCH };

type SelectorMappingResult = SelectorResolveResult | typeof MAPPING_NO_MATCH;

/**
 * Resolve a selector interpolation against a declarative SelectorMapping.
 *
 * Returns:
 * - A `SelectorResolveResult` on match
 * - `MAPPING_NO_MATCH` when no entry matched (caller should fall through to resolveSelector)
 */
export function resolveSelectorFromMapping(
  mapping: SelectorMapping,
  ctx: SelectorResolveContext,
): SelectorMappingResult {
  // Build the lookup key: "importedName.path" or just "importedName"
  const lookupKey = ctx.path ? `${ctx.importedName}.${ctx.path}` : ctx.importedName;

  for (const [pattern, entry] of mapping) {
    const match = matchPattern(pattern, lookupKey);
    if (!match) {
      continue;
    }

    if (entry.kind === "media") {
      return {
        kind: "media",
        expr: interpolateExpr(entry.expr, match, {}),
        imports: entry.imports,
      };
    }

    if (entry.kind === "pseudoAlias") {
      return {
        kind: "pseudoAlias",
        values: entry.values,
        styleSelectorExpr: entry.styleSelectorExpr,
        imports: entry.imports,
      };
    }

    if (entry.kind === "pseudoExpand") {
      return {
        kind: "pseudoExpand",
        expansions: entry.expansions,
        imports: entry.imports,
      };
    }
  }

  return MAPPING_NO_MATCH;
}
