/**
 * Analysis-only mode: produce an ordered plan of the files that must be
 * converted by hand before the codemod can finish the rest of the migration.
 *
 * Core concepts: genuine blocker detection (files the codemod truly cannot
 * convert, as opposed to files that only bail because a dependency is still
 * styled-components), bottom-up dependency ordering, and consumer/imported-export
 * accounting so each blocker is presented with the impact of converting it.
 */
import { relative, resolve } from "node:path";
import { readFileSync } from "node:fs";

import type { AdapterInput } from "./adapter.js";
import { expandGlobFiles, runTransform, type TransformFileResult } from "./run.js";
import {
  CASCADE_CONFLICT_WARNING,
  getCascadeDependedFilePath,
  type CollectedWarning,
  Logger,
} from "./internal/logger.js";
import { createModuleResolver } from "./internal/prepass/resolve-imports.js";
import {
  createPrepassParser,
  type AstNode,
  type PrepassParserName,
} from "./internal/prepass/prepass-parser.js";
import {
  buildImportMapFromNodes,
  walkForImportsAndTemplates,
} from "./internal/prepass/scan-cross-file-selectors.js";
import { resolveBarrelReExport } from "./internal/prepass/extract-external-interface.js";
import { toRealPath } from "./internal/utilities/path-utils.js";

export interface MigrationPlanOptions {
  /** Glob pattern(s) for the files the codemod would transform. */
  files: string | string[];
  /** Glob pattern(s) of additional files to scan for consumers, or `null`. */
  consumerPaths: string | string[] | null;
  /** Adapter for the transform (same adapter you would pass to `runTransform`). */
  adapter: AdapterInput;
  /** jscodeshift parser to use. @default "tsx" */
  parser?: "babel" | "babylon" | "flow" | "ts" | "tsx";
}

export interface ImportedExportUsage {
  /** Exported name consumers import (`"default"` for a default import, `"*"` for a namespace). */
  exportName: string;
  /** Number of distinct files importing this export. */
  consumerCount: number;
}

export interface ManualConversionReason {
  /** The bail message explaining why the codemod cannot convert the file. */
  message: string;
  /** Source locations where the unsupported pattern occurs. */
  locations: Array<{ filePath: string; line: number; column: number }>;
}

export interface ManualConversionFile {
  /** Path of the file that must be converted by hand. */
  filePath: string;
  /** 1-based position in the recommended bottom-up conversion order. */
  order: number;
  /** Number of distinct files that import from this file. */
  consumerCount: number;
  /**
   * Number of distinct files that currently bail (cascade conflict) because this
   * file is still styled-components — i.e. files unlocked by converting it.
   */
  unlocksFileCount: number;
  /** Which exports consumers import, so you know what to convert first. */
  importedExports: ImportedExportUsage[];
  /** Why the codemod cannot convert this file automatically. */
  reasons: ManualConversionReason[];
  /** Other files in this plan that this file imports (must be converted first). */
  dependsOn: string[];
}

export interface MigrationPlan {
  /** Files to convert by hand, ordered by unblock impact (dependencies first). */
  manualConversionFiles: ManualConversionFile[];
  /** Total number of files matched by the `files` glob. */
  totalFiles: number;
  /**
   * Number of distinct files that are currently blocked (cascade conflict) by one
   * or more of the listed files — i.e. files unlocked for automatic migration once
   * the manual conversions are done.
   */
  unlocksFileCount: number;
}

/**
 * Run the codemod in analysis-only (dry) mode and compute the ordered list of
 * files that block the rest of the migration and must be converted manually.
 */
export async function analyzeMigrationPlan(options: MigrationPlanOptions): Promise<MigrationPlan> {
  const cwd = process.cwd();
  const filePatterns = Array.isArray(options.files) ? options.files : [options.files];
  const consumerPatterns =
    options.consumerPaths === null
      ? []
      : Array.isArray(options.consumerPaths)
        ? options.consumerPaths
        : [options.consumerPaths];

  const runFiles = await expandGlobFiles(filePatterns, cwd);
  const scanFiles = unique([...runFiles, ...(await expandGlobFiles(consumerPatterns, cwd))]);

  const parser = options.parser ?? "tsx";
  const runFilesNorm = new Set(runFiles.map((file) => norm(file, cwd)));

  // First pass (no assumptions) establishes the real cascade relationships:
  // which files bail only because they wrap an unconverted styled base.
  const firstPass = await runAnalysisPass(options, parser, []);
  const cascadeUnblocks = collectCascadeUnblocks(firstPass.warnings, cwd);

  // Cascade targets outside the analyzed files are external prerequisites: they
  // still use styled-components and block their in-scope wrappers, but the codemod
  // never sees them (not in `files`). Assume them converted so in-scope consumers
  // reveal their own issues, and report them so we never claim success while a
  // wrapper stays blocked by an out-of-scope base.
  const externalBlockerSet = new Set(
    [...cascadeUnblocks.keys()].filter((target) => !runFilesNorm.has(target)),
  );

  // Fixpoint: a cascade conflict bails a file before rule lowering, so a file that
  // wraps a blocker AND has its own unsupported pattern only shows the cascade
  // warning at first. Assume the blockers found so far (plus external bases) are
  // converted and re-run; consumers whose own issues were masked now surface.
  // Repeat until no new in-scope blockers appear.
  const assumedConverted = new Set<string>(externalBlockerSet);
  let blockerReasons = new Map<string, ManualConversionReason[]>();
  for (let pass = 0; pass < MAX_ANALYSIS_PASSES; pass++) {
    const passResult = await runAnalysisPass(options, parser, [...assumedConverted]);
    blockerReasons = collectGenuineBlockers(passResult.warnings, passResult.fileResults, cwd);
    const newlyFound = [...blockerReasons.keys()].filter((file) => !assumedConverted.has(file));
    if (newlyFound.length === 0) {
      break;
    }
    for (const file of newlyFound) {
      assumedConverted.add(file);
    }
  }

  // External prerequisites only matter if they actually block an in-scope file.
  const reachableExternalBlockers = new Set(
    [...externalBlockerSet].filter((target) => (cascadeUnblocks.get(target)?.size ?? 0) > 0),
  );

  if (blockerReasons.size === 0 && reachableExternalBlockers.size === 0) {
    return { manualConversionFiles: [], totalFiles: runFiles.length, unlocksFileCount: 0 };
  }

  // Build the import graph and attribute consumers, dependencies, and impact
  // weights to every blocker — in-scope genuine blockers plus external bases.
  const graph = buildImportGraph(scanFiles, cwd, parser);
  const displayByNorm = buildDisplayMap(scanFiles, cwd);
  const blockerSet = new Set([...blockerReasons.keys(), ...reachableExternalBlockers]);
  const reasonsByBlocker = new Map(blockerReasons);
  for (const target of reachableExternalBlockers) {
    reasonsByBlocker.set(target, [{ message: EXTERNAL_BLOCKER_REASON, locations: [] }]);
  }
  const {
    consumersByBlocker,
    depsByBlocker,
    consumerCountByBlocker,
    unlockedByBlocker,
    weightByBlocker,
  } = buildBlockerGraph(blockerSet, graph, cascadeUnblocks);

  const orderedBlockers = orderBottomUp(
    [...blockerSet],
    depsByBlocker,
    (blocker) => weightByBlocker.get(blocker) ?? 0,
  );

  const manualConversionFiles: ManualConversionFile[] = orderedBlockers.map((blocker, index) => {
    const exportUsage = consumersByBlocker.get(blocker) ?? new Map<string, Set<string>>();
    const importedExports: ImportedExportUsage[] = [...exportUsage.entries()]
      .map(([exportName, consumers]) => ({ exportName, consumerCount: consumers.size }))
      .sort(
        (a, b) => b.consumerCount - a.consumerCount || a.exportName.localeCompare(b.exportName),
      );

    const dependsOn = [...(depsByBlocker.get(blocker) ?? [])]
      .map((dep) => displayByNorm.get(dep) ?? relative(cwd, dep))
      .sort();

    return {
      filePath: displayByNorm.get(blocker) ?? relative(cwd, blocker),
      order: index + 1,
      consumerCount: consumerCountByBlocker.get(blocker) ?? 0,
      unlocksFileCount: unlockedByBlocker.get(blocker)?.length ?? 0,
      importedExports,
      reasons: reasonsByBlocker.get(blocker) ?? [],
      dependsOn,
    };
  });

  const unlockedFiles = new Set<string>();
  for (const unlocked of unlockedByBlocker.values()) {
    for (const consumer of unlocked) {
      unlockedFiles.add(consumer);
    }
  }

  return {
    manualConversionFiles,
    totalFiles: runFiles.length,
    unlocksFileCount: unlockedFiles.size,
  };
}

/** Render a {@link MigrationPlan} as a human-readable, actionable report. */
export function formatMigrationPlan(plan: MigrationPlan): string {
  const { manualConversionFiles, totalFiles, unlocksFileCount } = plan;
  if (manualConversionFiles.length === 0) {
    return `No manual conversion needed — the codemod can convert all ${totalFiles} file(s) in dependency order.`;
  }

  // Focus = files that unblock automatic migration plus any file in a dependency
  // chain with another listed file; those keep their bottom-up order. Only fully
  // isolated blockers go to the standalone section.
  const focusPaths = collectFocusPaths(manualConversionFiles);
  const priority = manualConversionFiles.filter((file) => focusPaths.has(file.filePath));
  const standalone = manualConversionFiles.filter((file) => !focusPaths.has(file.filePath));

  const lines: string[] = [];
  lines.push("Manual conversion plan");
  lines.push("======================");
  lines.push(`${manualConversionFiles.length} of ${totalFiles} file(s) need manual conversion.`);
  if (unlocksFileCount > 0) {
    lines.push(
      `Focus on the ${priority.length} file(s) below — converting them unblocks ${unlocksFileCount} file(s) for automatic migration.`,
    );
  }
  lines.push("");

  if (priority.length > 0) {
    // Map each focus file to its printed position so entries can reference the
    // other listed files they depend on (e.g. "requires #4 first").
    const positionByPath = new Map(priority.map((file, index) => [file.filePath, index + 1]));
    lines.push("Convert in this order (dependencies first):");
    lines.push("");
    priority.forEach((file, index) => appendFileEntry(lines, file, index + 1, positionByPath));
  }

  if (standalone.length > 0) {
    lines.push(
      `Standalone file(s) — nothing else in the plan depends on these; convert as you reach them (${standalone.length}):`,
    );
    lines.push("");
    appendStandaloneSummary(lines, standalone);
  }

  return lines.join("\n").trimEnd();
}

// --- Non-exported helpers ---

interface AnalysisPassResult {
  warnings: CollectedWarning[];
  fileResults: readonly TransformFileResult[];
}

/**
 * Run one dry analysis pass and return only the warnings it produced. `Logger`
 * is process-global, so snapshot the pre-existing warnings, keep only this run's,
 * and restore the snapshot afterward so analysis never leaks blocker warnings
 * into a later transform in the same process.
 */
async function runAnalysisPass(
  options: MigrationPlanOptions,
  parser: NonNullable<MigrationPlanOptions["parser"]>,
  assumeConvertedFiles: string[],
): Promise<AnalysisPassResult> {
  const snapshot = Logger.createReport().getWarnings();
  const priorWarnings = new Set(snapshot);
  let result: Awaited<ReturnType<typeof runTransform>>;
  try {
    result = await runTransform({
      files: options.files,
      consumerPaths: options.consumerPaths,
      adapter: options.adapter,
      parser,
      dryRun: true,
      silent: true,
      assumeConvertedFiles,
    });
  } finally {
    Logger.restoreWarnings(snapshot);
  }
  return {
    warnings: result.warnings.filter((warning) => !priorWarnings.has(warning)),
    fileResults: result.fileResults,
  };
}

interface BlockerGraph {
  /** blocker -> imported export name -> consumer files importing it. */
  consumersByBlocker: Map<string, Map<string, Set<string>>>;
  /** blocker -> other in-plan blockers it imports (must convert first). */
  depsByBlocker: Map<string, Set<string>>;
  /** blocker -> number of distinct files importing it. */
  consumerCountByBlocker: Map<string, number>;
  /** blocker -> files that cascade-bail on it and aren't blockers themselves. */
  unlockedByBlocker: Map<string, string[]>;
  /** blocker -> ordering weight (unlock impact, consumer count as tiebreak). */
  weightByBlocker: Map<string, number>;
}

/** Attribute consumers, in-plan dependencies, and impact weights to each blocker. */
function buildBlockerGraph(
  blockerSet: ReadonlySet<string>,
  graph: ReadonlyMap<string, ImportEdge[]>,
  cascadeUnblocks: ReadonlyMap<string, Set<string>>,
): BlockerGraph {
  const consumersByBlocker = new Map<string, Map<string, Set<string>>>();
  const depsByBlocker = new Map<string, Set<string>>();
  for (const blocker of blockerSet) {
    consumersByBlocker.set(blocker, new Map());
    depsByBlocker.set(blocker, new Set());
  }

  for (const [consumer, edges] of graph) {
    for (const edge of edges) {
      if (!blockerSet.has(edge.dep) || edge.dep === consumer) {
        continue;
      }
      addConsumer(consumersByBlocker.get(edge.dep)!, edge.exportName, consumer);
      if (blockerSet.has(consumer)) {
        depsByBlocker.get(consumer)!.add(edge.dep);
      }
    }
  }

  const consumerCountByBlocker = new Map<string, number>();
  const unlockedByBlocker = new Map<string, string[]>();
  const weightByBlocker = new Map<string, number>();
  for (const blocker of blockerSet) {
    const consumers = new Set<string>();
    for (const set of consumersByBlocker.get(blocker)!.values()) {
      for (const consumer of set) {
        consumers.add(consumer);
      }
    }
    // A blocker "unlocks" files that cascade-bail on it but aren't blockers
    // themselves — those auto-convert once it is hand-converted. Files that are
    // also blockers still need their own manual work, so they don't count.
    const unlocked = [...(cascadeUnblocks.get(blocker) ?? [])].filter(
      (consumer) => !blockerSet.has(consumer),
    );
    consumerCountByBlocker.set(blocker, consumers.size);
    unlockedByBlocker.set(blocker, unlocked);
    // Prioritize files that unblock the most automatic migration; consumer count
    // breaks ties. Dependency order is still enforced by orderBottomUp.
    weightByBlocker.set(blocker, unlocked.length * 1_000_000 + consumers.size);
  }

  return {
    consumersByBlocker,
    depsByBlocker,
    consumerCountByBlocker,
    unlockedByBlocker,
    weightByBlocker,
  };
}

/**
 * Files to surface in the ordered focus list: any file that unblocks automatic
 * migration, plus any file involved in an in-plan dependency relationship (it
 * depends on another listed file, or another listed file depends on it). Only
 * fully isolated blockers fall through to the standalone summary, so the ordered
 * list never loses a real dependency chain — even when nothing unlocks a wrapper.
 */
function collectFocusPaths(files: readonly ManualConversionFile[]): Set<string> {
  const dependedUpon = new Set<string>();
  for (const file of files) {
    for (const dependency of file.dependsOn) {
      dependedUpon.add(dependency);
    }
  }
  const focus = new Set<string>();
  for (const file of files) {
    if (file.unlocksFileCount > 0 || file.dependsOn.length > 0 || dependedUpon.has(file.filePath)) {
      focus.add(file.filePath);
    }
  }
  return focus;
}

function appendFileEntry(
  lines: string[],
  file: ManualConversionFile,
  position: number,
  positionByPath: ReadonlyMap<string, number>,
): void {
  lines.push(`${position}. ${file.filePath}`);
  const impact: string[] = [];
  if (file.unlocksFileCount > 0) {
    impact.push(`unblocks ${file.unlocksFileCount} file(s) for auto-migration`);
  }
  if (file.consumerCount > 0) {
    impact.push(`imported by ${file.consumerCount} file(s)`);
  }
  if (impact.length > 0) {
    lines.push(`   → ${impact.join(" · ")}`);
  }
  // Surface dependencies on other listed files so the order is self-explanatory
  // ("convert #4 before this one").
  if (file.dependsOn.length > 0) {
    const deps = file.dependsOn
      .map((dep) => {
        const depPosition = positionByPath.get(dep);
        return depPosition === undefined ? dep : `#${depPosition} ${dep}`;
      })
      .sort();
    lines.push(`   Requires first: ${deps.join(", ")}`);
  }
  if (file.importedExports.length > 0) {
    const exportList = file.importedExports
      .map((usage) => `${formatExportName(usage.exportName)} (used by ${usage.consumerCount})`)
      .join(", ");
    lines.push(`   Convert these exports: ${exportList}`);
  }
  lines.push("   Blocked by:");
  for (const reason of file.reasons) {
    lines.push(`     • ${reason.message}`);
    for (const loc of reason.locations.slice(0, MAX_REASON_LOCATIONS)) {
      lines.push(`         ${loc.filePath}:${loc.line}:${loc.column}`);
    }
    const remaining = reason.locations.length - MAX_REASON_LOCATIONS;
    if (remaining > 0) {
      lines.push(`         ... and ${remaining} more location(s)`);
    }
  }
  lines.push("");
}

/** Group standalone blockers by reason so the long tail stays scannable. */
function appendStandaloneSummary(
  lines: string[],
  standalone: readonly ManualConversionFile[],
): void {
  const filesByReason = new Map<string, string[]>();
  for (const file of standalone) {
    const reasonMessage = file.reasons[0]?.message ?? "Unsupported pattern";
    const files = filesByReason.get(reasonMessage) ?? [];
    files.push(file.filePath);
    filesByReason.set(reasonMessage, files);
  }

  const grouped = [...filesByReason.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  for (const [reasonMessage, files] of grouped) {
    lines.push(`  • ${reasonMessage} (${files.length} file(s))`);
    for (const filePath of files.slice(0, MAX_STANDALONE_FILES_PER_REASON)) {
      lines.push(`      ${filePath}`);
    }
    const remaining = files.length - MAX_STANDALONE_FILES_PER_REASON;
    if (remaining > 0) {
      lines.push(`      ... and ${remaining} more file(s)`);
    }
  }
  lines.push("");
}

function formatExportName(exportName: string): string {
  if (exportName === "default") {
    return "default export";
  }
  if (exportName === "*") {
    return "* (namespace import)";
  }
  return exportName;
}

interface ImportEdge {
  /** Normalized absolute path of the imported (depended-on) file. */
  dep: string;
  /** Exported name imported from `dep`. */
  exportName: string;
}

const MAX_REASON_LOCATIONS = 3;
const MAX_STANDALONE_FILES_PER_REASON = 5;
const EXTERNAL_BLOCKER_REASON =
  "Outside the analyzed files — still uses styled-components and is wrapped by in-scope component(s); convert it or add it to the migration scope first";
/** Safety cap on fixpoint passes; each pass reveals at least one new blocker until stable. */
const MAX_ANALYSIS_PASSES = 50;

/**
 * A file is a genuine blocker when the codemod did not convert it and the reason
 * is something other than a dependency-order cascade conflict (which resolves on
 * its own once the depended-on file is converted), or when it threw outright.
 */
function collectGenuineBlockers(
  warnings: readonly CollectedWarning[],
  fileResults: readonly TransformFileResult[],
  cwd: string,
): Map<string, ManualConversionReason[]> {
  const reasonsByFile = new Map<string, Map<string, ManualConversionReason>>();
  const ensureReason = (fileNorm: string, message: string): ManualConversionReason => {
    let reasons = reasonsByFile.get(fileNorm);
    if (!reasons) {
      reasons = new Map();
      reasonsByFile.set(fileNorm, reasons);
    }
    let reason = reasons.get(message);
    if (!reason) {
      reason = { message, locations: [] };
      reasons.set(message, reason);
    }
    return reason;
  };

  // Only files the dependency-ordered run left unconverted can be blockers.
  const unconverted = new Set<string>();
  const erroredFiles = new Set<string>();
  for (const fileResult of fileResults) {
    if (fileResult.status === "skipped" || fileResult.status === "error") {
      unconverted.add(norm(fileResult.filePath, cwd));
    }
    if (fileResult.status === "error") {
      erroredFiles.add(norm(fileResult.filePath, cwd));
    }
  }

  for (const warning of warnings) {
    if (warning.type === CASCADE_CONFLICT_WARNING) {
      continue;
    }
    const fileNorm = norm(warning.filePath, cwd);
    if (!unconverted.has(fileNorm)) {
      continue; // advisory warning on a file that still converted — not a blocker
    }
    const reason = ensureReason(fileNorm, warning.type);
    if (warning.loc) {
      reason.locations.push({
        filePath: warning.filePath,
        line: warning.loc.line,
        column: warning.loc.column,
      });
    }
  }

  for (const fileNorm of erroredFiles) {
    ensureReason(fileNorm, "The codemod threw an error while transforming this file");
  }

  const result = new Map<string, ManualConversionReason[]>();
  for (const [fileNorm, reasons] of reasonsByFile) {
    result.set(fileNorm, [...reasons.values()]);
  }
  return result;
}

/** Map each blocker file to the set of files that cascade-bail because of it. */
function collectCascadeUnblocks(
  warnings: readonly CollectedWarning[],
  cwd: string,
): Map<string, Set<string>> {
  const unblocks = new Map<string, Set<string>>();
  for (const warning of warnings) {
    if (warning.type !== CASCADE_CONFLICT_WARNING) {
      continue;
    }
    const target = getCascadeDependedFilePath(warning);
    if (!target) {
      continue;
    }
    const targetNorm = norm(target, cwd);
    let consumers = unblocks.get(targetNorm);
    if (!consumers) {
      consumers = new Set();
      unblocks.set(targetNorm, consumers);
    }
    consumers.add(norm(warning.filePath, cwd));
  }
  return unblocks;
}

/** Build a `consumer -> [{ dep, exportName }]` import graph over all scanned files. */
function buildImportGraph(
  scanFiles: readonly string[],
  cwd: string,
  parserName: PrepassParserName,
): Map<string, ImportEdge[]> {
  const graph = new Map<string, ImportEdge[]>();
  const resolver = createModuleResolver();
  const parser = createPrepassParser(parserName);
  const read = (filePath: string): string => {
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return "";
    }
  };
  const resolveForBarrel = (specifier: string, fromFile: string): string | null =>
    resolver.resolve(fromFile, specifier) ?? null;

  for (const relPath of scanFiles) {
    const absFrom = resolve(cwd, relPath);
    const source = read(absFrom);
    if (!source) {
      continue;
    }
    const program = parseProgram(parser, source);
    if (!program) {
      continue;
    }
    const importNodes: AstNode[] = [];
    walkForImportsAndTemplates(program, importNodes, []);
    // Drop type-only imports — `import type {...}` / `import { type X }` are
    // erased at runtime, so they don't make the target a conversion prerequisite
    // and shouldn't inflate consumer counts.
    const importMap = buildImportMapFromNodes(importNodes.map(stripTypeOnlyImports));

    const edges: ImportEdge[] = [];
    for (const entry of importMap.values()) {
      const resolved = resolver.resolve(absFrom, entry.source);
      if (!resolved) {
        continue;
      }
      const resolvedReal = toRealPath(resolved);
      const definitionPath =
        resolveBarrelReExport(resolvedReal, entry.importedName, resolveForBarrel, read) ??
        resolvedReal;
      edges.push({ dep: toRealPath(definitionPath), exportName: entry.importedName });
    }
    graph.set(toRealPath(absFrom), edges);
  }

  return graph;
}

/** Remove type-only specifiers (or the whole declaration) so only runtime imports remain. */
function stripTypeOnlyImports(node: AstNode): AstNode {
  if ((node as { importKind?: string }).importKind === "type") {
    return { ...node, specifiers: [] };
  }
  const specifiers = node.specifiers as AstNode[] | undefined;
  if (!specifiers) {
    return node;
  }
  const valueSpecifiers = specifiers.filter(
    (spec) => (spec as { importKind?: string }).importKind !== "type",
  );
  return valueSpecifiers.length === specifiers.length
    ? node
    : { ...node, specifiers: valueSpecifiers };
}

function parseProgram(
  parser: ReturnType<typeof createPrepassParser>,
  source: string,
): AstNode | null {
  try {
    const ast = parser.parse(source) as AstNode;
    return ((ast as { program?: AstNode }).program ?? ast) as AstNode;
  } catch {
    return null;
  }
}

/**
 * Topologically order blockers so that dependencies come before the blockers
 * that depend on them (bottom-up). Ties are broken by impact (consumer count)
 * then path for stable output.
 */
function orderBottomUp(
  blockers: readonly string[],
  depsByBlocker: ReadonlyMap<string, Set<string>>,
  weight: (blocker: string) => number,
): string[] {
  const byImpact = (a: string, b: string): number => weight(b) - weight(a) || a.localeCompare(b);
  const seeds = [...blockers].sort(byImpact);

  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (blocker: string): void => {
    if (visited.has(blocker) || visiting.has(blocker)) {
      return;
    }
    visiting.add(blocker);
    for (const dep of [...(depsByBlocker.get(blocker) ?? [])].sort(byImpact)) {
      visit(dep);
    }
    visiting.delete(blocker);
    visited.add(blocker);
    ordered.push(blocker);
  };
  for (const seed of seeds) {
    visit(seed);
  }
  return ordered;
}

function buildDisplayMap(scanFiles: readonly string[], cwd: string): Map<string, string> {
  const displayByNorm = new Map<string, string>();
  for (const relPath of scanFiles) {
    displayByNorm.set(norm(relPath, cwd), relPath);
  }
  return displayByNorm;
}

function addConsumer(
  exportUsage: Map<string, Set<string>>,
  exportName: string,
  consumer: string,
): void {
  let consumers = exportUsage.get(exportName);
  if (!consumers) {
    consumers = new Set();
    exportUsage.set(exportName, consumers);
  }
  consumers.add(consumer);
}

function norm(filePath: string, cwd: string): string {
  return toRealPath(resolve(cwd, filePath));
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
