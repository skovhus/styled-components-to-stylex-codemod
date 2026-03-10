/**
 * Post-transform consumer patching for transient prop renames.
 *
 * When a component (e.g., `CollapseArrowIcon`) is converted from styled-components
 * to a plain function, its `$`-prefixed props are renamed (e.g., `$isOpen` → `isOpen`).
 * Unconverted consumer files that use `<CollapseArrowIcon $isOpen={...} />` must be
 * patched to use the new prop names.
 */
import { readFileSync } from "node:fs";
import { basename, dirname, relative } from "node:path";
import type { TransientPropRenameResult } from "./transform-types.js";
import { escapeRegex } from "./utilities/string-utils.js";
import { toRealPath } from "./utilities/path-utils.js";

/* ── Public types ─────────────────────────────────────────────────────── */

interface TransientPropConsumerEntry {
  localComponentName: string;
  renames: Record<string, string>;
}

interface Resolver {
  resolve(from: string, specifier: string): string | undefined;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Scan all consumer files and patch any that import renamed components.
 *
 * Iterates consumers once (outer) and targets (inner) to minimise I/O.
 * Returns the list of consumer file paths that were patched.
 */
export function collectTransientPropPatches(args: {
  transientPropRenames: ReadonlyMap<string, readonly TransientPropRenameResult[]>;
  consumerFilePaths: readonly string[];
  resolver?: Resolver;
}): Array<{ consumerPath: string; patched: string }> {
  const { transientPropRenames, consumerFilePaths, resolver } = args;
  const results: Array<{ consumerPath: string; patched: string }> = [];

  const allConsumerFiles = new Set(consumerFilePaths.map(toRealPath));

  for (const consumerPath of allConsumerFiles) {
    let consumerSource: string;
    try {
      consumerSource = readFileSync(consumerPath, "utf-8");
    } catch {
      continue;
    }
    const allEntries: TransientPropConsumerEntry[] = [];
    for (const [targetPath, renames] of transientPropRenames) {
      if (consumerPath === targetPath) {
        continue;
      }
      const importSources = buildPossibleImportSources(
        consumerPath,
        targetPath,
        consumerSource,
        resolver,
      );
      const entries = findImportedRenamedComponents(consumerSource, importSources, renames);
      allEntries.push(...entries);
    }
    if (allEntries.length > 0) {
      const patched = patchSourceTransientProps(consumerSource, allEntries);
      if (patched !== null) {
        results.push({ consumerPath, patched });
      }
    }
  }

  return results;
}

/**
 * Scan a consumer file's imports to find which renamed components it uses.
 */
export function findImportedRenamedComponents(
  consumerSource: string,
  targetImportSources: ReadonlySet<string>,
  componentRenames: ReadonlyArray<{ exportName: string; renames: Record<string, string> }>,
): TransientPropConsumerEntry[] {
  const entries: TransientPropConsumerEntry[] = [];
  for (const { exportName, renames } of componentRenames) {
    const localName = findLocalImportName(consumerSource, targetImportSources, exportName);
    if (localName) {
      entries.push({ localComponentName: localName, renames });
    }
  }
  return entries;
}

/**
 * Patch source code: rename `$prop` → `prop` in JSX attributes.
 * Returns the patched source or `null` if unchanged.
 */
export function patchSourceTransientProps(
  source: string,
  entries: readonly TransientPropConsumerEntry[],
): string | null {
  if (entries.length === 0) {
    return null;
  }
  let modified = source;
  for (const { localComponentName, renames } of entries) {
    modified = patchJsxTransientProps(modified, localComponentName, renames);
  }
  return modified !== source ? modified : null;
}

/**
 * File-based convenience wrapper around `patchSourceTransientProps`.
 */
export function patchConsumerTransientProps(
  filePath: string,
  entries: readonly TransientPropConsumerEntry[],
): string | null {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  return patchSourceTransientProps(source, entries);
}

/* ── Non-exported helpers ─────────────────────────────────────────────── */

/**
 * Build import source strings that a consumer might use to import from `targetPath`.
 * Generates relative paths (with/without extension, /index), and — when a resolver
 * is provided — also probes the consumer's actual import specifiers to catch
 * tsconfig path aliases.
 */
function buildPossibleImportSources(
  consumerPath: string,
  targetPath: string,
  consumerSource: string,
  resolver?: Resolver,
): Set<string> {
  const sources = new Set<string>();
  const dir = dirname(consumerPath);
  let rel = relative(dir, targetPath).replace(/\\/g, "/");
  if (!rel.startsWith(".")) {
    rel = `./${rel}`;
  }
  sources.add(rel);
  for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
    if (rel.endsWith(ext)) {
      sources.add(rel.slice(0, -ext.length));
      break;
    }
  }
  const base = basename(targetPath).replace(/\.\w+$/, "");
  if (base === "index") {
    const dirRel = relative(dir, dirname(targetPath)).replace(/\\/g, "/");
    sources.add(dirRel.startsWith(".") ? dirRel : `./${dirRel}`);
  }
  if (resolver) {
    const importRe = /from\s+["']([^"']+)["']/g;
    for (const m of consumerSource.matchAll(importRe)) {
      const specifier = m[1]!;
      if (sources.has(specifier)) {
        continue;
      }
      try {
        const resolved = resolver.resolve(consumerPath, specifier);
        if (resolved && toRealPath(resolved) === targetPath) {
          sources.add(specifier);
        }
      } catch {
        // resolver failure — skip
      }
    }
  }
  return sources;
}

/**
 * Find the local name for an imported component.
 * Checks named imports (`import { X }`, `import { X as Y }`),
 * default imports (`import X`).
 */
function findLocalImportName(
  source: string,
  targetImportSources: ReadonlySet<string>,
  exportName: string,
): string | null {
  const importRegex =
    /import\s+(type\s+)?(?:({[^}]+})|(\w+)(?:\s*,\s*({[^}]+}))?)\s+from\s+["']([^"']+)["']/g;

  for (const match of source.matchAll(importRegex)) {
    const isTypeOnly = !!match[1];
    if (isTypeOnly) {
      continue;
    }
    const importSource = match[5];
    if (!importSource || !targetImportSources.has(importSource)) {
      continue;
    }

    const defaultImport = match[3];
    const namedImports = match[2] ?? match[4];

    if (exportName === "default" && defaultImport) {
      return defaultImport;
    }

    if (namedImports) {
      const specifierRegex = new RegExp(
        `\\b${escapeRegex(exportName)}\\s+as\\s+(\\w+)|\\b(${escapeRegex(exportName)})\\b`,
        "g",
      );
      for (const specMatch of namedImports.matchAll(specifierRegex)) {
        const aliased = specMatch[1];
        const direct = specMatch[2];
        if (aliased) {
          return aliased;
        }
        if (direct) {
          return direct;
        }
      }
    }
  }

  return null;
}

/**
 * Rename `$prop` → `prop` in JSX attributes for a specific component.
 * Matches `<ComponentName ... $propName=` and `<ComponentName ... $propName>`
 * (shorthand boolean).
 */
function patchJsxTransientProps(
  source: string,
  componentName: string,
  renames: Record<string, string>,
): string {
  let result = source;

  for (const [original, renamed] of Object.entries(renames)) {
    const escapedComponent = escapeRegex(componentName);
    const escapedProp = escapeRegex(original);

    // Match $prop as a JSX attribute inside a <ComponentName ...> tag.
    // Uses non-greedy [^<>]*? to avoid consuming the prop itself,
    // and a lookahead for whitespace or =/>  to confirm it's a full attribute name.
    const tagRegex = new RegExp(
      `(<${escapedComponent}\\b[^<>]*?\\s)${escapedProp}(?=[\\s=/>])`,
      "g",
    );

    result = result.replace(tagRegex, `$1${renamed}`);
  }

  return result;
}
