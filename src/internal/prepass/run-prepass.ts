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
import { resolve as pathResolve } from "node:path";
import type { ExternalInterfaceResult } from "../../adapter.js";
import type { ComponentPropUsageInfo, StaticPropValue } from "../transform-types.js";
import { Logger } from "../logger.js";
import { walkAst } from "../utilities/ast-walk.js";
import { addToSetMap } from "../utilities/collection-utils.js";
import { readStaticJsxLiteral } from "../utilities/jsx-static-literal.js";
import {
  createComponentPropUsageInfo,
  KNOWN_NON_ELEMENT_PROPS,
  mergeComponentPropUsage,
  type ComponentPropUsageCandidate,
} from "../utilities/prop-usage.js";
import { escapeRegex } from "../utilities/string-utils.js";
import {
  fileExports,
  fileImportsFrom,
  findImportSource,
  resolveBarrelReExportBinding,
  resolveBarrelReExport,
  type Resolve,
} from "./extract-external-interface.js";
import { collectStylexExportNames } from "./stylex-component-exports.js";
import { createPrepassParser, type AstNode, type PrepassParserName } from "./prepass-parser.js";
import type { ModuleResolver } from "./resolve-imports.js";
import {
  applyBridgeFields,
  BARE_TEMPLATE_IDENTIFIER_RE,
  buildImportMapFromNodes,
  categorizeSelectorUsages,
  deduplicateAndResolve,
  buildCrossFileDebugLines,
  findComponentSelectorLocalsFromNodes,
  findCssImportNamesFromNodes,
  findStyledImportNameFromNodes,
  walkForImportsAndTemplates,
  type CrossFileInfo,
  type CrossFileSelectorUsage,
  type ImportEntry,
} from "./scan-cross-file-selectors.js";
import { isSelectorContext } from "../utilities/selector-context-heuristic.js";
import type { TypeScriptPrepassMetadata } from "./typescript-analysis.js";

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
  /** Serializable TypeScript compiler metadata for later transform steps when parser is ts/tsx. */
  typeScriptMetadata?: TypeScriptPrepassMetadata;
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
  const enableTypeScriptAnalysis = isTypeScriptParser(parserName);

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
  const stylexComponentFiles = new Map<string, Set<string>>();
  const classNameStyleUsages = new Map<string, ConsumerUsageRef[]>();
  const classNameUsages = new Map<string, ConsumerUsageRef[]>();
  const styleUsages = new Map<string, ConsumerUsageRef[]>();
  const elementPropUsages = new Map<string, ConsumerUsageRef[]>();
  const spreadPropUsages = new Map<string, ConsumerUsageRef[]>();
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

    const hasStylex = source.includes("@stylexjs/stylex") || /\.stylex["']/.test(source);

    if (!hasStyled && !hasAsProp && !hasRefProp && !hasStylex) {
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

    if (hasStyled) {
      // Detect styled component definitions for both external-interface and prop-usage matching.
      STYLED_DEF_RE.lastIndex = 0;
      for (const m of source.matchAll(STYLED_DEF_RE)) {
        if (m[1]) {
          addToSetMap(styledDefFiles, filePath, m[1]);
        }
      }
    }

    if (hasStylex) {
      const stylexExportNames = collectStylexExportNames(source);
      if (stylexExportNames.size > 0) {
        stylexComponentFiles.set(filePath, stylexExportNames);
      }
    }

    if ((createExternalInterface || enableTypeScriptAnalysis) && hasStyled) {
      // Detect styled(Component) calls
      STYLED_CALL_RE.lastIndex = 0;
      for (const m of source.matchAll(STYLED_CALL_RE)) {
        if (m[1]) {
          styledCallUsages.push({ file: filePath, name: m[1] });
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
      // Use targeted rg to find files containing className/style props (fast, small pattern).
      // The JSX filter covers spread-only and element-prop-only consumers.
      const rgHits = createExternalInterface ? rgClassNameStyleFilter(uniqueAllFiles) : undefined;
      const jsxHits = rgJsxComponentFilter(uniqueAllFiles);

      const scanAndRecord = (filePath: string, source: string) => {
        const jsxScan = scanConsumerJsxUsages(filePath, source, allStyledNames, parser);
        if (createExternalInterface) {
          for (const result of jsxScan.propResults) {
            const usage = { filePath, importSource: result.importSource };
            if (result.className || result.style || result.spreadProps) {
              addConsumerUsage(classNameStyleUsages, result.name, usage);
            }
            if (result.className) {
              addConsumerUsage(classNameUsages, result.name, usage);
            }
            if (result.style) {
              addConsumerUsage(styleUsages, result.name, usage);
            }
            if (result.elementProps) {
              addConsumerUsage(elementPropUsages, result.name, usage);
            }
            if (result.spreadProps) {
              addConsumerUsage(spreadPropUsages, result.name, usage);
            }
          }
        }
        for (const usage of jsxScan.staticPropUsages) {
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
        const hasAnyFilter =
          (createExternalInterface && rgHits !== undefined) || jsxHits !== undefined;
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
    const matchUsageFilesToDefinitions = (
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
            if (
              fileImportsFrom(cachedRead(usageFile), usageFile, name, defFile, resolve, cachedRead)
            ) {
              ensure(defFile, name)[field] = true;
              break;
            }
          }
        }
      }
    };

    const matchConsumerUsagesToDefinitions = (
      usages: ReadonlyMap<string, readonly ConsumerUsageRef[]>,
      field: keyof ExternalInterfaceResult,
    ) => {
      if (usages.size === 0) {
        return;
      }
      for (const [defFile, names] of styledDefFiles) {
        const defSrc = cachedRead(defFile);
        for (const name of names) {
          const usageRefs = usages.get(name);
          if (!usageRefs) {
            continue;
          }

          if (!fileExports(defSrc, name)) {
            continue;
          }

          if (
            usageRefs.some((usageRef) =>
              consumerUsageReferencesDefinition(usageRef, name, defFile, cachedRead, resolve),
            )
          ) {
            ensure(defFile, name)[field] = true;
          }
        }
      }
    };

    matchUsageFilesToDefinitions(asUsages, "as");
    matchUsageFilesToDefinitions(refUsages, "ref");
    matchConsumerUsagesToDefinitions(classNameStyleUsages, "styles");
    matchConsumerUsagesToDefinitions(classNameUsages, "className");
    matchConsumerUsagesToDefinitions(styleUsages, "style");
    matchConsumerUsagesToDefinitions(elementPropUsages, "elementProps");
    matchConsumerUsagesToDefinitions(spreadPropUsages, "spreadProps");

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
        entry.className = true;
        entry.style = true;
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

  const typeScriptMetadata = enableTypeScriptAnalysis
    ? (await loadTypeScriptAnalysis()).analyzeTypeScriptProgram({
        files: collectTypeScriptAnalysisFiles({
          transformSet,
          styledCallUsages,
          styledWrapperUsages,
          cachedRead,
          resolve,
        }),
      })
    : undefined;

  const propUsageByFile = buildPropUsageByFile({
    styledDefFiles,
    propUsageCandidates,
    cachedRead,
    resolve,
    toRealPath,
  });

  const crossFileInfo: CrossFileInfo = {
    selectorUsages,
    componentsNeedingMarkerSidecar,
    componentsNeedingGlobalSelectorBridge,
    propUsageByFile,
    styledDefFiles: createExternalInterface ? styledDefFiles : undefined,
    stylexComponentFiles,
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

  return { crossFileInfo, consumerAnalysis, forwardedAsConsumers, typeScriptMetadata };
}

function isTypeScriptParser(parserName: PrepassParserName | undefined): boolean {
  return parserName === undefined || parserName === "ts" || parserName === "tsx";
}

async function loadTypeScriptAnalysis(): Promise<typeof import("./typescript-analysis.js")> {
  try {
    return await import("./typescript-analysis.js");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missingTypeScript =
      message.includes("typescript") &&
      (message.includes("Cannot find") || message.includes("ERR_MODULE_NOT_FOUND"));
    if (missingTypeScript) {
      throw new Error(
        [
          "TypeScript parser runs require the optional `typescript` package for compiler metadata.",
          "Install TypeScript in the project (supported range: >=5.0.0 <6), or use a non-TypeScript parser.",
        ].join("\n"),
      );
    }
    throw err;
  }
}

function collectTypeScriptAnalysisFiles(args: {
  transformSet: ReadonlySet<string>;
  styledCallUsages: readonly { file: string; name: string }[];
  styledWrapperUsages: readonly { file: string; wrappedName: string }[];
  cachedRead: (path: string) => string;
  resolve: Resolve;
}): string[] {
  const { transformSet, styledCallUsages, styledWrapperUsages, cachedRead, resolve } = args;
  const files = new Set(transformSet);
  for (const { file, name } of styledCallUsages) {
    const definition = resolveDefinitionFile({ file, localName: name, cachedRead, resolve });
    if (definition) {
      files.add(definition.defFile);
    }
  }
  for (const { file, wrappedName } of styledWrapperUsages) {
    const definition = resolveDefinitionFile({ file, localName: wrappedName, cachedRead, resolve });
    if (definition) {
      files.add(definition.defFile);
    }
  }
  return [...files].sort();
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

function addConsumerUsage(
  map: Map<string, ConsumerUsageRef[]>,
  name: string,
  usage: ConsumerUsageRef,
): void {
  const entries = map.get(name) ?? [];
  if (
    !entries.some(
      (entry) => entry.filePath === usage.filePath && entry.importSource === usage.importSource,
    )
  ) {
    entries.push(usage);
    map.set(name, entries);
  }
}

function consumerUsageReferencesDefinition(
  usage: ConsumerUsageRef,
  name: string,
  defFile: string,
  cachedRead: (path: string) => string,
  resolve: Resolve,
): boolean {
  if (usage.importSource) {
    return importSourceReferencesDefinition(
      usage.importSource,
      usage.filePath,
      name,
      defFile,
      resolve,
      cachedRead,
    );
  }

  if (usage.filePath === defFile) {
    return true;
  }

  return fileImportsFrom(
    cachedRead(usage.filePath),
    usage.filePath,
    name,
    defFile,
    resolve,
    cachedRead,
  );
}

function importSourceReferencesDefinition(
  importSource: string,
  usageFile: string,
  name: string,
  defFile: string,
  resolve: Resolve,
  cachedRead: (path: string) => string,
): boolean {
  const resolved = resolve(importSource, usageFile);
  if (!resolved) {
    return false;
  }
  if (pathResolve(resolved) === pathResolve(defFile)) {
    return true;
  }
  const binding = resolveBarrelReExportBinding(resolved, name, resolve, cachedRead);
  return binding !== null && pathResolve(binding.filePath) === pathResolve(defFile);
}

/** Quick pre-check: does this source mention JSX that might use external consumer props? */
const CONSUMER_PROPS_QUICK_RE =
  /<(?:[A-Z]|[A-Za-z_$][A-Za-z0-9_$]*\.)|\b(className|style)\s*[={]|\{\.\.\./;

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

interface ConsumerPropResult {
  name: string;
  importSource?: string;
  className: boolean;
  style: boolean;
  elementProps: boolean;
  spreadProps: boolean;
}

interface ConsumerStaticPropUsage {
  name: string;
  filePath: string;
  importSource?: string;
  usage: ComponentPropUsageCandidate;
}

interface ConsumerUsageRef {
  filePath: string;
  importSource?: string;
}

interface ResolvedConsumerComponent {
  name: string;
  importSource?: string;
}

interface ConsumerJsxScanResult {
  propResults: ConsumerPropResult[];
  staticPropUsages: ConsumerStaticPropUsage[];
}

interface ConsumerOpeningUsage {
  externalProps: Omit<ConsumerPropResult, "name">;
  staticUsage: ComponentPropUsageCandidate;
}

/**
 * Scan source for JSX usage of specific components with className, style,
 * element-specific props, or JSX spread.
 * Uses the prepass parser so comments and string literals cannot be mistaken
 * for real JSX consumers.
 */
function scanConsumerJsxUsages(
  filePath: string,
  source: string,
  componentNames: ReadonlySet<string>,
  parser: ReturnType<typeof createPrepassParser>,
): ConsumerJsxScanResult {
  if (!CONSUMER_PROPS_QUICK_RE.test(source)) {
    return { propResults: [], staticPropUsages: [] };
  }

  let ast: AstNode;
  try {
    ast = parser.parse(source) as AstNode;
  } catch {
    return {
      propResults: scanConsumerPropsRegexFallback(source, componentNames),
      staticPropUsages: [],
    };
  }

  const importNodes: AstNode[] = [];
  const jsxOpenings: AstNode[] = [];
  const program = (ast.program ?? ast) as AstNode;
  walkForImportsAndJsxOpenings(program, importNodes, jsxOpenings);
  const importMap = buildImportMapFromNodes(importNodes);
  const staticIdentifierValues = collectStaticIdentifierValues(program);

  const resultMap = new Map<string, ConsumerPropResult>();
  const staticPropUsages: ConsumerStaticPropUsage[] = [];

  for (const opening of jsxOpenings) {
    const resolvedComponent = resolveJsxOpeningComponent(
      opening.name as AstNode | undefined,
      importMap,
      componentNames,
    );
    if (!resolvedComponent) {
      continue;
    }

    const openingUsage = readConsumerOpeningUsage(opening, staticIdentifierValues);
    const { externalProps } = openingUsage;
    if (
      externalProps.className ||
      externalProps.style ||
      externalProps.spreadProps ||
      externalProps.elementProps
    ) {
      const key = `${resolvedComponent.name}\0${resolvedComponent.importSource ?? ""}`;
      let entry = resultMap.get(key);
      if (!entry) {
        entry = {
          name: resolvedComponent.name,
          importSource: resolvedComponent.importSource,
          className: false,
          style: false,
          elementProps: false,
          spreadProps: false,
        };
        resultMap.set(key, entry);
      }

      entry.className ||= externalProps.className;
      entry.style ||= externalProps.style;
      entry.spreadProps ||= externalProps.spreadProps;
      entry.elementProps ||= externalProps.elementProps;
    }

    staticPropUsages.push({
      name: resolvedComponent.name,
      filePath,
      importSource: resolvedComponent.importSource,
      usage: openingUsage.staticUsage,
    });
  }

  return { propResults: [...resultMap.values()], staticPropUsages };
}

function resolveJsxOpeningComponent(
  name: AstNode | undefined,
  importMap: ReadonlyMap<string, ImportEntry>,
  componentNames: ReadonlySet<string>,
): ResolvedConsumerComponent | undefined {
  const localName = getJsxOpeningIdentifierName(name);
  if (localName) {
    if (componentNames.has(localName)) {
      return { name: localName };
    }

    const importEntry = importMap.get(localName);
    return importEntry && componentNames.has(importEntry.importedName)
      ? { name: importEntry.importedName, importSource: importEntry.source }
      : undefined;
  }

  const member = getJsxMemberNameParts(name);
  if (!member || !componentNames.has(member.propertyName)) {
    return undefined;
  }
  const importEntry = importMap.get(member.objectName);
  return importEntry?.importedName === "*"
    ? { name: member.propertyName, importSource: importEntry.source }
    : undefined;
}

function readConsumerOpeningUsage(
  opening: AstNode,
  staticIdentifierValues: ReadonlyMap<string, StaticPropValue>,
): ConsumerOpeningUsage {
  const externalProps = {
    className: false,
    style: false,
    elementProps: false,
    spreadProps: false,
  };
  const props: ComponentPropUsageCandidate["props"] = {};
  let hasSpread = false;

  for (const attr of (opening.attributes as AstNode[] | undefined) ?? []) {
    if (!attr) {
      continue;
    }
    if (attr.type === "JSXSpreadAttribute") {
      externalProps.spreadProps = true;
      hasSpread = true;
      continue;
    }
    if (attr.type !== "JSXAttribute") {
      continue;
    }
    const propName = getJsxAttributeName(attr.name as AstNode | undefined);
    if (!propName) {
      continue;
    }

    if (propName === "className") {
      externalProps.className = true;
    } else if (propName === "style") {
      externalProps.style = true;
    } else if (isElementConsumerProp(propName)) {
      externalProps.elementProps = true;
    }

    if (!KNOWN_NON_ELEMENT_PROPS.has(propName)) {
      const value =
        readStaticJsxLiteral(attr) ?? readStaticIdentifierJsxValue(attr, staticIdentifierValues);
      props[propName] = value === undefined ? { kind: "unknown" } : { kind: "static", value };
    }
  }

  return { externalProps, staticUsage: { props, hasSpread } };
}

// Resolves only *unshadowed module-level* `const` literals. Resolving by identifier name alone is
// unsafe when the same name is also bound in another scope: a JSX value like `<Spacer height={height}>`
// inside `({ height }) => ...` refers to the parameter, not the module constant. Treating it as the
// constant would wrongly mark the prop as statically observed and let observed-variant bucketing drop
// the dynamic value. So we keep a candidate only when its name is bound exactly once in the module.
function collectStaticIdentifierValues(program: AstNode): Map<string, StaticPropValue> {
  const values = new Map<string, StaticPropValue>();
  for (const declaration of moduleLevelVariableDeclarations(program)) {
    if (declaration.kind !== "const") {
      continue;
    }
    const declarators = (declaration.declarations ?? []) as Array<{ id?: AstNode; init?: AstNode }>;
    for (const decl of declarators) {
      const name = decl.id?.type === "Identifier" ? (decl.id as { name?: string }).name : null;
      const value = staticValueFromNode(decl.init);
      if (name && value !== undefined) {
        values.set(name, value);
      }
    }
  }
  if (values.size === 0) {
    return values;
  }
  const bindingCounts = countBoundNames(program);
  const shadowedNames: string[] = [];
  for (const [name] of values) {
    if ((bindingCounts.get(name) ?? 0) > 1) {
      shadowedNames.push(name);
    }
  }
  for (const name of shadowedNames) {
    values.delete(name);
  }
  return values;
}

/** Top-level `const`/`let`/`var` declarations, unwrapping `export` declarations. */
function moduleLevelVariableDeclarations(
  program: AstNode,
): Array<AstNode & { kind?: string; declarations?: unknown }> {
  const body = (program.body ?? []) as AstNode[];
  const declarations: Array<AstNode & { kind?: string; declarations?: unknown }> = [];
  for (const node of body) {
    if (node.type === "VariableDeclaration") {
      declarations.push(node);
    } else if (node.type === "ExportNamedDeclaration") {
      const inner = (node as { declaration?: AstNode }).declaration;
      if (inner?.type === "VariableDeclaration") {
        declarations.push(inner);
      }
    }
  }
  return declarations;
}

/** Counts how many times each name is introduced as a binding anywhere in the module. */
function countBoundNames(program: AstNode): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (name: string): void => {
    if (name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  };
  const bumpId = (node: AstNode | undefined): void => {
    if (node?.type === "Identifier") {
      bump((node as { name?: string }).name ?? "");
    }
  };
  walkAst(program, (node) => {
    switch (node.type) {
      case "VariableDeclarator":
        collectPatternNames(node.id as AstNode | undefined, bump);
        break;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        bumpId((node as { id?: AstNode }).id);
        for (const param of (node.params as AstNode[] | undefined) ?? []) {
          collectPatternNames(param, bump);
        }
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        bumpId((node as { id?: AstNode }).id);
        break;
      case "CatchClause":
        collectPatternNames((node as { param?: AstNode }).param, bump);
        break;
      case "ImportSpecifier":
      case "ImportDefaultSpecifier":
      case "ImportNamespaceSpecifier":
        bumpId((node as { local?: AstNode }).local);
        break;
    }
  });
  return counts;
}

/** Collects every identifier name bound by a (possibly destructured) binding pattern. */
function collectPatternNames(node: AstNode | undefined, add: (name: string) => void): void {
  if (!node) {
    return;
  }
  switch (node.type) {
    case "Identifier":
      add((node as { name?: string }).name ?? "");
      break;
    case "ObjectPattern":
      for (const property of (node.properties as AstNode[] | undefined) ?? []) {
        if (property.type === "RestElement") {
          collectPatternNames((property as { argument?: AstNode }).argument, add);
        } else {
          collectPatternNames((property as { value?: AstNode }).value, add);
        }
      }
      break;
    case "ArrayPattern":
      for (const element of (node.elements as Array<AstNode | null> | undefined) ?? []) {
        collectPatternNames(element ?? undefined, add);
      }
      break;
    case "AssignmentPattern":
      collectPatternNames((node as { left?: AstNode }).left, add);
      break;
    case "RestElement":
      collectPatternNames((node as { argument?: AstNode }).argument, add);
      break;
    case "TSParameterProperty":
      collectPatternNames((node as { parameter?: AstNode }).parameter, add);
      break;
  }
}

function readStaticIdentifierJsxValue(
  attr: AstNode,
  staticIdentifierValues: ReadonlyMap<string, StaticPropValue>,
): StaticPropValue | undefined {
  const value = attr.value as AstNode | undefined;
  const expr =
    value?.type === "JSXExpressionContainer"
      ? (value as { expression?: AstNode }).expression
      : null;
  const name = expr?.type === "Identifier" ? (expr as { name?: string }).name : null;
  return name ? staticIdentifierValues.get(name) : undefined;
}

const STATIC_LITERAL_NODE_TYPES = new Set([
  "Literal",
  "StringLiteral",
  "NumericLiteral",
  "BooleanLiteral",
]);

function staticValueFromNode(node: AstNode | undefined): StaticPropValue | undefined {
  if (!node || !STATIC_LITERAL_NODE_TYPES.has(node.type as string)) {
    return undefined;
  }
  const value = (node as { value?: unknown }).value;
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : undefined;
}

function isElementConsumerProp(propName: string): boolean {
  return !KNOWN_NON_ELEMENT_PROPS.has(propName) && !propName.startsWith("$");
}

function scanConsumerPropsRegexFallback(
  source: string,
  componentNames: ReadonlySet<string>,
): ConsumerPropResult[] {
  const resultMap = new Map<string, ConsumerPropResult>();
  let aliasMap: Map<string, string> | undefined;

  const tagRe = /<([A-Z][A-Za-z0-9]*)\b([^<>]*?)(?:\/>|>)/gs;
  for (const match of source.matchAll(tagRe)) {
    const tagName = match[1];
    const attrText = match[2] ?? "";
    if (!tagName) {
      continue;
    }

    const resolvedName = componentNames.has(tagName)
      ? tagName
      : (() => {
          aliasMap ??= buildLocalToImportedMap(source);
          const originalName = aliasMap.get(tagName);
          return originalName && componentNames.has(originalName) ? originalName : undefined;
        })();
    if (!resolvedName) {
      continue;
    }

    const className = /\bclassName\s*[={]/.test(attrText);
    const style = /\bstyle\s*[={]/.test(attrText);
    const spreadProps = /\{\.\.\./.test(attrText);
    let elementProps = false;

    const propRe = /\b([a-z][a-zA-Z-]*)(?=\s*[={]|\s+[a-z]|\s*$)/gi;
    for (const propMatch of attrText.matchAll(propRe)) {
      const propName = propMatch[1]!;
      if (isElementConsumerProp(propName)) {
        elementProps = true;
        break;
      }
    }

    if (!className && !style && !spreadProps && !elementProps) {
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

    entry.className ||= className;
    entry.style ||= style;
    entry.spreadProps ||= spreadProps;
    entry.elementProps ||= elementProps;
  }

  return [...resultMap.values()];
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
        if (!consumerUsageReferencesDefinition(candidate, name, defFile, cachedRead, resolve)) {
          continue;
        }
        const byComponent = getOrCreatePropUsageFileMap(propUsageByFile, toRealPath(defFile));
        const info = getOrCreateComponentPropUsage(byComponent, name);
        mergeComponentPropUsage(info, candidate.usage);
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
    info = createComponentPropUsageInfo(name);
    byComponent.set(name, info);
  }
  return info;
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

function getJsxMemberNameParts(
  name: AstNode | undefined,
): { objectName: string; propertyName: string } | null {
  if (!name || name.type !== "JSXMemberExpression") {
    return null;
  }
  const object = name.object as AstNode | undefined;
  const property = name.property as AstNode | undefined;
  if (
    object?.type !== "JSXIdentifier" ||
    typeof object.name !== "string" ||
    property?.type !== "JSXIdentifier" ||
    typeof property.name !== "string"
  ) {
    return null;
  }
  return { objectName: object.name, propertyName: property.name };
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

/** Use ripgrep to find files with PascalCase or namespace JSX tags. */
function rgJsxComponentFilter(files: readonly string[]): Set<string> | undefined {
  const dirs = deduplicateParentDirs(files);
  if (dirs.length === 0) {
    return undefined;
  }

  try {
    const globArgs = ["*.tsx", "*.jsx", "*.ts", "*.js", "*.mts", "*.cts", "*.mjs", "*.cjs"]
      .map((glob) => `--glob ${shellQuote(glob)}`)
      .join(" ");
    const cmd = `rg -l ${shellQuote(String.raw`<([A-Z]|[A-Za-z_$][A-Za-z0-9_$]*\.)`)} ${globArgs} ${dirs.map(shellQuote).join(" ")}`;
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
 * Use ripgrep to quickly find files containing styled-components, StyleX, or relevant JSX props.
 * Returns a Set of absolute file paths, or undefined if rg is not available.
 */
function rgPreFilter(files: readonly string[]): Set<string> | undefined {
  const dirs = deduplicateParentDirs(files);
  if (dirs.length === 0) {
    return undefined;
  }

  try {
    const pattern = String.raw`(styled-components|@stylexjs/stylex|\.stylex["']|\bas[={]|\bref[={])`;
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
  const lines = buildCrossFileDebugLines("[DEBUG_CODEMOD] Unified prepass:", scannedFiles, info);

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
