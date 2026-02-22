// Utilities for detecting styled-component usage patterns across consumer code.
//
// Exports helpers used by run-prepass.ts for consumer analysis:
//   findImportSource, resolveBarrelReExport, fileExports, fileImportsFrom
import path from "node:path";
// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export type Resolve = (specifier: string, fromFile: string) => string | null;

interface ImportInfo {
  source: string;
  /** The original exported name (differs from local name for aliased imports) */
  exportedName: string;
}

export function findImportSource(src: string, localName: string): ImportInfo | null {
  const [aliasRe, namedRe, defaultRe] = getImportSourceRes(localName);

  // Named aliased import: `import { OriginalName as localName }`
  // Skip `{ default as X }` — treat it like a default import so the local name is used.
  const aliasMatch = src.match(aliasRe);
  if (aliasMatch?.[1] && aliasMatch[1] !== "default" && aliasMatch[2]) {
    return { source: aliasMatch[2], exportedName: aliasMatch[1] };
  }

  // Named import (no alias): `import { localName }`
  const namedMatch = src.match(namedRe);
  if (namedMatch?.[1]) {
    return { source: namedMatch[1], exportedName: localName };
  }

  // Default import (including `import Name, { type X } from "..."`)
  const defaultMatch = src.match(defaultRe);
  if (defaultMatch?.[1]) {
    return { source: defaultMatch[1], exportedName: localName };
  }

  return null;
}

const importSourceReCache = new Map<string, [RegExp, RegExp, RegExp]>();
function getImportSourceRes(localName: string): [RegExp, RegExp, RegExp] {
  let cached = importSourceReCache.get(localName);
  if (!cached) {
    cached = [
      new RegExp(
        String.raw`import\s+\{[^}]*\b(\w+)\s+as\s+${localName}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
      ),
      new RegExp(String.raw`import\s+\{[^}]*\b${localName}\b[^}]*\}\s+from\s+["']([^"']+)["']`),
      new RegExp(String.raw`import\s+${localName}(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']`),
    ];
    importSourceReCache.set(localName, cached);
  }
  return cached;
}

export function resolveBarrelReExport(
  filePath: string,
  name: string,
  resolve: Resolve,
  read: (f: string) => string,
): string | null {
  const basename = path.basename(filePath);
  if (basename !== "index.ts" && basename !== "index.tsx") {
    return null;
  }

  let src: string;
  try {
    src = read(filePath);
  } catch {
    return null;
  }

  // Match `export { Name } from "./..."` or `export { Name as ... } from "./..."`
  const namedMatch = src.match(getBarrelExportRe(name));
  if (namedMatch?.[1]) {
    return resolve(namedMatch[1], filePath);
  }

  // Match `export * from "./..."` — check each star-export for the name
  const starRe = /export\s*\*\s*from\s*["']([^"']+)["']/g;
  for (const match of src.matchAll(starRe)) {
    const specifier = match[1];
    if (!specifier) {
      continue;
    }
    const resolved = resolve(specifier, filePath);
    if (resolved) {
      try {
        if (fileExports(read(resolved), name)) {
          return resolved;
        }
      } catch {
        // skip
      }
    }
  }

  return null;
}

export function fileExports(src: string, name: string): boolean {
  return getFileExportsRe(name).test(src);
}

const fileExportsReCache = new Map<string, RegExp>();
function getFileExportsRe(name: string): RegExp {
  let re = fileExportsReCache.get(name);
  if (!re) {
    re = new RegExp(
      String.raw`export\s+(?:(?:const|function|class|let|var)\s+${name}\b|default\s+${name}\b)` +
        String.raw`|export\s*\{[^}]*\b${name}\b[^}]*\}`,
    );
    fileExportsReCache.set(name, re);
  }
  return re;
}

const barrelExportReCache = new Map<string, RegExp>();
function getBarrelExportRe(name: string): RegExp {
  let re = barrelExportReCache.get(name);
  if (!re) {
    re = new RegExp(String.raw`export\s*\{[^}]*\b${name}\b[^}]*\}\s*from\s*["']([^"']+)["']`);
    barrelExportReCache.set(name, re);
  }
  return re;
}

export function fileImportsFrom(
  usageSrc: string,
  usageFile: string,
  name: string,
  defFile: string,
  resolve: Resolve,
): boolean {
  const [namedRe, defaultRe] = getFileImportsFromRes(name);
  namedRe.lastIndex = 0;
  defaultRe.lastIndex = 0;

  // Heuristic path fragments for fallback matching when resolution fails
  const stem = path.parse(defFile).name;
  const parent = path.basename(path.dirname(defFile));

  for (const re of [namedRe, defaultRe]) {
    for (const match of usageSrc.matchAll(re)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }
      // Resolve the import specifier from the usage file and compare to the definition file
      const resolved = resolve(specifier, usageFile);
      if (resolved && path.resolve(resolved) === path.resolve(defFile)) {
        return true;
      }
      // Fallback: heuristic path matching
      if (
        specifier.endsWith(stem) ||
        specifier.endsWith(`${parent}/${stem}`) ||
        specifier.endsWith(parent)
      ) {
        return true;
      }
    }
  }

  return false;
}

const fileImportsFromReCache = new Map<string, [RegExp, RegExp]>();
function getFileImportsFromRes(name: string): [RegExp, RegExp] {
  let cached = fileImportsFromReCache.get(name);
  if (!cached) {
    cached = [
      new RegExp(String.raw`import\s+\{[^}]*\b${name}\b[^}]*\}\s+from\s+["']([^"']+)["']`, "g"),
      new RegExp(String.raw`import\s+${name}(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']`, "g"),
    ];
    fileImportsFromReCache.set(name, cached);
  }
  return cached;
}
