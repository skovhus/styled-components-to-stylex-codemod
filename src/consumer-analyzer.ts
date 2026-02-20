// Utilities for detecting styled-component usage patterns across consumer code.
//
// createExternalInterface — scan consumer directories, return adapter callback + raw map
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { ExternalInterfaceContext, ExternalInterfaceResult } from "./adapter.js";

const require = createRequire(import.meta.url);

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
    get: (ctx) =>
      map.get(`${path.resolve(ctx.filePath)}:${ctx.componentName}`) ?? { styles: false, as: false },
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
  const { asUsages, styledCallUsages } = findConsumerUsages(options, read);

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

function findConsumerUsages(options: AnalyzeConsumersOptions, read: CachedReader): ConsumerUsages {
  // Single rg call matches both `as={` / `as=` props and `styled(Component)` calls
  const lines = rg(String.raw`(\bas[={]|styled\([A-Z])`, options.searchDirs);

  const asUsages = new Map<string, Set<string>>();
  const styledCallUsages: { file: string; name: string }[] = [];
  const unresolvedAsFiles = new Set<string>();

  const jsxAsRe = /<([A-Z][A-Za-z0-9]*)\b/;
  const styledCallRe = /styled\(([A-Z][A-Za-z0-9]+)/;
  const asPropRe = /\bas[={]/;

  for (const line of lines) {
    const file = parseRgFile(line);

    // Check for as-prop usage: line must contain <ComponentName and \bas[={]
    if (asPropRe.test(line)) {
      const m = line.match(jsxAsRe);
      if (m?.[1]) {
        addToSetMap(asUsages, m[1], file);
      } else {
        // Component name on a different line (multiline JSX) — resolve later
        unresolvedAsFiles.add(file);
      }
    }

    // Check for styled(Component) call
    const styledMatch = line.match(styledCallRe);
    if (styledMatch?.[1]) {
      styledCallUsages.push({ file, name: styledMatch[1] });
    }
  }

  // Resolve multiline JSX: <Component\n  as={...}> where tag and prop span lines
  if (unresolvedAsFiles.size > 0) {
    const multilineJsxAsRe = /<([A-Z][A-Za-z0-9]*)\b[^>]*?\bas[={]/g;
    for (const file of unresolvedAsFiles) {
      try {
        for (const m of read(file).matchAll(multilineJsxAsRe)) {
          if (m[1]) {
            addToSetMap(asUsages, m[1], file);
          }
        }
      } catch {
        // skip unreadable files
      }
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

    const defSrc = read(defFile);
    if (!fileExports(defSrc, name)) {
      continue;
    }

    // Same-file usage — no import needed
    if (usageFiles.has(defFile)) {
      (result[defFile] ??= []).push(name);
      continue;
    }

    // Cross-file — must be imported by a usage file

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
    const importInfo = findImportSource(read(file), name);
    if (!importInfo) {
      continue; // defined locally, not imported
    }

    const { source: importSource, exportedName } = importInfo;

    let defFile = resolve(importSource, file);
    if (!defFile) {
      continue; // from node_modules or unresolvable
    }

    // Follow barrel re-exports (index.ts -> actual definition)
    defFile = resolveBarrelReExport(defFile, exportedName, resolve, read) ?? defFile;

    const key = `${defFile}:${exportedName}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    // Verify the component is exported from the definition file
    try {
      if (!fileExports(read(defFile), exportedName)) {
        continue;
      }
    } catch {
      continue; // skip unreadable files
    }

    (result[defFile] ??= []).push(exportedName);
  }

  return sortedRecord(result);
}

// ---------------------------------------------------------------------------
// Import resolution
// ---------------------------------------------------------------------------

type Resolve = (specifier: string, fromFile: string) => string | null;
type CachedReader = (filePath: string) => string;

const OPTIONAL_RESOLVER_DEPENDENCY = "oxc-resolver";
const MISSING_RESOLVER_ERROR_MESSAGE = [
  "[styled-components-to-stylex-codemod] createExternalInterface requires the optional dependency `oxc-resolver`.",
  "Install it to enable external interface auto-detection:",
  "  npm install oxc-resolver",
  "  # or",
  "  pnpm add oxc-resolver",
].join("\n");

interface OxcResolverResult {
  error?: unknown;
  path?: string;
}

interface OxcResolverInstance {
  resolveFileSync(fromFilePath: string, specifier: string): OxcResolverResult;
}

interface OxcResolverOptions {
  extensions: string[];
  conditionNames: string[];
  mainFields: string[];
  extensionAlias: Record<string, string[]>;
  tsconfig: "auto";
}

interface OxcResolverFactory {
  new (options: OxcResolverOptions): OxcResolverInstance;
}

interface OxcResolverModule {
  ResolverFactory?: OxcResolverFactory;
}

function createResolver(): Resolve {
  const ResolverFactory = loadResolverFactory();
  const factory = new ResolverFactory({
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    conditionNames: ["import", "types", "default"],
    mainFields: ["module", "main"],
    // When package.json "exports" wildcards resolve to a .ts path that doesn't
    // exist (e.g. "./*": ["./src/*.ts", "./src/*.tsx"]), extensionAlias lets
    // oxc-resolver try .tsx as a fallback during file resolution.
    extensionAlias: { ".ts": [".ts", ".tsx"] },
    // Auto-discover the nearest tsconfig.json per file for path alias resolution.
    tsconfig: "auto",
  });

  return (specifier: string, fromFile: string): string | null => {
    // resolveFileSync (not sync) is required for tsconfig: "auto" to work —
    // it auto-discovers the nearest tsconfig.json per file.
    const result = factory.resolveFileSync(path.resolve(fromFile), specifier);
    if (result.error || !result.path) {
      return null;
    }
    return path.relative(process.cwd(), result.path);
  };
}

function loadResolverFactory(): OxcResolverFactory {
  try {
    const module = require(OPTIONAL_RESOLVER_DEPENDENCY) as OxcResolverModule;
    if (typeof module.ResolverFactory !== "function") {
      throw new Error(
        `Invalid optional dependency \`${OPTIONAL_RESOLVER_DEPENDENCY}\`: missing \`ResolverFactory\` export.`,
      );
    }
    return module.ResolverFactory;
  } catch (error) {
    if (isMissingModuleError(error, OPTIONAL_RESOLVER_DEPENDENCY)) {
      process.stderr.write(`${MISSING_RESOLVER_ERROR_MESSAGE}\n`);
      throw new Error(MISSING_RESOLVER_ERROR_MESSAGE, { cause: error });
    }
    throw error;
  }
}

function isMissingModuleError(error: unknown, moduleName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const moduleError = error as Error & { code?: string };
  if (moduleError.code !== "MODULE_NOT_FOUND") {
    return false;
  }
  return (
    moduleError.message.includes(`'${moduleName}'`) ||
    moduleError.message.includes(`"${moduleName}"`)
  );
}

interface ImportInfo {
  source: string;
  /** The original exported name (differs from local name for aliased imports) */
  exportedName: string;
}

function findImportSource(src: string, localName: string): ImportInfo | null {
  // Named aliased import: `import { OriginalName as localName }`
  // Skip `{ default as X }` — treat it like a default import so the local name is used.
  const aliasRe = new RegExp(
    String.raw`import\s+\{[^}]*\b(\w+)\s+as\s+${localName}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
  );
  const aliasMatch = src.match(aliasRe);
  if (aliasMatch?.[1] && aliasMatch[1] !== "default" && aliasMatch[2]) {
    return { source: aliasMatch[2], exportedName: aliasMatch[1] };
  }

  // Named import (no alias): `import { localName }`
  const namedRe = new RegExp(
    String.raw`import\s+\{[^}]*\b${localName}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
  );
  const namedMatch = src.match(namedRe);
  if (namedMatch?.[1]) {
    return { source: namedMatch[1], exportedName: localName };
  }

  // Default import (including `import Name, { type X } from "..."`)
  const defaultRe = new RegExp(
    String.raw`import\s+${localName}(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']`,
  );
  const defaultMatch = src.match(defaultRe);
  if (defaultMatch?.[1]) {
    return { source: defaultMatch[1], exportedName: localName };
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
  } catch (err: unknown) {
    // rg exits 1 on no matches — that's fine, return empty
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 1) {
      return [];
    }
    // Any other error (rg not installed, exit code 2, etc.) should propagate
    throw new Error(
      "ripgrep (rg) is required but not available. Install it: https://github.com/BurntSushi/ripgrep",
      { cause: err },
    );
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
  // Match both named imports (`import { Name } from`) and default imports (`import Name from`)
  const namedRe = new RegExp(
    String.raw`import\s+\{[^}]*\b${name}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
    "g",
  );
  const defaultRe = new RegExp(
    String.raw`import\s+${name}(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+)["']`,
    "g",
  );

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

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

function sortedRecord(record: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, [...values].sort()]),
  );
}
