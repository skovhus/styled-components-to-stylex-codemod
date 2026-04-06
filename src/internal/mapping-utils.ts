/**
 * Shared pattern-matching and placeholder interpolation for declarative mappings.
 * Used by themeMapping, callMapping, selectorMapping, and cssVariableMapping resolvers.
 */
import type { ImportFromShorthand, ImportSpec, ImportSource } from "../adapter.js";

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
    return null;
  }
  if (key === pattern) {
    return { property: "" };
  }
  return null;
}

/**
 * Resolve imports from either explicit `imports` or the `importFrom` shorthand.
 *
 * When `importFrom` is set, the root identifier is extracted from `expr`
 * (the first valid JS identifier before `.` or `[`) and used as the import name.
 */
export function resolveImports(entry: {
  expr?: string;
  imports?: ImportSpec[];
  importFrom?: ImportFromShorthand;
  /** For pseudoAlias: root identifier comes from this field instead of expr. */
  styleSelectorExpr?: string;
}): ImportSpec[] {
  if (entry.imports) {
    return entry.imports;
  }
  if (!entry.importFrom) {
    return [];
  }
  const from: ImportSource =
    typeof entry.importFrom === "string"
      ? { kind: "specifier", value: entry.importFrom }
      : entry.importFrom;
  const exprSource = entry.styleSelectorExpr ?? entry.expr ?? "";
  const rootId = extractRootIdentifier(exprSource);
  if (!rootId) {
    return [{ from, names: [] }];
  }
  return [{ from, names: [{ imported: rootId }] }];
}

/** Extract the first JS identifier from an expression (before `.` or `[`). */
function extractRootIdentifier(expr: string): string | null {
  const m = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  return m?.[1] ?? null;
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
