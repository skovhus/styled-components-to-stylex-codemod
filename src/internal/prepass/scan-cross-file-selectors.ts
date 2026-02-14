/**
 * Prepass: scan files for cross-file styled-component selector usage.
 *
 * Detects patterns like:
 *   import { Icon } from "./icon";
 *   const Btn = styled(Button)` ${Icon} { ... } `;
 *
 * Returns a CrossFileInfo map describing which components are used as
 * selectors across file boundaries, enabling marker-based override wiring.
 *
 * Performance: uses regex-based scanning (~0.1ms/file) instead of
 * full AST parsing (~5ms/file). For 500 files: ~50ms vs ~2500ms.
 */
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import type { ModuleResolver } from "./resolve-imports.js";

/* ── Public types ─────────────────────────────────────────────────────── */

export interface CrossFileSelectorUsage {
  /** Local name in the consumer file (e.g. "CollapseArrowIcon") */
  localName: string;
  /** Raw import specifier (e.g. "./lib/collapse-arrow-icon") */
  importSource: string;
  /** Imported binding name ("default" for default imports, otherwise named) */
  importedName: string;
  /** Absolute path of the target module */
  resolvedPath: string;
  /** Absolute path of the consumer file */
  consumerPath: string;
  /** Whether the consumer is in the `files` set (Scenario A) */
  consumerIsTransformed: boolean;
}

export interface CrossFileInfo {
  /** Consumer file → its cross-file selector usages */
  selectorUsages: Map<string, CrossFileSelectorUsage[]>;
  /** Target file → set of exported component names that need style acceptance (Scenario A) */
  componentsNeedingStyleAcceptance: Map<string, Set<string>>;
  /** Target file → set of exported component names that need bridge className (Scenario B) */
  componentsNeedingBridge: Map<string, Set<string>>;
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Scan files and build cross-file selector information.
 *
 * @param filesToTransform  Absolute paths of files being transformed
 * @param consumerPaths     Additional absolute paths to scan for selector usage (but not transform)
 * @param resolver          Module resolver instance
 */
export function scanCrossFileSelectors(
  filesToTransform: readonly string[],
  consumerPaths: readonly string[],
  resolver: ModuleResolver,
): CrossFileInfo {
  const transformSet = new Set(filesToTransform.map((f) => pathResolve(f)));
  const allFiles = deduplicateAndResolve(filesToTransform, consumerPaths);

  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingStyleAcceptance = new Map<string, Set<string>>();
  const componentsNeedingBridge = new Map<string, Set<string>>();

  for (const filePath of allFiles) {
    const usages = scanFile(filePath, transformSet, resolver);
    if (usages.length === 0) {
      continue;
    }

    selectorUsages.set(filePath, usages);

    for (const usage of usages) {
      if (usage.consumerIsTransformed) {
        addToSetMap(componentsNeedingStyleAcceptance, usage.resolvedPath, usage.importedName);
      } else {
        addToSetMap(componentsNeedingBridge, usage.resolvedPath, usage.importedName);
      }
    }
  }

  return { selectorUsages, componentsNeedingStyleAcceptance, componentsNeedingBridge };
}

/* ── File scanner ─────────────────────────────────────────────────────── */

/**
 * Regex matching `${Identifier}` used as a CSS selector in a styled template.
 * Looks for: ${ Identifier } followed (after optional whitespace/CSS) by `{`.
 * This is a heuristic — the main transform does precise AST-based detection.
 */
const SELECTOR_INTERPOLATION_RE =
  /\$\{\s*([A-Z][A-Za-z0-9_]*)\s*\}\s*\{|&[:\w-]*\s+\$\{\s*([A-Z][A-Za-z0-9_]*)\s*\}/g;

function scanFile(
  filePath: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
): CrossFileSelectorUsage[] {
  let source: string;
  try {
    source = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  // Quick bail: skip files that don't use styled-components
  if (!source.includes("styled-components")) {
    return [];
  }

  // Step 1: Parse imports via regex
  const importMap = parseImportMap(source);
  if (importMap.size === 0) {
    return [];
  }

  // Step 2: Find component names used as selectors in styled templates.
  // Only scan identifiers that are actually imported (skip same-file components).
  const selectorLocals = findSelectorIdentifiers(source, importMap);
  if (selectorLocals.size === 0) {
    return [];
  }

  // Step 3: Resolve import specifiers to absolute paths
  const consumerIsTransformed = transformSet.has(filePath);
  const usages: CrossFileSelectorUsage[] = [];
  for (const localName of selectorLocals) {
    const imp = importMap.get(localName);
    if (!imp || imp.source === "styled-components") {
      continue;
    }

    const resolvedPath = resolver.resolve(filePath, imp.source);
    if (!resolvedPath || pathResolve(resolvedPath) === filePath) {
      continue;
    }

    usages.push({
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: pathResolve(resolvedPath),
      consumerPath: filePath,
      consumerIsTransformed,
    });
  }

  return usages;
}

/* ── Import parsing (regex-based) ─────────────────────────────────────── */

type ImportEntry = { source: string; importedName: string };

/**
 * Matches static import declarations. Captures:
 * - Full import statement up to the specifier
 * - The specifier string (single or double quoted)
 *
 * Handles: import X from "...", import { A, B } from "...", import X, { A } from "..."
 * Does not handle: dynamic imports, re-exports, require()
 */
const IMPORT_RE = /import\s+(?:type\s+)?(.+?)\s+from\s+["']([^"']+)["']/g;

/**
 * Build localName → { source, importedName } map using regex.
 * ~50x faster than jscodeshift AST parsing for just extracting imports.
 */
function parseImportMap(source: string): Map<string, ImportEntry> {
  const map = new Map<string, ImportEntry>();

  IMPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMPORT_RE.exec(source)) !== null) {
    const bindings = match[1]!;
    const specifier = match[2]!;

    // Skip `import type { ... }` — already handled by the `type\s+` optional group,
    // but if the whole import is `import type`, skip it
    if (bindings.startsWith("type ") || bindings.startsWith("type{")) {
      continue;
    }

    // Extract default import: `import X from` or `import X, { ... } from`
    const defaultMatch = bindings.match(/^([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (defaultMatch && defaultMatch[1] !== "type") {
      const localName = defaultMatch[1]!;
      // Check it's not the start of `{ ... }` (no default)
      if (localName !== "{" && !bindings.startsWith("{")) {
        map.set(localName, { source: specifier, importedName: "default" });
      }
    }

    // Extract named imports: `{ A, B as C, type D }`
    const namedMatch = bindings.match(/\{([^}]+)\}/);
    if (namedMatch) {
      for (const binding of namedMatch[1]!.split(",")) {
        const trimmed = binding.trim();
        if (!trimmed || trimmed.startsWith("type ")) {
          continue;
        }
        const asMatch = trimmed.match(/^(\S+)\s+as\s+(\S+)$/);
        if (asMatch) {
          map.set(asMatch[2]!, { source: specifier, importedName: asMatch[1]! });
        } else {
          map.set(trimmed, { source: specifier, importedName: trimmed });
        }
      }
    }
  }

  return map;
}

/* ── Selector detection (regex-based) ─────────────────────────────────── */

/**
 * Find imported component names used as CSS selectors in styled templates.
 * Only returns names that exist in the importMap (skips same-file components).
 */
function findSelectorIdentifiers(
  source: string,
  importMap: ReadonlyMap<string, ImportEntry>,
): Set<string> {
  const selectorLocals = new Set<string>();

  // Reset regex state
  SELECTOR_INTERPOLATION_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = SELECTOR_INTERPOLATION_RE.exec(source)) !== null) {
    // Group 1: ${Identifier} { ...
    // Group 2: &:pseudo ${Identifier} ...
    const name = match[1] ?? match[2];
    if (name && importMap.has(name)) {
      selectorLocals.add(name);
    }
  }

  return selectorLocals;
}

/* ── Utilities ────────────────────────────────────────────────────────── */

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

/** Deduplicate and resolve two file lists into a single array of absolute paths. */
function deduplicateAndResolve(
  filesToTransform: readonly string[],
  consumerPaths: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of filesToTransform) {
    const abs = pathResolve(f);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  for (const f of consumerPaths) {
    const abs = pathResolve(f);
    if (!seen.has(abs)) {
      seen.add(abs);
      result.push(abs);
    }
  }
  return result;
}
