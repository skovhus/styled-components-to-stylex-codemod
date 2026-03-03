/**
 * Shared lower-rules helpers for merging and formatting style objects.
 * Core concepts: deep merge semantics, AST node detection, and media query resolution.
 */
import { extractRootAndPath, isAstNode } from "../utilities/jscodeshift-utils.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import type { Adapter, ImportSource, ImportSpec } from "../../adapter.js";
import { literalToStaticValue } from "./types.js";

type ImportMeta = { importedName: string; source: ImportSource };
type ImportLookup = (localName: string, identNode?: unknown) => ImportMeta | null;

/** Returns true for at-rules the codemod can transform (`@media`, `@container`). */
export function isSupportedAtRule(atRule: string): boolean {
  return atRule.startsWith("@media") || atRule.startsWith("@container");
}

/** Finds the first supported at-rule (`@media` or `@container`) in the stack, if any. */
export function findSupportedAtRule(atRuleStack: string[]): string | undefined {
  return atRuleStack.find(isSupportedAtRule);
}

/** Returns true if the key looks like a StyleX style condition (pseudo, media, container). */
export function isStyleConditionKey(key: string): boolean {
  return (
    key.startsWith(":") ||
    key.startsWith("::") ||
    key.startsWith("@media") ||
    key.startsWith("@container")
  );
}

/**
 * Resolves `__SC_EXPR_N__` placeholders in a media/container query string to static values.
 * Returns the resolved query string, or null if any placeholder cannot be statically resolved.
 *
 * @param mediaQuery - The at-rule string, e.g. `@media (max-width: __SC_EXPR_0__px)`
 * @param resolveSlot - Callback that takes a slot ID and returns the static value, or null
 */
export function resolveMediaQueryPlaceholders(
  mediaQuery: string,
  resolveSlot: (slotId: number) => string | number | null,
): string | null {
  if (!mediaQuery.includes("__SC_EXPR_")) {
    return mediaQuery;
  }

  const globalRe = new RegExp(PLACEHOLDER_RE.source, "g");
  const matches: Array<{ full: string; slotId: number }> = [];
  let match;

  while ((match = globalRe.exec(mediaQuery)) !== null) {
    matches.push({ full: match[0], slotId: Number(match[1]) });
  }

  let resolved = mediaQuery;
  for (const m of matches) {
    const staticVal = resolveSlot(m.slotId);
    if (staticVal === null) {
      return null;
    }
    resolved = resolved.replace(m.full, String(staticVal));
  }

  return resolved;
}

/**
 * Resolves a slot expression AST node to a static string or number value.
 * Handles:
 * - Direct literals (NumericLiteral, StringLiteral, Literal)
 * - Imported values via adapter resolveValue (MemberExpression, Identifier)
 */
export function resolveSlotExprToStaticValue(
  expr: unknown,
  lookupImport: ImportLookup,
  resolveValue: Adapter["resolveValue"],
  filePath: string,
  resolverImports: Map<string, ImportSpec>,
): string | number | null {
  if (!expr || typeof expr !== "object") {
    return null;
  }

  const staticVal = literalToStaticValue(expr);
  if (typeof staticVal === "string" || typeof staticVal === "number") {
    return staticVal;
  }

  const info = extractRootAndPath(expr);
  if (!info) {
    return null;
  }

  const imp = lookupImport(info.rootName, info.rootNode);
  if (!imp) {
    return null;
  }

  const result = resolveValue({
    kind: "importedValue",
    importedName: imp.importedName,
    source: imp.source,
    ...(info.path.length > 0 ? { path: info.path.join(".") } : {}),
    filePath,
  });
  if (!result || !("expr" in result)) {
    return null;
  }

  for (const impSpec of result.imports ?? []) {
    resolverImports.set(JSON.stringify(impSpec), impSpec);
  }

  return parseStaticExprString(result.expr);
}

/**
 * Merges tracked @media values into a base style object as nested StyleX objects.
 * Each property that has media-scoped values is wrapped in:
 * `{ default: baseValue, "@media (...)": mediaValue }`
 */
export function mergeMediaIntoStyles(
  base: Record<string, unknown>,
  mediaStyles: Map<string, Record<string, unknown>>,
): void {
  for (const [mediaQuery, mediaStyle] of mediaStyles) {
    for (const [prop, mediaValue] of Object.entries(mediaStyle)) {
      const baseValue = base[prop];
      base[prop] = { default: baseValue ?? null, [mediaQuery]: mediaValue };
    }
  }
}

/**
 * Recursively merges style objects, combining nested objects rather than overwriting.
 *
 * Note: Security scanners may flag this as prototype pollution, but this is a false positive.
 * This is a codemod that runs locally on the developer's own source code - there is no
 * untrusted input that could exploit prototype pollution. The source objects are style
 * declarations extracted from the developer's own styled-components code.
 */
export function mergeStyleObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value) &&
      !isAstNode(existing) &&
      !isAstNode(value)
    ) {
      mergeStyleObjects(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

/** Parses a JS expression string as a static numeric or quoted string value. */
function parseStaticExprString(expr: string): string | number | null {
  const trimmed = expr.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") {
    return num;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return null;
}
