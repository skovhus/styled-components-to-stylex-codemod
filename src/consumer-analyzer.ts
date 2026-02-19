// Utilities for detecting styled-component usage patterns across consumer code.
//
// createExternalInterface — scan consumer directories, return adapter callback + raw map
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { ResolverFactory } from "oxc-resolver";

import type { ExternalInterfaceContext, ExternalInterfaceResult } from "./adapter.js";

/**
 * Scans consumer code with `rg` to detect which styled-components are re-styled
 * (`styled(Comp)`) or used with the `as` prop, and returns an adapter-compatible
 * callback plus the raw analysis map.
 *
 * @example
 * ```ts
 * import { defineAdapter, createExternalInterface } from "styled-components-to-stylex-codemod";
 *
 * const externalInterface = createExternalInterface({ searchDirs: ["src/"] });
 *
 * export default defineAdapter({
 *   externalInterface: externalInterface.get,
 * });
 * ```
 */
export function createExternalInterface(options: AnalyzeConsumersOptions): ExternalInterface {
  const map = analyzeConsumers(options);
  return {
    get: (ctx) => map.get(`${ctx.filePath}:${ctx.componentName}`) ?? { styles: false, as: false },
    map,
  };
}

// ---------------------------------------------------------------------------
// Internal analysis
// ---------------------------------------------------------------------------

interface AnalyzeConsumersOptions {
  /** Directories to search for consumer usage (e.g. ["src/", "app/"]) */
  searchDirs: string[];
}

interface ExternalInterface {
  /** Adapter callback for use with `defineAdapter({ externalInterface: externalInterface.get })` */
  get: (ctx: ExternalInterfaceContext) => ExternalInterfaceResult;
  /** Raw analysis map keyed by `"absoluteFilePath:componentName"` */
  map: Map<string, ExternalInterfaceResult>;
}

function analyzeConsumers(options: AnalyzeConsumersOptions): Map<string, ExternalInterfaceResult> {
  const result = new Map<string, ExternalInterfaceResult>();
  const resolve = createResolver();
  const read = cachedReader();

  const ensure = (filePath: string, name: string) => {
    const key = `${path.resolve(filePath)}:${name}`;
    let entry = result.get(key);
    if (!entry) {
      entry = { styles: false, as: false };
      result.set(key, entry);
    }
    return entry;
  };

  // Single rg call for both as-prop and styled() patterns
  const { asUsages, styledCallUsages } = findConsumerUsages(options);

  // as-prop detection: find where as-prop components are defined
  if (asUsages.size > 0) {
    const defLines = rg(
      String.raw`const (${[...asUsages.keys()].join("|")})\b.*=\s*styled[.(]`,
      options.searchDirs,
    );
    for (const [filePath, names] of Object.entries(
      matchDefinitionsToUsages(defLines, asUsages, resolve, read),
    )) {
      for (const name of names) {
        ensure(filePath, name).as = true;
      }
    }
  }

  // re-styled detection: resolve imports to find definition files
  for (const [filePath, names] of Object.entries(
    resolveReStyledDefinitions(styledCallUsages, resolve, read),
  )) {
    for (const name of names) {
      ensure(filePath, name).styles = true;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Consumer usage scanning (single rg pass)
// ---------------------------------------------------------------------------

interface ConsumerUsages {
  /** Component name → set of files where `<Component as=...>` appears */
  asUsages: Map<string, Set<string>>;
  /** Array of { file, name } for each `styled(Component)` call */
  styledCallUsages: { file: string; name: string }[];
}

function findConsumerUsages(options: AnalyzeConsumersOptions): ConsumerUsages {
  // Single rg call matches both `as={` / `as=` props and `styled(Component)` calls
  const lines = rg(String.raw`(\bas[={]|styled\([A-Z])`, options.searchDirs);

  const asUsages = new Map<string, Set<string>>();
  const styledCallUsages: { file: string; name: string }[] = [];

  const jsxAsRe = /<([A-Z][A-Za-z0-9]*)\b/;
  const styledCallRe = /styled\(([A-Z][A-Za-z0-9]+)/;
  const asPropRe = /\bas[={]/;

  for (const line of lines) {
    const file = parseRgFile(line);

    // Check for as-prop usage: line must contain <ComponentName and \bas[={]
    if (asPropRe.test(line)) {
      const m = line.match(jsxAsRe);
      if (m?.[1]) {
        let files = asUsages.get(m[1]);
        if (!files) {
          files = new Set();
          asUsages.set(m[1], files);
        }
        files.add(file);
      }
    }

    // Check for styled(Component) call
    const styledMatch = line.match(styledCallRe);
    if (styledMatch?.[1]) {
      styledCallUsages.push({ file, name: styledMatch[1] });
    }
  }

  return { asUsages, styledCallUsages };
}

// ---------------------------------------------------------------------------
// as-prop: match definitions to usages
// ---------------------------------------------------------------------------

function matchDefinitionsToUsages(
  defLines: string[],
  asUsages: Map<string, Set<string>>,
  resolve: Resolve,
  read: CachedReader,
): Record<string, string[]> {
  const defNameRe = /const ([A-Z][A-Za-z0-9]*)\b/;
  const result: Record<string, string[]> = {};

  for (const line of defLines) {
    const defFile = parseRgFile(line);
    const m = line.match(defNameRe);
    if (!m) {
      continue;
    }
    const name = m[1] ?? "";

    const usageFiles = asUsages.get(name);
    if (!usageFiles) {
      continue;
    }

    // Same-file usage — no import needed
    if (usageFiles.has(defFile)) {
      (result[defFile] ??= []).push(name);
      continue;
    }

    // Cross-file — must be exported and imported by a usage file
    const defSrc = read(defFile);
    if (!fileExports(defSrc, name)) {
      continue;
    }

    for (const usageFile of usageFiles) {
      if (fileImportsFrom(read(usageFile), usageFile, name, defFile, resolve)) {
        (result[defFile] ??= []).push(name);
        break;
      }
    }
  }

  return sortedRecord(result);
}

// ---------------------------------------------------------------------------
// re-styled: resolve imports to find definition files
// ---------------------------------------------------------------------------

function resolveReStyledDefinitions(
  usages: { file: string; name: string }[],
  resolve: Resolve,
  read: CachedReader,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const seen = new Set<string>();

  for (const { file, name } of usages) {
    const importSource = findImportSource(read(file), name);
    if (!importSource) {
      continue; // defined locally, not imported
    }

    let defFile = resolve(importSource, file);
    if (!defFile) {
      continue; // from node_modules or unresolvable
    }

    // Follow barrel re-exports (index.ts -> actual definition)
    defFile = resolveBarrelReExport(defFile, name, resolve, read) ?? defFile;

    const key = `${defFile}:${name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    (result[defFile] ??= []).push(name);
  }

  return sortedRecord(result);
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

type Resolve = (specifier: string, fromFile: string) => string | null;
type CachedReader = (filePath: string) => string;

function createResolver(): Resolve {
  const factory = new ResolverFactory({
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    conditionNames: ["import", "types"],
    mainFields: ["module", "main"],
    tsconfig: { configFile: path.resolve("tsconfig.json") },
  });

  return (specifier: string, fromFile: string): string | null => {
    const fromDir = path.resolve(path.dirname(fromFile));
    const result = factory.sync(fromDir, specifier);
    if (result.error || !result.path) {
      return null;
    }
    return path.relative(process.cwd(), result.path);
  };
}

function findImportSource(src: string, localName: string): string | null {
  // Named import (including aliases like `import { Foo as localName }`)
  const namedRe = new RegExp(
    String.raw`import\s+\{[^}]*\b${localName}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
  );
  const namedMatch = src.match(namedRe);
  if (namedMatch?.[1]) {
    return namedMatch[1];
  }

  // Default import
  const defaultRe = new RegExp(String.raw`import\s+${localName}\s+from\s+["']([^"']+)["']`);
  const defaultMatch = src.match(defaultRe);
  if (defaultMatch?.[1]) {
    return defaultMatch[1];
  }

  return null;
}

function resolveBarrelReExport(
  filePath: string,
  name: string,
  resolve: Resolve,
  read: CachedReader,
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
  const namedRe = new RegExp(
    String.raw`export\s*\{[^}]*\b${name}\b[^}]*\}\s*from\s*["']([^"']+)["']`,
  );
  const namedMatch = src.match(namedRe);
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Extract the file path from an rg output line (format: `path:line:content`) */
function parseRgFile(line: string): string {
  return line.split(":")[0] ?? "";
}

function rg(pattern: string, searchDirs: string[]): string[] {
  try {
    const dirs = searchDirs.map(shellQuote).join(" ");
    const cmd = `rg ${shellQuote(pattern)} --no-heading --glob '*.tsx' --glob '*.ts' --glob '*.jsx' ${dirs}`;
    return execSync(cmd, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
  } catch {
    return []; // rg exits 1 on no matches
  }
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function cachedReader(): CachedReader {
  const cache = new Map<string, string>();
  return (f: string) => {
    let content = cache.get(f);
    if (content === undefined) {
      content = readFileSync(f, "utf-8");
      cache.set(f, content);
    }
    return content;
  };
}

function fileExports(src: string, name: string): boolean {
  return new RegExp(
    String.raw`export\s+(?:(?:const|function|class|let|var)\s+${name}\b|default\s+${name}\b)` +
      String.raw`|export\s*\{[^}]*\b${name}\b[^}]*\}`,
  ).test(src);
}

function fileImportsFrom(
  usageSrc: string,
  usageFile: string,
  name: string,
  defFile: string,
  resolve: Resolve,
): boolean {
  const re = new RegExp(
    String.raw`import\s+\{[^}]*\b${name}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
    "g",
  );

  // Heuristic path fragments for fallback matching when resolution fails
  const stem = path.parse(defFile).name;
  const parent = path.basename(path.dirname(defFile));

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

  return false;
}

function sortedRecord(record: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, [...values].sort()]),
  );
}
