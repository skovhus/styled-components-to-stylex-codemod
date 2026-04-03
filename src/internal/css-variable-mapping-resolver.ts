/**
 * Resolves CSS variable lookups from a declarative CssVariableMapping configuration.
 */
import type { CssVariableMapping, ResolveValueResult } from "../adapter.js";
import { MAPPING_NO_MATCH } from "./mapping-utils.js";

/* ── Exports ─────────────────────────────────────────────────────────── */

export { MAPPING_NO_MATCH as CSS_VARIABLE_MAPPING_NO_MATCH };

type CssVariableMappingResult = ResolveValueResult | typeof MAPPING_NO_MATCH | undefined;

/**
 * Resolve a CSS variable against a declarative CssVariableMapping.
 *
 * Returns:
 * - A `ResolveValueResult` on match
 * - `MAPPING_NO_MATCH` when no entry matched (caller should fall through to resolveValue)
 * - `undefined` when nothing matched and no fallback is needed
 */
export function resolveCssVariableFromMapping(
  mapping: CssVariableMapping,
  ctx: { name: string; definedValue?: string },
): CssVariableMappingResult {
  for (const [pattern, entry] of mapping) {
    const match = matchCssVarPattern(pattern, ctx.name);
    if (!match) {
      continue;
    }

    const expr = interpolateCssVarExpr(entry.expr, match);
    const dropDefinition = resolveDropDefinition(entry.dropDefinition, ctx.definedValue);

    return {
      expr,
      imports: entry.imports,
      ...(dropDefinition ? { dropDefinition: true } : {}),
    };
  }

  return MAPPING_NO_MATCH;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

type CssVarMatch = { name: string; raw: string };

/** Match a CSS variable pattern against a variable name. */
function matchCssVarPattern(pattern: string, varName: string): CssVarMatch | null {
  const camelName = cssVarToCamelCase(varName);

  if (pattern === "*") {
    return { name: camelName, raw: varName };
  }
  // Prefix: "--color-*" matches "--color-primary"
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    if (varName.startsWith(prefix)) {
      const remainder = varName.slice(prefix.length);
      return { name: cssVarToCamelCase("--" + remainder), raw: varName };
    }
    return null;
  }
  // Exact match
  if (varName === pattern) {
    return { name: camelName, raw: varName };
  }
  return null;
}

/** Replace `{name}` and `{raw}` placeholders. */
function interpolateCssVarExpr(template: string, match: CssVarMatch): string {
  let result = template;
  if (result.includes("{name}")) {
    result = result.replace(/\{name\}/g, match.name);
  }
  if (result.includes("{raw}")) {
    result = result.replace(/\{raw\}/g, match.raw);
  }
  return result;
}

/** Convert `--color-primary` to `colorPrimary`. */
function cssVarToCamelCase(name: string): string {
  return name.replace(/^--/, "").replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Determine whether to drop the CSS variable definition. */
function resolveDropDefinition(
  drop: boolean | string | undefined,
  definedValue: string | undefined,
): boolean {
  if (drop === true) {
    return true;
  }
  if (typeof drop === "string" && definedValue === drop) {
    return true;
  }
  return false;
}
