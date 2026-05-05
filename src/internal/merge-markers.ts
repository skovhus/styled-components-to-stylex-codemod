/**
 * Shared utility for merging StyleX sidecar content.
 * Core concepts: preserving defineVars exports and deduplicating defineMarker declarations.
 */

/** Regex matching a marker block: optional JSDoc comment followed by the export line. */
const MARKER_BLOCK_RE = /(?:\/\*\*[^]*?\*\/\n)?export const \w+ = stylex\.defineMarker\(\);/gm;

/** Regex matching just the export line (used for dedup checks). */
const MARKER_EXPORT_RE = /^export const \w+ = stylex\.defineMarker\(\);$/gm;

/** Regex matching generated defineVars blocks. */
const DEFINE_VARS_BLOCK_RE = /export const \w+ = stylex\.defineVars\(\{\n[\s\S]*?\n\}\);/gm;

/**
 * Merge marker declarations from `incoming` into `base`, appending only new
 * marker blocks (JSDoc + export). Returns `base` unchanged if all markers already exist.
 */
export function mergeMarkerDeclarations(base: string, incoming: string): string {
  const withVars = mergeDefineVarsDeclarations(base, incoming);
  return mergeMarkerOnlyDeclarations(withVars, incoming);
}

function mergeMarkerOnlyDeclarations(base: string, incoming: string): string {
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

function mergeDefineVarsDeclarations(base: string, incoming: string): string {
  const incomingBlocks = [...incoming.matchAll(DEFINE_VARS_BLOCK_RE)].map((match) => match[0]);
  if (incomingBlocks.length === 0) {
    return base;
  }

  let merged = ensureStylexImport(base);
  for (const incomingBlock of incomingBlocks) {
    const exportName = readDefineVarsExportName(incomingBlock);
    if (!exportName) {
      continue;
    }
    const existingBlock = findDefineVarsBlock(merged, exportName);
    if (!existingBlock) {
      merged = `${merged.trimEnd()}\n\n${incomingBlock}\n`;
      continue;
    }
    const mergedBlock = mergeDefineVarsBlock(existingBlock.text, incomingBlock);
    merged =
      merged.slice(0, existingBlock.start) +
      mergedBlock +
      merged.slice(existingBlock.start + existingBlock.text.length);
  }
  return merged;
}

function ensureStylexImport(source: string): string {
  if (source.includes("@stylexjs/stylex")) {
    return source;
  }
  return `import * as stylex from "@stylexjs/stylex";\n\n${source}`;
}

function readDefineVarsExportName(block: string): string | null {
  return block.match(/export const (\w+) = stylex\.defineVars/)?.[1] ?? null;
}

function findDefineVarsBlock(
  source: string,
  exportName: string,
): { start: number; text: string } | null {
  const escaped = escapeRegExp(exportName);
  const re = new RegExp(
    `export const ${escaped} = stylex\\.defineVars\\(\\{\\n[\\s\\S]*?\\n\\}\\);`,
    "m",
  );
  const match = re.exec(source);
  if (!match) {
    return null;
  }
  return { start: match.index, text: match[0] };
}

function mergeDefineVarsBlock(baseBlock: string, incomingBlock: string): string {
  const existing = new Set(readDefineVarsEntries(baseBlock).map((entry) => entry.key));
  const additions = readDefineVarsEntries(incomingBlock).filter(
    (entry) => !existing.has(entry.key),
  );
  if (additions.length === 0) {
    return baseBlock;
  }
  const text = additions.map((entry) => entry.text).join("\n");
  return baseBlock.replace(/\n\}\);$/, `\n${text}\n});`);
}

function readDefineVarsEntries(block: string): Array<{ key: string; text: string }> {
  const lines = block.split("\n");
  const entryStarts: Array<{ index: number; key: string; indent: number }> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const match = line.match(/^(\s*)["'](--[^"']+)["']\s*:/);
    if (!match) {
      continue;
    }
    const indent = match[1];
    const key = match[2];
    if (!indent || !key) {
      continue;
    }
    entryStarts.push({ index, key, indent: indent.length });
  }
  if (entryStarts.length === 0) {
    return [];
  }
  const topLevelIndent = Math.min(...entryStarts.map((entry) => entry.indent));
  const topLevelEntries = entryStarts.filter((entry) => entry.indent === topLevelIndent);
  const closeIndex = lines.reduce(
    (lastIndex, line, index) => (line.trim() === "});" ? index : lastIndex),
    lines.length,
  );
  return topLevelEntries.map((entry, position) => {
    const next = topLevelEntries[position + 1];
    const end = next ? next.index : closeIndex;
    return {
      key: entry.key,
      text: lines.slice(entry.index, end).join("\n"),
    };
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
