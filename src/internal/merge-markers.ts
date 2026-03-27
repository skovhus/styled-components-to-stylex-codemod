/**
 * Shared utility for merging marker sidecar content.
 * Core concepts: deduplication of defineMarker declarations across files.
 */

/**
 * Merge marker declarations from `incoming` into `base`, appending only new
 * `export const XMarker = stylex.defineMarker()` lines. Returns `base` unchanged
 * if all markers already exist.
 */
export function mergeMarkerDeclarations(base: string, incoming: string): string {
  const markerLineRe = /^export const \w+ = stylex\.defineMarker\(\);$/gm;
  const newMarkers = [...incoming.matchAll(markerLineRe)].map((m) => m[0]);
  if (newMarkers.length === 0) {
    return base;
  }
  const markersToAdd = newMarkers.filter((line) => !base.includes(line));
  if (markersToAdd.length === 0) {
    return base;
  }
  // Ensure the stylex import exists
  let merged = base;
  if (!merged.includes("@stylexjs/stylex")) {
    merged = `import * as stylex from "@stylexjs/stylex";\n\n${merged}`;
  }
  const trailingNewline = merged.endsWith("\n") ? "" : "\n";
  return merged + trailingNewline + markersToAdd.join("\n") + "\n";
}
