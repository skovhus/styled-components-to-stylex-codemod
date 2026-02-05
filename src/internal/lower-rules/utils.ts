/**
 * Shared lower-rules helpers for merging and formatting style objects.
 * Core concepts: deep merge semantics and AST node detection.
 */
import { isAstNode } from "../utilities/jscodeshift-utils.js";

export { toKebab } from "../utilities/string-utils.js";

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
