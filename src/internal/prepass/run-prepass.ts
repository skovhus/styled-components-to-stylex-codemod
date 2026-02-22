/**
 * Unified prepass: single pass for both cross-file selector scanning
 * and consumer analysis (external interface detection).
 *
 * Reads each file once, classifies by content (styled-components / as-prop),
 * and runs AST parsing + consumer analysis only on relevant files.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { relative, resolve as pathResolve } from "node:path";
import type { ExternalInterfaceResult } from "../../adapter.js";
import { addToSetMap } from "../utilities/collection-utils.js";
import {
  fileExports,
  fileImportsFrom,
  findImportSource,
  resolveBarrelReExport,
  type Resolve,
} from "./extract-external-interface.js";
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";
import type { ModuleResolver } from "./resolve-imports.js";
import {
  BARE_TEMPLATE_IDENTIFIER_RE,
  buildImportMapFromNodes,
  deduplicateAndResolve,
  findComponentSelectorLocalsFromNodes,
  findStyledImportNameFromNodes,
  walkForImportsAndTemplates,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
} from "./scan-cross-file-selectors.js";
import { isSelectorContext } from "../utilities/selector-context-heuristic.js";

/* ── Public types ─────────────────────────────────────────────────────── */

interface PrepassOptions {
  filesToTransform: readonly string[];
  consumerPaths: readonly string[];
  resolver: ModuleResolver;
  parserName?: PrepassParserName;
  /** When true, also detect as-prop + styled() wrapping patterns */
  createExternalInterface: boolean;
  /** When true, cache AST-derived data (importMap, styledImportName, selectorLocals) keyed by content hash */
  enableAstCache?: boolean;
}

interface PrepassResult {
  crossFileInfo: CrossFileInfo;
  consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined;
}

/** Cached AST-derived data for a single file, keyed by content hash. */
interface AstCacheEntry {
  importMap: Map<string, { source: string; importedName: string }>;
  styledImportName: string | undefined;
  selectorLocals: Set<string>;
}

/* ── Regex patterns (compiled once at module scope) ───────────────────── */

const AS_PROP_RE = /\bas[={]/;
const STYLED_CALL_RE = /styled\(([A-Z][A-Za-z0-9]+)/g;
const STYLED_DEF_RE = /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled[.(]/g;
/** Matches <Component ...as= across lines. [^<>]* avoids crossing tag boundaries. */
const JSX_AS_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)\b[^<>]*\bas[={]/g;

/* ── Public API ───────────────────────────────────────────────────────── */

export async function runPrepass(options: PrepassOptions): Promise<PrepassResult> {
  const {
    filesToTransform,
    consumerPaths,
    resolver,
    parserName,
    createExternalInterface,
    enableAstCache,
  } = options;
  const t0 = performance.now();
  const astCache = enableAstCache ? new Map<string, AstCacheEntry>() : undefined;
  // Normalize paths to real paths to handle macOS /var → /private/var symlinks.
  // Probe the first file — if realpath matches, skip realpathSync entirely.
  const needsRealpath = (() => {
    if (filesToTransform.length === 0) {
      return false;
    }
    const sample = pathResolve(filesToTransform[0]!);
    try {
      return realpathSync(sample) !== sample;
    } catch {
      return false;
    }
  })();

  const realPathCache = new Map<string, string>();
  const toRealPath = needsRealpath
    ? (p: string): string => {
        const abs = pathResolve(p);
        let real = realPathCache.get(abs);
        if (real === undefined) {
          try {
            real = realpathSync(abs);
          } catch {
            real = abs;
          }
          realPathCache.set(abs, real);
        }
        return real;
      }
    : (p: string): string => pathResolve(p);

  const transformSet = new Set(filesToTransform.map(toRealPath));
  const allFiles = deduplicateAndResolve(filesToTransform, consumerPaths).map(toRealPath);
  const allFilesSet = new Set(allFiles);
  const uniqueAllFiles = [...allFilesSet];
  const parser = createPrepassParser(parserName);

  const resolveCache = new Map<string, string | null>();
  const resolve: Resolve = (specifier, fromFile) => {
    const absFromFile = pathResolve(fromFile);
    const key = `${absFromFile}\0${specifier}`;
    const cached = resolveCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const result = resolver.resolve(absFromFile, specifier);
    const normalized = result ? toRealPath(result) : null;
    resolveCache.set(key, normalized);
    return normalized;
  };

  // Cross-file selector state
  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingMarkerSidecar = new Map<string, Set<string>>();
  const componentsNeedingGlobalSelectorBridge = new Map<string, Set<string>>();

  // Consumer analysis state (if createExternalInterface)
  const asUsages = new Map<string, Set<string>>();
  const styledCallUsages: { file: string; name: string }[] = [];
  const styledDefFiles = new Map<string, Set<string>>();

  // File content cache — populated on-demand, used for cross-referencing in Phase 2
  const fileContents = new Map<string, string>();

  // Cached reader that uses the in-memory cache, falling back to sync read
  const cachedRead = (filePath: string): string => {
    const content = fileContents.get(filePath);
    if (content !== undefined) {
      return content;
    }
    try {
      const src = readFileSync(filePath, "utf-8");
      fileContents.set(filePath, src);
      return src;
    } catch {
      return "";
    }
  };

  // Optional rg pre-filter: skip reading files that don't contain relevant patterns
  const rgFiltered = rgPreFilter(uniqueAllFiles);

  // Phase 1: Single pass — read all files, classify by content, analyze relevant ones.
  for (const filePath of uniqueAllFiles) {
    // If rg pre-filter is available and file is not in the result set, skip it
    if (rgFiltered && !rgFiltered.has(filePath)) {
      continue;
    }

    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const hasStyled = source.includes("styled-components");
    const hasAsProp = createExternalInterface && AS_PROP_RE.test(source);

    if (!hasStyled && !hasAsProp) {
      continue;
    }

    // Cache source for cross-referencing in Phase 2
    fileContents.set(filePath, source);

    // --- Cross-file selector scanning ---
    // Two-tier filter: (1) regex pre-filter quickly identifies files with potential
    // selector patterns like `${Identifier} {`, then (2) AST parsing verifies them.
    // This reduces AST-parsed files by ~44% (888 → ~500) saving ~120ms of babel time.
    if (
      hasStyled &&
      BARE_TEMPLATE_IDENTIFIER_RE.test(source) &&
      hasRegexSelectorCandidate(source)
    ) {
      const usages = scanFileForSelectorsAst(
        filePath,
        source,
        transformSet,
        resolver,
        parser,
        toRealPath,
        astCache,
        createExternalInterface,
      );
      if (usages.length > 0) {
        selectorUsages.set(filePath, usages);
        for (const usage of usages) {
          if (usage.consumerIsTransformed) {
            addToSetMap(componentsNeedingMarkerSidecar, usage.resolvedPath, usage.importedName);
          } else {
            addToSetMap(
              componentsNeedingGlobalSelectorBridge,
              usage.resolvedPath,
              usage.importedName,
            );
          }
        }
      }
    }

    if (createExternalInterface && hasStyled) {
      // Detect styled(Component) calls
      STYLED_CALL_RE.lastIndex = 0;
      for (const m of source.matchAll(STYLED_CALL_RE)) {
        if (m[1]) {
          styledCallUsages.push({ file: filePath, name: m[1] });
        }
      }

      // Detect styled component definitions (for as-prop matching)
      STYLED_DEF_RE.lastIndex = 0;
      for (const m of source.matchAll(STYLED_DEF_RE)) {
        if (m[1]) {
          addToSetMap(styledDefFiles, filePath, m[1]);
        }
      }
    }

    // --- as-prop detection ---
    if (hasAsProp) {
      JSX_AS_COMPONENT_RE.lastIndex = 0;
      for (const m of source.matchAll(JSX_AS_COMPONENT_RE)) {
        if (m[1]) {
          addToSetMap(asUsages, m[1], filePath);
        }
      }
    }
  }

  // Phase 2: Cross-referencing consumer usages (if createExternalInterface)
  let consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined;

  if (createExternalInterface) {
    consumerAnalysis = new Map();

    const ensure = (filePath: string, name: string) => {
      const key = `${toRealPath(filePath)}:${name}`;
      let entry = consumerAnalysis!.get(key);
      if (!entry) {
        entry = { styles: false, as: false };
        consumerAnalysis!.set(key, entry);
      }
      return entry;
    };

    // as-prop: match definitions to usages
    if (asUsages.size > 0) {
      for (const [defFile, names] of styledDefFiles) {
        const defSrc = cachedRead(defFile);
        for (const name of names) {
          const usageFiles = asUsages.get(name);
          if (!usageFiles) {
            continue;
          }

          if (!fileExports(defSrc, name)) {
            continue;
          }

          // Same-file usage — no import needed
          if (usageFiles.has(defFile)) {
            ensure(defFile, name).as = true;
            continue;
          }

          // Cross-file — must be imported by a usage file
          for (const usageFile of usageFiles) {
            if (fileImportsFrom(cachedRead(usageFile), usageFile, name, defFile, resolve)) {
              ensure(defFile, name).as = true;
              break;
            }
          }
        }
      }
    }

    // re-styled: resolve imports to find definition files
    {
      const seen = new Set<string>();
      for (const { file, name } of styledCallUsages) {
        const importInfo = findImportSource(cachedRead(file), name);
        if (!importInfo) {
          continue;
        }

        const { source: importSource, exportedName } = importInfo;

        let defFile = resolve(importSource, file);
        if (!defFile) {
          continue;
        }

        // Follow barrel re-exports (index.ts -> actual definition)
        defFile = resolveBarrelReExport(defFile, exportedName, resolve, cachedRead) ?? defFile;

        const key = `${defFile}:${exportedName}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        // Verify the component is exported from the definition file
        try {
          if (!fileExports(cachedRead(defFile), exportedName)) {
            continue;
          }
        } catch {
          continue;
        }

        ensure(defFile, exportedName).styles = true;
      }
    }
  }

  const crossFileInfo: CrossFileInfo = {
    selectorUsages,
    componentsNeedingMarkerSidecar,
    componentsNeedingGlobalSelectorBridge,
  };

  // Summary log
  {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const reStyled = consumerAnalysis
      ? [...consumerAnalysis.values()].filter((v) => v.styles).length
      : 0;
    const asProp = consumerAnalysis ? [...consumerAnalysis.values()].filter((v) => v.as).length : 0;
    process.stdout.write(
      `Prepass: scanned ${uniqueAllFiles.length} files in ${elapsed}s` +
        ` — ${fileContents.size} with styled-components` +
        `, ${selectorUsages.size} cross-file selectors` +
        `, ${reStyled} re-styled` +
        `, ${asProp} as-prop\n`,
    );
  }

  if (process.env.DEBUG_CODEMOD) {
    logPrepassDebug(uniqueAllFiles, crossFileInfo, consumerAnalysis);
  }

  return { crossFileInfo, consumerAnalysis };
}

/* ── Phase helpers ────────────────────────────────────────────────────── */

/** Matches `${Identifier}` in source — used to find potential selector expressions. */
const SELECTOR_EXPR_RE = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;
/** Matches static `import ... from "..."` declarations (multi-line safe). */
const IMPORT_DECLARATION_RE = /import\s+[\s\S]*?\s+from\s+["'][^"']+["']/g;
const IMPORT_IDENTIFIER_RE_CACHE = new Map<string, RegExp>();

/**
 * Fast regex pre-filter: checks if the source contains any `${Identifier}`
 * that appears to be in a CSS selector context (before `{`, not after `:`).
 *
 * This reduces the number of files needing AST parsing from ~888 to ~500,
 * saving ~120ms of babel parsing time per run.
 */
function hasRegexSelectorCandidate(source: string): boolean {
  const importText = collectImportDeclarationText(source);
  if (importText.length === 0) {
    return false;
  }

  SELECTOR_EXPR_RE.lastIndex = 0;
  for (const m of source.matchAll(SELECTOR_EXPR_RE)) {
    const identifier = m[1];
    if (!identifier || !importTextMentionsIdentifier(importText, identifier)) {
      continue;
    }
    const pos = m.index;
    const before = source.slice(0, pos).trimEnd();
    const after = source.slice(pos + m[0].length).trimStart();
    if (isSelectorContext(before, after)) {
      return true;
    }
  }
  return false;
}

function collectImportDeclarationText(source: string): string {
  IMPORT_DECLARATION_RE.lastIndex = 0;
  const blocks: string[] = [];
  for (const match of source.matchAll(IMPORT_DECLARATION_RE)) {
    if (match[0]) {
      blocks.push(match[0]);
    }
  }
  return blocks.join("\n");
}

function importTextMentionsIdentifier(importText: string, identifier: string): boolean {
  let re = IMPORT_IDENTIFIER_RE_CACHE.get(identifier);
  if (!re) {
    re = new RegExp(`(?:^|[^A-Za-z0-9_$])${escapeRegexForRegExp(identifier)}(?:$|[^A-Za-z0-9_$])`);
    IMPORT_IDENTIFIER_RE_CACHE.set(identifier, re);
  }
  return re.test(importText);
}

function escapeRegexForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan a single file for cross-file selector usages using AST parsing. */
function scanFileForSelectorsAst(
  filePath: string,
  source: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  parser: ReturnType<typeof createPrepassParser>,
  toRealPath: (p: string) => string,
  cache?: Map<string, AstCacheEntry>,
  failOnParseError?: boolean,
): CrossFileSelectorUsage[] {
  // Check cache by content hash (same content at different paths → one parse)
  const hash = cache ? createHash("md5").update(source).digest("hex") : undefined;
  const cached = cache && hash ? cache.get(hash) : undefined;

  let importMap: Map<string, { source: string; importedName: string }>;
  let styledImportName: string | undefined;
  let selectorLocals: Set<string>;

  if (cached) {
    importMap = cached.importMap;
    styledImportName = cached.styledImportName;
    selectorLocals = cached.selectorLocals;
  } else {
    let ast: AstNode;
    try {
      ast = parser.parse(source) as AstNode;
    } catch (err) {
      if (failOnParseError) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse ${filePath}: ${reason}`);
      }
      return [];
    }

    const program = (ast.program ?? ast) as AstNode;

    const importNodes: AstNode[] = [];
    const taggedTemplateNodes: AstNode[] = [];
    walkForImportsAndTemplates(program, importNodes, taggedTemplateNodes);

    importMap = buildImportMapFromNodes(importNodes);
    styledImportName = findStyledImportNameFromNodes(importNodes);
    selectorLocals = styledImportName
      ? findComponentSelectorLocalsFromNodes(taggedTemplateNodes, styledImportName)
      : new Set();

    if (cache && hash) {
      cache.set(hash, { importMap, styledImportName, selectorLocals });
    }
  }

  if (importMap.size === 0 || !styledImportName || selectorLocals.size === 0) {
    return [];
  }

  // Resolve loop always runs — depends on filePath + resolver, not just file content
  const consumerIsTransformed = transformSet.has(filePath);
  const usages: CrossFileSelectorUsage[] = [];
  for (const localName of selectorLocals) {
    const imp = importMap.get(localName);
    if (!imp || imp.source === "styled-components") {
      continue;
    }

    const resolvedPath = resolver.resolve(filePath, imp.source);
    if (!resolvedPath) {
      continue;
    }
    const realResolved = toRealPath(resolvedPath);
    if (realResolved === filePath) {
      continue;
    }

    usages.push({
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: realResolved,
      consumerPath: filePath,
      consumerIsTransformed,
    });
  }

  return usages;
}

/* ── ripgrep pre-filter ───────────────────────────────────────────────── */

/**
 * Use ripgrep to quickly find files containing "styled-components" or `as[={]`.
 * Returns a Set of absolute file paths, or undefined if rg is not available.
 */
function rgPreFilter(files: readonly string[]): Set<string> | undefined {
  const dirs = deduplicateParentDirs(files);
  if (dirs.length === 0) {
    return undefined;
  }

  try {
    const pattern = String.raw`(styled-components|\bas[={])`;
    const globArgs = ["*.tsx", "*.ts", "*.jsx", "*.js", "*.mts", "*.cts", "*.mjs", "*.cjs"]
      .map((glob) => `--glob ${shellQuote(glob)}`)
      .join(" ");
    const cmd = `rg -l ${shellQuote(pattern)} ${globArgs} ${dirs.map(shellQuote).join(" ")}`;
    const output = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return new Set(
      output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => pathResolve(f)),
    );
  } catch (err: unknown) {
    // rg exit code 1 = no matches (valid result: empty set)
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 1) {
      return new Set();
    }
    // rg not installed or other error — fall back to reading all files
    return undefined;
  }
}

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Given a list of absolute file paths, extract the minimal set of parent directories.
 * E.g., ["/a/b/c.ts", "/a/b/d.ts", "/a/e/f.ts"] → ["/a/b/", "/a/e/"]
 * Then dedup so "/a/" subsumes both "/a/b/" and "/a/e/".
 */
function deduplicateParentDirs(files: readonly string[]): string[] {
  const dirSet = new Set<string>();
  for (const f of files) {
    dirSet.add(f.slice(0, f.lastIndexOf("/") + 1));
  }
  const sorted = [...dirSet].sort();
  const result: string[] = [];
  for (const d of sorted) {
    if (result.length > 0 && d.startsWith(result[result.length - 1]!)) {
      continue;
    }
    result.push(d);
  }
  return result;
}

/* ── Debug logging ────────────────────────────────────────────────────── */

function logPrepassDebug(
  scannedFiles: string[],
  info: CrossFileInfo,
  consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined,
): void {
  const cwd = process.cwd();
  const rel = (p: string): string => relative(cwd, p);

  const lines: string[] = ["[DEBUG_CODEMOD] Unified prepass:"];
  lines.push(`  Scanned ${scannedFiles.length} file(s)`);

  if (info.selectorUsages.size === 0) {
    lines.push("  No cross-file selector usages found.");
  } else {
    lines.push(`  Found cross-file selector usages in ${info.selectorUsages.size} file(s):`);
    for (const [consumer, usages] of info.selectorUsages) {
      for (const u of usages) {
        lines.push(
          `    ${rel(consumer)} → ${u.importedName} (from ${rel(u.resolvedPath)}, transformed=${u.consumerIsTransformed})`,
        );
      }
    }
  }

  if (info.componentsNeedingMarkerSidecar.size > 0) {
    lines.push("  Components needing marker sidecar (both consumer and target transformed):");
    for (const [file, names] of info.componentsNeedingMarkerSidecar) {
      lines.push(`    ${rel(file)}: ${[...names].join(", ")}`);
    }
  }

  if (info.componentsNeedingGlobalSelectorBridge.size > 0) {
    lines.push("  Components needing global selector bridge className (consumer not transformed):");
    for (const [file, names] of info.componentsNeedingGlobalSelectorBridge) {
      lines.push(`    ${rel(file)}: ${[...names].join(", ")}`);
    }
  }

  if (consumerAnalysis) {
    lines.push(`  Consumer analysis: ${consumerAnalysis.size} entries`);
  }

  process.stderr.write(lines.join("\n") + "\n");
}
