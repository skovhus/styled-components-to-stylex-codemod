/**
 * Unified prepass: single pass for both cross-file selector scanning
 * and consumer analysis (external interface detection).
 *
 * Reads each file once, classifies by content (styled-components / as-prop),
 * and runs AST parsing + consumer analysis only on relevant files.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
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
}

interface PrepassResult {
  crossFileInfo: CrossFileInfo;
  consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined;
}

/* ── Regex patterns (compiled once at module scope) ───────────────────── */

const AS_PROP_RE = /\bas[={]/;
const STYLED_CALL_RE = /styled\(([A-Z][A-Za-z0-9]+)/g;
const STYLED_DEF_RE = /const\s+([A-Z][A-Za-z0-9]*)\b[^=]*=\s*styled[.(]/g;
/** Matches <Component ...as= across lines. [^<>]* avoids crossing tag boundaries. */
const JSX_AS_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)\b[^<>]*\bas[={]/g;

/* ── Public API ───────────────────────────────────────────────────────── */

export async function runPrepass(options: PrepassOptions): Promise<PrepassResult> {
  const { filesToTransform, consumerPaths, resolver, parserName, createExternalInterface } =
    options;
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

  const resolve: Resolve = (specifier, fromFile) => {
    const result = resolver.resolve(pathResolve(fromFile), specifier);
    return result ? toRealPath(result) : null;
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

  // Phase 1: Single pass — read all files, classify by content, analyze relevant ones.
  for (const filePath of uniqueAllFiles) {
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

  if (process.env.DEBUG_CODEMOD) {
    logPrepassDebug(uniqueAllFiles, crossFileInfo, consumerAnalysis);
  }

  return { crossFileInfo, consumerAnalysis };
}

/* ── Phase helpers ────────────────────────────────────────────────────── */

/** Matches `${Identifier}` in source — used to find potential selector expressions. */
const SELECTOR_EXPR_RE = /\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

/**
 * Fast regex pre-filter: checks if the source contains any `${Identifier}`
 * that appears to be in a CSS selector context (before `{`, not after `:`).
 *
 * This reduces the number of files needing AST parsing from ~888 to ~500,
 * saving ~120ms of babel parsing time per run.
 */
function hasRegexSelectorCandidate(source: string): boolean {
  SELECTOR_EXPR_RE.lastIndex = 0;
  for (const m of source.matchAll(SELECTOR_EXPR_RE)) {
    const pos = m.index;
    const before = source.slice(0, pos).trimEnd();
    const after = source.slice(pos + m[0].length).trimStart();
    if (isSelectorContext(before, after)) {
      return true;
    }
  }
  return false;
}

/** Scan a single file for cross-file selector usages using AST parsing. */
function scanFileForSelectorsAst(
  filePath: string,
  source: string,
  transformSet: ReadonlySet<string>,
  resolver: ModuleResolver,
  parser: ReturnType<typeof createPrepassParser>,
  toRealPath: (p: string) => string,
): CrossFileSelectorUsage[] {
  let ast: AstNode;
  try {
    ast = parser.parse(source) as AstNode;
  } catch {
    return [];
  }

  const program = (ast.program ?? ast) as AstNode;

  const importNodes: AstNode[] = [];
  const taggedTemplateNodes: AstNode[] = [];
  walkForImportsAndTemplates(program, importNodes, taggedTemplateNodes);

  const importMap = buildImportMapFromNodes(importNodes);
  if (importMap.size === 0) {
    return [];
  }

  const styledImportName = findStyledImportNameFromNodes(importNodes);
  if (!styledImportName) {
    return [];
  }

  const selectorLocals = findComponentSelectorLocalsFromNodes(
    taggedTemplateNodes,
    styledImportName,
  );
  if (selectorLocals.size === 0) {
    return [];
  }

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

/* ── Debug logging ────────────────────────────────────────────────────── */

function logPrepassDebug(
  scannedFiles: string[],
  info: CrossFileInfo,
  consumerAnalysis: Map<string, ExternalInterfaceResult> | undefined,
): void {
  const lines: string[] = ["[DEBUG_CODEMOD] Unified prepass:"];
  lines.push(`  Scanned ${scannedFiles.length} file(s)`);

  if (info.selectorUsages.size === 0) {
    lines.push("  No cross-file selector usages found.");
  } else {
    lines.push(`  Found cross-file selector usages in ${info.selectorUsages.size} file(s):`);
    for (const [consumer, usages] of info.selectorUsages) {
      for (const u of usages) {
        lines.push(
          `    ${consumer} → ${u.importedName} (from ${u.resolvedPath}, transformed=${u.consumerIsTransformed})`,
        );
      }
    }
  }

  if (info.componentsNeedingMarkerSidecar.size > 0) {
    lines.push("  Components needing marker sidecar (both consumer and target transformed):");
    for (const [file, names] of info.componentsNeedingMarkerSidecar) {
      lines.push(`    ${file}: ${[...names].join(", ")}`);
    }
  }

  if (info.componentsNeedingGlobalSelectorBridge.size > 0) {
    lines.push("  Components needing global selector bridge className (consumer not transformed):");
    for (const [file, names] of info.componentsNeedingGlobalSelectorBridge) {
      lines.push(`    ${file}: ${[...names].join(", ")}`);
    }
  }

  if (consumerAnalysis) {
    lines.push(`  Consumer analysis: ${consumerAnalysis.size} entries`);
  }

  process.stderr.write(lines.join("\n") + "\n");
}
