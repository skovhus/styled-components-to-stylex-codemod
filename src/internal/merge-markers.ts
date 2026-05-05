/**
 * Shared utility for merging marker sidecar content.
 * Core concepts: deduplication of defineMarker declarations across files.
 */

/** Regex matching a marker block: optional JSDoc comment followed by the export line. */
const MARKER_BLOCK_RE = /(?:\/\*\*[^]*?\*\/\n)?export const \w+ = stylex\.defineMarker\(\);/gm;

/** Regex matching just the export line (used for dedup checks). */
const MARKER_EXPORT_RE = /^export const \w+ = stylex\.defineMarker\(\);$/gm;

/** Regex matching a generated defineVars export block. */
const DEFINE_VARS_BLOCK_RE = /export const \w+ = stylex\.defineVars\(\{\n[\s\S]*?\n\}\);/gm;

/** Regex matching just the defineVars export line (used for dedup checks). */
const DEFINE_VARS_EXPORT_RE = /^export const \w+ = stylex\.defineVars\(\{$/gm;

/**
 * Merge marker declarations from `incoming` into `base`, appending only new
 * marker blocks (JSDoc + export). Returns `base` unchanged if all markers already exist.
 */
export function mergeMarkerDeclarations(base: string, incoming: string): string {
  const mergedDefineVars = mergeDefineVarsBlocks(base, incoming);
  const markerBlocks = getNewBlocks({
    base: mergedDefineVars,
    incoming,
    blockRegex: MARKER_BLOCK_RE,
    exportRegex: MARKER_EXPORT_RE,
  });
  const defineVarsBlocks = getNewBlocks({
    base: mergedDefineVars,
    incoming,
    blockRegex: DEFINE_VARS_BLOCK_RE,
    exportRegex: DEFINE_VARS_EXPORT_RE,
  });
  const blocksToAdd = [...markerBlocks, ...defineVarsBlocks];
  if (blocksToAdd.length === 0) {
    return mergedDefineVars;
  }

  // Ensure the stylex import exists
  let merged = mergedDefineVars;
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

function mergeDefineVarsBlocks(base: string, incoming: string): string {
  let merged = base;
  for (const incomingBlock of incoming.matchAll(DEFINE_VARS_BLOCK_RE)) {
    const incomingText = incomingBlock[0];
    const exportName = readDefineVarsExportName(incomingText);
    if (!exportName) {
      continue;
    }
    const existingBlock = findDefineVarsBlockByExportName(merged, exportName);
    if (!existingBlock) {
      continue;
    }
    const entriesToAdd = getMissingDefineVarsEntries({
      existingBlock: existingBlock.text,
      incomingBlock: incomingText,
    });
    if (entriesToAdd.length === 0) {
      continue;
    }
    const insertionPoint = existingBlock.start + existingBlock.text.lastIndexOf("\n});");
    const linesToAdd = entriesToAdd.map((entry) => entry.line);
    merged = `${merged.slice(0, insertionPoint)}\n${linesToAdd.join("\n")}${merged.slice(insertionPoint)}`;
  }
  return merged;
}

function readDefineVarsExportName(block: string): string | null {
  const match = /^export const ([A-Za-z_$][\w$]*) = stylex\.defineVars\(\{/m.exec(block);
  return match?.[1] ?? null;
}

function findDefineVarsBlockByExportName(
  source: string,
  exportName: string,
): { text: string; start: number } | null {
  for (const match of source.matchAll(DEFINE_VARS_BLOCK_RE)) {
    const text = match[0];
    if (readDefineVarsExportName(text) === exportName && match.index !== undefined) {
      return { text, start: match.index };
    }
  }
  return null;
}

function getMissingDefineVarsEntries(args: {
  existingBlock: string;
  incomingBlock: string;
}): Array<{ key: string; line: string }> {
  const { existingBlock, incomingBlock } = args;
  const existingKeys = new Set(readDefineVarsEntryKeys(existingBlock));
  return readDefineVarsEntries(incomingBlock).filter((entry) => !existingKeys.has(entry.key));
}

function readDefineVarsEntryKeys(block: string): string[] {
  return readDefineVarsEntries(block).map((entry) => entry.key);
}

function readDefineVarsEntries(block: string): Array<{ key: string; line: string }> {
  return block
    .split("\n")
    .map((line) => ({
      line,
      match: /^\s*(?:(["']--[^"']+["'])|([A-Za-z_$][\w$]*))\s*:/.exec(line),
    }))
    .filter((entry): entry is { line: string; match: RegExpExecArray } => Boolean(entry.match))
    .map(({ line, match }) => ({ key: match[1] ?? match[2]!, line }));
}
