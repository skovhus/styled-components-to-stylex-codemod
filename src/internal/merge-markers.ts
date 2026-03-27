/**
 * Shared utility for merging marker sidecar content.
 * Core concepts: deduplication of defineMarker declarations across files.
 */

/** Regex matching a marker block: optional JSDoc comment followed by the export line. */
const MARKER_BLOCK_RE = /(?:\/\*\*[^]*?\*\/\n)?export const \w+ = stylex\.defineMarker\(\);/gm;

/** Regex matching just the export line (used for dedup checks). */
const MARKER_EXPORT_RE = /^export const \w+ = stylex\.defineMarker\(\);$/gm;

/**
 * Merge marker declarations from `incoming` into `base`, appending only new
 * marker blocks (JSDoc + export). Returns `base` unchanged if all markers already exist.
 */
export function mergeMarkerDeclarations(base: string, incoming: string): string {
  // Extract export lines from incoming to check which are new
  const incomingExports = [...incoming.matchAll(MARKER_EXPORT_RE)].map((m) => m[0]);
  if (incomingExports.length === 0) {
    return base;
  }
  const newExportLines = incomingExports.filter((line) => !base.includes(line));
  if (newExportLines.length === 0) {
    return base;
  }
  // Extract full blocks (JSDoc + export) for the new markers
  const newExportSet = new Set(newExportLines);
  const incomingBlocks = [...incoming.matchAll(MARKER_BLOCK_RE)].map((m) => m[0]);
  const blocksToAdd = incomingBlocks.filter((block) => {
    const exportLine = block.match(MARKER_EXPORT_RE);
    return exportLine && newExportSet.has(exportLine[0]);
  });
  if (blocksToAdd.length === 0) {
    return base;
  }
  // Ensure the stylex import exists
  let merged = base;
  if (!merged.includes("@stylexjs/stylex")) {
    merged = `import * as stylex from "@stylexjs/stylex";\n\n${merged}`;
  }
  // Ensure a blank line separates existing content from new blocks
  const trimmed = merged.trimEnd();
  return trimmed + "\n\n" + blocksToAdd.join("\n\n") + "\n";
}
