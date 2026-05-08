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
import type {
  ExternalInterfaceResult,
  ResolveBaseComponentContext,
  ResolveBaseComponentResult,
} from "../../adapter.js";
import type { ComponentPropUsageInfo, StaticPropValue } from "../transform-types.js";
import { Logger } from "../logger.js";
import { addToSetMap } from "../utilities/collection-utils.js";
import { escapeRegex } from "../utilities/string-utils.js";
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
  applyBridgeFields,
  BARE_TEMPLATE_IDENTIFIER_RE,
  buildImportMapFromNodes,
  categorizeSelectorUsages,
  deduplicateAndResolve,
  findComponentSelectorLocalsFromNodes,
  findCssImportNamesFromNodes,
  collectStyledLocalBindingNames,
  findStyledImportNameFromNodes,
  walkForImportsAndTemplates,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
  type ImportEntry,
} from "./scan-cross-file-selectors.js";
import { isSelectorContext } from "../utilities/selector-context-heuristic.js";
import {
  computeGlobalLeafKeys,
  extractStyledDefBasesFromAstProgram,
  extractStyledDefBasesFromSource,
  type StyledDefBasesMap,
} from "./compute-leaf-set.js";

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
  /** When true, compute {@link CrossFileInfo.globalLeafKeys} for leaves-only transforms */
  leavesOnly?: boolean;
  /** Optional adapter hook so adapter-resolved imported bases can count as leaves. */
  resolveBaseComponent?: (
    ctx: ResolveBaseComponentContext,
  ) => ResolveBaseComponentResult | undefined;
}

interface ForwardedAsConsumerEntry {
  localStyledName: string;
  /** Resolved path of the wrapped component's definition file */
  targetPath: string;
}

interface PrepassResult {
  crossFileInfo: CrossFileInfo;
  consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined;
  /** Unconverted consumers that wrap converted components with styled() and use `as` prop */
  forwardedAsConsumers: Map<string, ForwardedAsConsumerEntry[]>;
}

/** Cached AST-derived data for a single file, keyed by content hash. */
interface AstCacheEntry {
  importMap: Map<string, ImportEntry>;
  styledImportName: string | undefined;
  cssImportNames: Set<string>;
  selectorLocals: Set<string>;
}

/* ── Regex patterns (compiled once at module scope) ───────────────────── */

const AS_PROP_RE = /\bas[={]/;
const REF_PROP_RE = /\bref[={]/;
const STYLED_CALL_RE = /styled\(([A-Z][A-Za-z0-9]+)/g;
const STYLED_DEF_RE = /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled[.(]/g;
/** Matches <Component ...as= across lines. [^<>]* avoids crossing tag boundaries. */
const JSX_AS_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)\b[^<>]*\bas[={]/g;
/** Matches <Component ...ref= across lines. [^<>]* avoids crossing tag boundaries. */
const JSX_REF_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)\b[^<>]*\bref[={]/g;
/** Captures both the local styled name and the wrapped component: styled(Flex) → ["StyledFlex", "Flex"] */
const STYLED_COMPONENT_WRAPPER_RE =
  /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled\(\s*([A-Z][A-Za-z0-9]*)\s*\)/g;

/* ── Public API ───────────────────────────────────────────────────────── */

export async function runPrepass(options: PrepassOptions): Promise<PrepassResult> {
  const {
    filesToTransform,
    consumerPaths,
    resolver,
    parserName,
    createExternalInterface,
    enableAstCache,
    leavesOnly,
    resolveBaseComponent,
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
  const refUsages = new Map<string, Set<string>>();
  const styledCallUsages: { file: string; name: string }[] = [];
  const styledDefFiles = new Map<string, Set<string>>();
  const classNameStyleUsages = new Map<string, Set<string>>();
  const classNameUsages = new Map<string, Set<string>>();
  const styleUsages = new Map<string, Set<string>>();
  const elementPropUsages = new Map<string, Set<string>>();
  const spreadPropUsages = new Map<string, Set<string>>();
  const propUsageCandidates = new Map<string, ConsumerStaticPropUsage[]>();
  const styledWrapperUsages: { file: string; localStyledName: string; wrappedName: string }[] = [];

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
    const hasRefProp = createExternalInterface && REF_PROP_RE.test(source);

    if (!hasStyled && !hasAsProp && !hasRefProp) {
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
        cachedRead,
        astCache,
        createExternalInterface,
      );
      if (usages.length > 0) {
        selectorUsages.set(filePath, usages);
        categorizeSelectorUsages(
          usages,
          componentsNeedingMarkerSidecar,
          componentsNeedingGlobalSelectorBridge,
        );
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

      // Detect styled(Component) wrappers for forwardedAs patching
      STYLED_COMPONENT_WRAPPER_RE.lastIndex = 0;
      for (const m of source.matchAll(STYLED_COMPONENT_WRAPPER_RE)) {
        if (m[1] && m[2]) {
          styledWrapperUsages.push({ file: filePath, localStyledName: m[1], wrappedName: m[2] });
        }
      }
    }

    // --- as-prop / ref-prop detection ---
    // Resolve aliased imports so that `import { Button as MyBtn }` followed by
    // `<MyBtn as="a">` or `<MyBtn ref={r}>` records the usage under `Button`.
    if (hasAsProp || hasRefProp) {
      let aliasMap: Map<string, string> | undefined;
      const resolveTagName = (tagName: string): string => {
        aliasMap ??= buildLocalToImportedMap(source);
        return aliasMap.get(tagName) ?? tagName;
      };

      if (hasAsProp) {
        JSX_AS_COMPONENT_RE.lastIndex = 0;
        for (const m of source.matchAll(JSX_AS_COMPONENT_RE)) {
          if (m[1]) {
            addToSetMap(asUsages, resolveTagName(m[1]), filePath);
          }
        }
      }

      if (hasRefProp) {
        JSX_REF_COMPONENT_RE.lastIndex = 0;
        for (const m of source.matchAll(JSX_REF_COMPONENT_RE)) {
          if (m[1]) {
            addToSetMap(refUsages, resolveTagName(m[1]), filePath);
          }
        }
      }
    }
  }

  const styledFileCount = fileContents.size;

  // Phase 1.5: Targeted JSX consumer prop detection.
  // After Phase 1 identified all styled component definitions, scan consumers for:
  // - className/style/as external surface (when requested)
  // - static prop values that can later drive variant emission
  if (styledDefFiles.size > 0) {
    const allStyledNames = new Set<string>();
    for (const names of styledDefFiles.values()) {
      for (const name of names) {
        allStyledNames.add(name);
      }
    }

    if (allStyledNames.size > 0) {
      // Use targeted rg to find files containing className/style props (fast, small pattern)
      const rgHits = createExternalInterface ? rgClassNameStyleFilter(uniqueAllFiles) : undefined;
      const jsxHits = rgJsxComponentFilter(uniqueAllFiles);

      const scanAndRecord = (filePath: string, source: string) => {
        if (createExternalInterface) {
          for (const result of scanConsumerProps(source, allStyledNames)) {
            addToSetMap(classNameStyleUsages, result.name, filePath);
            if (result.className) {
              addToSetMap(classNameUsages, result.name, filePath);
            }
            if (result.style) {
              addToSetMap(styleUsages, result.name, filePath);
            }
            if (result.elementProps) {
              addToSetMap(elementPropUsages, result.name, filePath);
            }
            if (result.spreadProps) {
              addToSetMap(spreadPropUsages, result.name, filePath);
            }
          }
        }
        for (const usage of scanConsumerStaticPropUsages(
          filePath,
          source,
          allStyledNames,
          parser,
        )) {
          const entries = propUsageCandidates.get(usage.name) ?? [];
          entries.push(usage);
          propUsageCandidates.set(usage.name, entries);
        }
      };

      // Scan files already cached from Phase 1 first (no I/O cost)
      for (const [filePath, source] of fileContents) {
        if (
          jsxHits &&
          !jsxHits.has(filePath) &&
          (!createExternalInterface || !rgHits?.has(filePath))
        ) {
          continue;
        }
        scanAndRecord(filePath, source);
      }

      // Then scan uncached files that matched the rg pre-filter.
      // Only read files not already cached from Phase 1 — these are consumer
      // files without styled-components (e.g., .stories.tsx, page components).
      // Intersect with allFilesSet to avoid scanning files outside the requested scope.
      const filesToScan = (() => {
        const hits = new Set<string>();
        const hasAnyFilter = (createExternalInterface && rgHits !== undefined) || jsxHits !== undefined;
        if (createExternalInterface && rgHits) {
          for (const f of rgHits) {
            hits.add(f);
          }
        }
        if (jsxHits) {
          for (const f of jsxHits) {
            hits.add(f);
          }
        }
        return hasAnyFilter
          ? [...hits].filter((f) => allFilesSet.has(f) && !fileContents.has(f))
          : uniqueAllFiles.filter((f) => !fileContents.has(f));
      })();

      for (const filePath of filesToScan) {
        const source = cachedRead(filePath);
        if (!source) {
          continue;
        }
        scanAndRecord(filePath, source);
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
        entry = {
          styles: false,
          as: false,
          ref: false,
          className: false,
          style: false,
          elementProps: false,
          spreadProps: false,
        };
        consumerAnalysis!.set(key, entry);
      }
      return entry;
    };

    // Match component definition files to consumer usage files and set flags.
    // Shared logic: for each usage map, iterate definitions, check exports,
    // verify same-file or cross-file import, and set the corresponding flag.
    const matchUsagesToDefinitions = (
      usages: ReadonlyMap<string, ReadonlySet<string>>,
      field: keyof ExternalInterfaceResult,
    ) => {
      if (usages.size === 0) {
        return;
      }
      for (const [defFile, names] of styledDefFiles) {
        const defSrc = cachedRead(defFile);
        for (const name of names) {
          const usageFiles = usages.get(name);
          if (!usageFiles) {
            continue;
          }

          if (!fileExports(defSrc, name)) {
            continue;
          }

          if (usageFiles.has(defFile)) {
            ensure(defFile, name)[field] = true;
            continue;
          }

          for (const usageFile of usageFiles) {
            if (fileImportsFrom(cachedRead(usageFile), usageFile, name, defFile, resolve)) {
              ensure(defFile, name)[field] = true;
              break;
            }
          }
        }
      }
    };

    matchUsagesToDefinitions(asUsages, "as");
    matchUsagesToDefinitions(refUsages, "ref");
    matchUsagesToDefinitions(classNameStyleUsages, "styles");
    matchUsagesToDefinitions(classNameUsages, "className");
    matchUsagesToDefinitions(styleUsages, "style");
    matchUsagesToDefinitions(elementPropUsages, "elementProps");
    matchUsagesToDefinitions(spreadPropUsages, "spreadProps");

    // re-styled: resolve imports to find definition files
    {
      const seen = new Set<string>();
      for (const { file, name } of styledCallUsages) {
        const def = resolveDefinitionFile({
          file,
          localName: name,
          cachedRead,
          resolve,
        });
        if (!def) {
          continue;
        }
        const { defFile, exportedName } = def;

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

        const entry = ensure(defFile, exportedName);
        entry.styles = true;
        // Re-styling: conservative fallback — can't see all consumers of the wrapper
        entry.elementProps = true;
        entry.spreadProps = true;
      }
    }
  }

  // Phase 2b: Cross-reference styled(Component) wrappers for forwardedAs patching.
  // For each wrapper in an unconverted consumer file, check if the wrapped component
  // is imported from a file that IS being transformed → needs as→forwardedAs patching.
  const forwardedAsConsumers = new Map<string, ForwardedAsConsumerEntry[]>();

  if (createExternalInterface && styledWrapperUsages.length > 0) {
    for (const { file, localStyledName, wrappedName } of styledWrapperUsages) {
      // Only patch unconverted consumer files (not being transformed)
      if (transformSet.has(file)) {
        continue;
      }

      const def = resolveDefinitionFile({
        file,
        localName: wrappedName,
        cachedRead,
        resolve,
      });
      if (!def) {
        continue;
      }
      const { defFile } = def;

      // The wrapped component's definition file must be in the transform set
      if (!transformSet.has(defFile)) {
        continue;
      }

      let entries = forwardedAsConsumers.get(file);
      if (!entries) {
        entries = [];
        forwardedAsConsumers.set(file, entries);
      }
      entries.push({ localStyledName, targetPath: defFile });
    }
  }

  const propUsageByFile = buildPropUsageByFile({
    styledDefFiles,
    propUsageCandidates,
    cachedRead,
    resolve,
    toRealPath,
  });

  let globalLeafKeys: Set<string> | undefined;
  if (leavesOnly) {
    const styledDefBases: StyledDefBasesMap = new Map();
    for (const filePath of transformSet) {
      mergeLeafStyledDefBasesForFile(filePath, cachedRead(filePath), parser, styledDefBases);
    }
    globalLeafKeys = computeGlobalLeafKeys({
      transformSet,
      styledDefBases,
      resolve,
      cachedRead,
      toRealPath,
      resolveBaseComponent,
    });
  }

  const crossFileInfo: CrossFileInfo = {
    selectorUsages,
    componentsNeedingMarkerSidecar,
    componentsNeedingGlobalSelectorBridge,
    propUsageByFile,
    styledDefFiles: createExternalInterface ? styledDefFiles : undefined,
    globalLeafKeys,
  };

  // Summary log
  {
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    const reStyled = consumerAnalysis
      ? [...consumerAnalysis.values()].filter((v) => v.styles).length
      : 0;
    const asProp = consumerAnalysis ? [...consumerAnalysis.values()].filter((v) => v.as).length : 0;
    const refProp = consumerAnalysis
      ? [...consumerAnalysis.values()].filter((v) => v.ref).length
      : 0;
    const propUsageCount = [...propUsageByFile.values()].reduce((sum, byComponent) => {
      return sum + byComponent.size;
    }, 0);
    Logger.info(
      `Prepass: scanned ${uniqueAllFiles.length} files in ${elapsed}s` +
        ` — ${styledFileCount} with styled-components` +
        `, ${selectorUsages.size} cross-file selectors` +
        `, ${reStyled} re-styled` +
        `, ${asProp} as-prop` +
        `, ${refProp} ref-prop` +
        `, ${classNameStyleUsages.size} className/style` +
        `, ${propUsageCount} prop-usage` +
        `, ${forwardedAsConsumers.size} forwardedAs\n`,
    );
  }

  if (process.env.DEBUG_CODEMOD) {
    logPrepassDebug(uniqueAllFiles, crossFileInfo, consumerAnalysis);
  }

  return { crossFileInfo, consumerAnalysis, forwardedAsConsumers };
}

/** Regex baseline for styled defs, then AST pass overrides/adds rows when parse succeeds. */
function mergeLeafStyledDefBasesForFile(
  filePath: string,
  source: string,
  parser: ReturnType<typeof createPrepassParser>,
  styledDefBases: StyledDefBasesMap,
): void {
  if (hasLeavesOnlyPrepassBlocker(source)) {
    return;
  }
  extractStyledDefBasesFromSource(filePath, source, styledDefBases);
  try {
    const ast = parser.parse(source) as AstNode;
    const program = ((ast as { program?: AstNode }).program ?? ast) as AstNode;
    const importNodes: AstNode[] = [];
    walkForImportsAndTemplates(program, importNodes, []);
    extractStyledDefBasesFromAstProgram(
      filePath,
      program,
      collectStyledLocalBindingNames(importNodes),
      styledDefBases,
    );
  } catch {
    // Regex rows already populated
  }
}

function hasLeavesOnlyPrepassBlocker(source: string): boolean {
  return source.includes("shouldForwardProp") || hasUniversalSelectorCandidate(source);
}

function hasUniversalSelectorCandidate(source: string): boolean {
  return /(?:^|[{\n;])\s*(?:&\s*)?(?:[>+~]\s*)?\*/.test(source);
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
    re = new RegExp(`(?:^|[^A-Za-z0-9_$])${escapeRegex(identifier)}(?:$|[^A-Za-z0-9_$])`);
    IMPORT_IDENTIFIER_RE_CACHE.set(identifier, re);
  }
  return re.test(importText);
}

/** Quick pre-check: does this source mention className or style in a JSX prop context? */
const CLASSNAME_STYLE_QUICK_RE = /\b(className|style)\s*[={]/;

/** Matches `import { Original as Local, ... }` — captures original and local names. */
const IMPORT_ALIAS_ENTRY_RE = /\b(\w+)\s+as\s+(\w+)/g;

/**
 * Build a mapping from local alias names to original imported names for a source file.
 * Only includes PascalCase names that differ from their original (actual aliases).
 * Scans only import declarations to avoid false positives from TypeScript `as` casts
 * (e.g., `foo as Button` would incorrectly map `Button → foo`).
 */
function buildLocalToImportedMap(source: string): Map<string, string> {
  const importText = collectImportDeclarationText(source);
  const map = new Map<string, string>();
  IMPORT_ALIAS_ENTRY_RE.lastIndex = 0;
  for (const m of importText.matchAll(IMPORT_ALIAS_ENTRY_RE)) {
    const original = m[1]!;
    const local = m[2]!;
    if (original !== local && /^[A-Z]/.test(local)) {
      map.set(local, original);
    }
  }
  return map;
}

/** Props that don't indicate element-specific usage (non-element props). */
const KNOWN_NON_ELEMENT_PROPS = new Set([
  "className",
  "style",
  "as",
  "ref",
  "forwardedAs",
  "key",
  "children",
]);

interface ConsumerPropResult {
  name: string;
  className: boolean;
  style: boolean;
  elementProps: boolean;
  spreadProps: boolean;
}

interface ConsumerStaticPropUsage {
  name: string;
  filePath: string;
  props: Record<string, { kind: "static"; value: StaticPropValue } | { kind: "unknown" }>;
  hasSpread: boolean;
}

/**
 * Scan source for JSX usage of specific components with className, style,
 * element-specific props, or JSX spread.
 * Uses a two-step approach: first quick-checks for className/style keywords,
 * then scans JSX open tags to match component names — avoids building a huge
 * alternation regex when there are hundreds of component names.
 * Handles aliased imports (e.g., `import { Alert as MyAlert }`) by resolving
 * local tag names back to their original exported names.
 */
function scanConsumerProps(
  source: string,
  componentNames: ReadonlySet<string>,
): ConsumerPropResult[] {
  if (!CLASSNAME_STYLE_QUICK_RE.test(source)) {
    return [];
  }

  // Build alias map lazily — only if needed
  let aliasMap: Map<string, string> | undefined;

  // Accumulate per-component results (merge across multiple JSX tags)
  const resultMap = new Map<string, ConsumerPropResult>();

  // Match JSX open tags: `<ComponentName ...>` or `<ComponentName ... />`
  const tagRe = /<([A-Z][A-Za-z0-9]*)\b([^<>]*?)(?:\/>|>)/gs;
  for (const m of source.matchAll(tagRe)) {
    const tagName = m[1];
    const attrText = m[2] ?? "";
    if (!tagName) {
      continue;
    }

    // Resolve to original component name
    let resolvedName: string | undefined;
    if (componentNames.has(tagName)) {
      resolvedName = tagName;
    } else {
      aliasMap ??= buildLocalToImportedMap(source);
      const originalName = aliasMap.get(tagName);
      if (originalName && componentNames.has(originalName)) {
        resolvedName = originalName;
      }
    }
    if (!resolvedName) {
      continue;
    }

    // Skip tags that don't mention className or style at all
    if (!/\b(?:className|style)\s*[={]/.test(attrText) && !/\{\.\.\./.test(attrText)) {
      continue;
    }

    let entry = resultMap.get(resolvedName);
    if (!entry) {
      entry = {
        name: resolvedName,
        className: false,
        style: false,
        elementProps: false,
        spreadProps: false,
      };
      resultMap.set(resolvedName, entry);
    }

    if (/\bclassName\s*[={]/.test(attrText)) {
      entry.className = true;
    }
    if (/\bstyle\s*[={]/.test(attrText)) {
      entry.style = true;
    }
    if (/\{\.\.\./.test(attrText)) {
      entry.spreadProps = true;
    }

    // Check for element-specific props (lowercase props not in known set)
    // Matches:
    // 1. prop= or prop{ - value prop
    // 2. prop followed by whitespace and another prop - boolean shorthand
    // 3. prop at end of attributes - boolean shorthand
    const propRe = /\b([a-z][a-zA-Z-]*)(?=\s*[={]|\s+[a-z]|\s*$)/gi;
    for (const pm of attrText.matchAll(propRe)) {
      const propName = pm[1]!;
      if (!KNOWN_NON_ELEMENT_PROPS.has(propName) && !propName.startsWith("$")) {
        entry.elementProps = true;
        break;
      }
    }
  }
  return [...resultMap.values()];
}

function scanConsumerStaticPropUsages(
  filePath: string,
  source: string,
  componentNames: ReadonlySet<string>,
  parser: ReturnType<typeof createPrepassParser>,
): ConsumerStaticPropUsage[] {
  if (!/<[A-Z]/.test(source)) {
    return [];
  }

  let ast: AstNode;
  try {
    ast = parser.parse(source) as AstNode;
  } catch {
    return [];
  }

  const importNodes: AstNode[] = [];
  const jsxOpenings: AstNode[] = [];
  walkForImportsAndJsxOpenings((ast.program ?? ast) as AstNode, importNodes, jsxOpenings);
  const importMap = buildImportMapFromNodes(importNodes);
  const usages: ConsumerStaticPropUsage[] = [];

  for (const opening of jsxOpenings) {
    const tagName = getJsxOpeningIdentifierName(opening.name as AstNode | undefined);
    if (!tagName) {
      continue;
    }
    const importEntry = importMap.get(tagName);
    const resolvedName = componentNames.has(tagName)
      ? tagName
      : importEntry && componentNames.has(importEntry.importedName)
        ? importEntry.importedName
        : undefined;
    if (!resolvedName) {
      continue;
    }

    const props: ConsumerStaticPropUsage["props"] = {};
    let hasSpread = false;
    for (const attr of (opening.attributes as AstNode[] | undefined) ?? []) {
      if (!attr) {
        continue;
      }
      if (attr.type === "JSXSpreadAttribute") {
        hasSpread = true;
        continue;
      }
      if (attr.type !== "JSXAttribute") {
        continue;
      }
      const propName = getJsxAttributeName(attr.name as AstNode | undefined);
      if (!propName || KNOWN_NON_ELEMENT_PROPS.has(propName)) {
        continue;
      }
      const value = readStaticJsxAttributeValue(attr);
      props[propName] = value === undefined ? { kind: "unknown" } : { kind: "static", value };
    }

    usages.push({ name: resolvedName, filePath, props, hasSpread });
  }

  return usages;
}

function buildPropUsageByFile(args: {
  styledDefFiles: ReadonlyMap<string, ReadonlySet<string>>;
  propUsageCandidates: ReadonlyMap<string, readonly ConsumerStaticPropUsage[]>;
  cachedRead: (filePath: string) => string;
  resolve: Resolve;
  toRealPath: (path: string) => string;
}): Map<string, Map<string, ComponentPropUsageInfo>> {
  const { styledDefFiles, propUsageCandidates, cachedRead, resolve, toRealPath } = args;
  const propUsageByFile = new Map<string, Map<string, ComponentPropUsageInfo>>();

  for (const [defFile, names] of styledDefFiles) {
    const defSrc = cachedRead(defFile);
    for (const name of names) {
      const candidates = propUsageCandidates.get(name);
      if (!candidates || !fileExports(defSrc, name)) {
        continue;
      }
      for (const candidate of candidates) {
        const usageFile = candidate.filePath;
        if (
          usageFile !== defFile &&
          !fileImportsFrom(cachedRead(usageFile), usageFile, name, defFile, resolve)
        ) {
          continue;
        }
        const byComponent = getOrCreatePropUsageFileMap(propUsageByFile, toRealPath(defFile));
        const info = getOrCreateComponentPropUsage(byComponent, name);
        mergeComponentPropUsage(info, candidate);
      }
    }
  }

  return propUsageByFile;
}

function getOrCreatePropUsageFileMap(
  propUsageByFile: Map<string, Map<string, ComponentPropUsageInfo>>,
  filePath: string,
): Map<string, ComponentPropUsageInfo> {
  let byComponent = propUsageByFile.get(filePath);
  if (!byComponent) {
    byComponent = new Map();
    propUsageByFile.set(filePath, byComponent);
  }
  return byComponent;
}

function getOrCreateComponentPropUsage(
  byComponent: Map<string, ComponentPropUsageInfo>,
  name: string,
): ComponentPropUsageInfo {
  let info = byComponent.get(name);
  if (!info) {
    info = {
      componentName: name,
      usageCount: 0,
      hasUnknownUsage: false,
      props: {},
    };
    byComponent.set(name, info);
  }
  return info;
}

function mergeComponentPropUsage(
  info: ComponentPropUsageInfo,
  usage: ConsumerStaticPropUsage,
): void {
  info.usageCount += 1;
  if (usage.hasSpread) {
    info.hasUnknownUsage = true;
  }

  const presentProps = new Set(Object.keys(usage.props));
  for (const [propName, propInfo] of Object.entries(info.props)) {
    if (!presentProps.has(propName)) {
      propInfo.omittedCount += 1;
    }
  }

  for (const [propName, value] of Object.entries(usage.props)) {
    const propInfo =
      info.props[propName] ??
      (info.props[propName] = {
        values: [],
        hasUnknown: false,
        usageCount: 0,
        omittedCount: info.usageCount - 1,
      });
    propInfo.usageCount += 1;
    if (value.kind === "unknown") {
      propInfo.hasUnknown = true;
      continue;
    }
    if (!propInfo.values.some((existing) => existing === value.value)) {
      propInfo.values.push(value.value);
    }
  }
}

function walkForImportsAndJsxOpenings(
  node: unknown,
  imports: AstNode[],
  jsxOpenings: AstNode[],
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as AstNode;
  if (n.type === "ImportDeclaration") {
    imports.push(n);
    return;
  }
  if (n.type === "JSXOpeningElement") {
    jsxOpenings.push(n);
    return;
  }
  for (const key of Object.keys(n)) {
    if (
      key === "type" ||
      key === "start" ||
      key === "end" ||
      key === "loc" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    const val = n[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        walkForImportsAndJsxOpenings(child, imports, jsxOpenings);
      }
    } else if (val && typeof val === "object" && (val as AstNode).type) {
      walkForImportsAndJsxOpenings(val, imports, jsxOpenings);
    }
  }
}

function getJsxOpeningIdentifierName(name: AstNode | undefined): string | null {
  if (!name) {
    return null;
  }
  if (name.type === "JSXIdentifier" && typeof name.name === "string") {
    return name.name;
  }
  return null;
}

function getJsxAttributeName(name: AstNode | undefined): string | null {
  if (!name) {
    return null;
  }
  if (name.type === "JSXIdentifier" && typeof name.name === "string") {
    return name.name;
  }
  return null;
}

function readStaticJsxAttributeValue(attr: AstNode): StaticPropValue | undefined {
  if (!("value" in attr) || attr.value == null) {
    return true;
  }
  const direct = readStaticLiteralNode(attr.value);
  if (direct !== undefined) {
    return direct;
  }
  const value = attr.value as AstNode;
  if (value.type !== "JSXExpressionContainer") {
    return undefined;
  }
  return readStaticLiteralNode(value.expression);
}

function readStaticLiteralNode(node: unknown): StaticPropValue | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const n = node as AstNode;
  if (
    n.type === "StringLiteral" ||
    n.type === "NumericLiteral" ||
    n.type === "BooleanLiteral" ||
    n.type === "Literal"
  ) {
    const value = n.value;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? value
      : undefined;
  }
  if (n.type === "UnaryExpression" && n.operator === "-") {
    const arg = n.argument as AstNode | undefined;
    const value = readStaticLiteralNode(arg);
    return typeof value === "number" ? -value : undefined;
  }
  return undefined;
}

/**
 * Use ripgrep to find files containing `className` or `style` props.
 * Searches for the prop keywords (not component names) to keep the pattern
 * small and fast — the full component-name regex narrows results down.
 */
function rgClassNameStyleFilter(files: readonly string[]): Set<string> | undefined {
  const dirs = deduplicateParentDirs(files);
  if (dirs.length === 0) {
    return undefined;
  }

  try {
    const globArgs = ["*.tsx", "*.ts", "*.jsx", "*.js", "*.mts", "*.cts", "*.mjs", "*.cjs"]
      .map((glob) => `--glob ${shellQuote(glob)}`)
      .join(" ");
    const cmd = `rg -l ${shellQuote(String.raw`\b(className|style)\s*[={]`)} ${globArgs} ${dirs.map(shellQuote).join(" ")}`;
    const output = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return new Set(
      output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => pathResolve(f)),
    );
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 1) {
      return new Set();
    }
    return undefined;
  }
}

/** Use ripgrep to find files with PascalCase JSX tags. */
function rgJsxComponentFilter(files: readonly string[]): Set<string> | undefined {
  const dirs = deduplicateParentDirs(files);
  if (dirs.length === 0) {
    return undefined;
  }

  try {
    const globArgs = ["*.tsx", "*.jsx", "*.ts", "*.js", "*.mts", "*.cts", "*.mjs", "*.cjs"]
      .map((glob) => `--glob ${shellQuote(glob)}`)
      .join(" ");
    const cmd = `rg -l ${shellQuote(String.raw`<[A-Z][A-Za-z0-9]*\b`)} ${globArgs} ${dirs.map(shellQuote).join(" ")}`;
    const output = execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
    return new Set(
      output
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => pathResolve(f)),
    );
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 1) {
      return new Set();
    }
    return undefined;
  }
}

/** Scan a single file for cross-file selector usages using AST parsing. */
function scanFileForSelectorsAst(
  filePath: string,
  source: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  parser: ReturnType<typeof createPrepassParser>,
  toRealPath: (p: string) => string,
  readFile: (path: string) => string,
  cache?: Map<string, AstCacheEntry>,
  failOnParseError?: boolean,
): CrossFileSelectorUsage[] {
  // Check cache by content hash (same content at different paths → one parse)
  const hash = cache ? createHash("md5").update(source).digest("hex") : undefined;
  const cached = cache && hash ? cache.get(hash) : undefined;

  let importMap: Map<string, ImportEntry>;
  let styledImportName: string | undefined;
  let cssImportNames: Set<string>;
  let selectorLocals: Set<string>;

  if (cached) {
    importMap = cached.importMap;
    styledImportName = cached.styledImportName;
    cssImportNames = cached.cssImportNames;
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
    cssImportNames = findCssImportNamesFromNodes(importNodes);
    selectorLocals =
      styledImportName || cssImportNames.size > 0
        ? findComponentSelectorLocalsFromNodes(
            taggedTemplateNodes,
            styledImportName ?? "",
            cssImportNames,
          )
        : new Set();

    if (cache && hash) {
      cache.set(hash, { importMap, styledImportName, cssImportNames, selectorLocals });
    }
  }

  if (
    importMap.size === 0 ||
    (!styledImportName && cssImportNames.size === 0) ||
    selectorLocals.size === 0
  ) {
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
    const initialResolved = toRealPath(resolvedPath);
    const realResolved = toRealPath(
      resolveBarrelReExport(
        initialResolved,
        imp.importedName,
        (specifier, fromFile) => resolver.resolve(fromFile, specifier) ?? null,
        readFile,
      ) ?? initialResolved,
    );
    if (realResolved === filePath) {
      continue;
    }

    const usage: CrossFileSelectorUsage = {
      localName,
      importSource: imp.source,
      importedName: imp.importedName,
      resolvedPath: realResolved,
      consumerPath: filePath,
      consumerIsTransformed,
    };

    // Check if this is a bridge GlobalSelector from an already-converted StyleX file
    applyBridgeFields(usage, imp.importedName, localName, realResolved, importMap, readFile);

    usages.push(usage);
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
    const pattern = String.raw`(styled-components|\bas[={]|\bref[={])`;
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

/**
 * Resolve a local identifier in `file` to the absolute path of the module that
 * defines it, following barrel re-exports. Returns `null` when the import
 * cannot be located on disk.
 */
function resolveDefinitionFile(args: {
  file: string;
  localName: string;
  cachedRead: (path: string) => string;
  resolve: (specifier: string, from: string) => string | null;
}): { defFile: string; exportedName: string } | null {
  const { file, localName, cachedRead, resolve } = args;
  const importInfo = findImportSource(cachedRead(file), localName);
  if (!importInfo) {
    return null;
  }
  const { source: importSource, exportedName } = importInfo;
  const initialDefFile = resolve(importSource, file);
  if (!initialDefFile) {
    return null;
  }
  const defFile =
    resolveBarrelReExport(initialDefFile, exportedName, resolve, cachedRead) ?? initialDefFile;
  return { defFile, exportedName };
}
