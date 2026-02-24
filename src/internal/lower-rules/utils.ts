/**
 * Shared lower-rules helpers for merging and formatting style objects.
 * Core concepts: deep merge semantics and AST node detection.
 */
import { isAstNode } from "../utilities/jscodeshift-utils.js";

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
