import type { TransformWarning } from "./transform-types.js";

export interface CollectedWarning extends TransformWarning {
  filePath: string;
}

let collected: CollectedWarning[] = [];

/**
 * Clear collected warnings and return them.
 */
export function flushWarnings(): CollectedWarning[] {
  const result = collected;
  collected = [];
  return result;
}

/**
 * Log a warning message to stderr.
 * All codemod warnings go through this so tests can mock it.
 */
export function logWarning(message: string): void {
  process.stderr.write(message);
}

/**
 * Log transform warnings to stderr and collect them.
 */
export function logWarnings(warnings: TransformWarning[], filePath: string): void {
  for (const warning of warnings) {
    collected.push({ ...warning, filePath });
    const location = warning.loc
      ? ` (${filePath}:${warning.loc.line}:${warning.loc.column})`
      : ` (${filePath})`;
    logWarning(`[styled-components-to-stylex] Warning${location}: ${warning.message}\n`);
  }
}
