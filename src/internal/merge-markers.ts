/**
 * Shared utility for merging marker sidecar content.
 * Core concepts: deduplication of defineMarker declarations across files.
 */

/** Regex matching a marker block: optional JSDoc comment followed by the export line. */
const MARKER_BLOCK_RE = /(?:\/\*\*[^]*?\*\/\n)?export const \w+ = stylex\.defineMarker\(\);/gm;

/** Regex matching just the export line (used for dedup checks). */
const MARKER_EXPORT_RE = /^export const \w+ = stylex\.defineMarker\(\);$/gm;

/** Regex matching a generated defineVars export block. */
const DEFINE_VARS_BLOCK_RE = /export const \w+ = stylex\.defineVars\(\{\n(?:  .+\n)*\}\);/gm;

/** Regex matching just the defineVars export line (used for dedup checks). */
const DEFINE_VARS_EXPORT_RE = /^export const \w+ = stylex\.defineVars\(\{$/gm;

/**
 * Merge marker declarations from `incoming` into `base`, appending only new
 * marker blocks (JSDoc + export). Returns `base` unchanged if all markers already exist.
 */
export function mergeMarkerDeclarations(base: string, incoming: string): string {
  const markerBlocks = getNewBlocks({
    base,
    incoming,
    blockRegex: MARKER_BLOCK_RE,
    exportRegex: MARKER_EXPORT_RE,
  });
  const defineVarsBlocks = getNewBlocks({
    base,
    incoming,
    blockRegex: DEFINE_VARS_BLOCK_RE,
    exportRegex: DEFINE_VARS_EXPORT_RE,
  });
  const blocksToAdd = [...markerBlocks, ...defineVarsBlocks];
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

function getNewBlocks(args: {
  base: string;
  incoming: string;
  blockRegex: RegExp;
  exportRegex: RegExp;
}): string[] {
  const { base, incoming, blockRegex, exportRegex } = args;
  const incomingExports = [...incoming.matchAll(exportRegex)].map((m) => m[0]);
  if (incomingExports.length === 0) {
    return [];
  }
  const newExportLines = incomingExports.filter((line) => !base.includes(line));
  if (newExportLines.length === 0) {
    return [];
  }
  const newExportSet = new Set(newExportLines);
  return [...incoming.matchAll(blockRegex)]
    .map((m) => m[0])
    .filter((block) => {
      const exportLine = block.match(exportRegex);
      return exportLine && newExportSet.has(exportLine[0]);
    });
}
