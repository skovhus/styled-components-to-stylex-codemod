/**
 * Analysis-only mode: produce an ordered plan of the files that must be
 * converted by hand before the codemod can finish the rest of the migration.
 *
 * Core concepts: genuine blocker detection (files the codemod truly cannot
 * convert, as opposed to files that only bail because a dependency is still
 * styled-components), bottom-up dependency ordering, and consumer/imported-export
 * accounting so each blocker is presented with the impact of converting it.
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

import type { AdapterInput } from "./adapter.js";
import { expandGlobFiles, runTransform, type TransformFileResult } from "./run.js";
import { CASCADE_CONFLICT_WARNING, type CollectedWarning } from "./internal/logger.js";
import { createModuleResolver } from "./internal/prepass/resolve-imports.js";
import { createPrepassParser, type AstNode } from "./internal/prepass/prepass-parser.js";
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

  // 1. Run the codemod in dependency order (dry, silent) to discover what it
  //    cannot convert. The dependency-ordered run resolves transient
  //    "dependency not converted yet" bails on its own, so whatever remains
  //    unconverted with a non-cascade reason is a genuine blocker.
  const result = await runTransform({
    files: options.files,
    consumerPaths: options.consumerPaths,
    adapter: options.adapter,
    parser: options.parser ?? "tsx",
    dryRun: true,
    silent: true,
  });

  const blockerReasons = collectGenuineBlockers(result.warnings, result.fileResults, cwd);
  if (blockerReasons.size === 0) {
    return { manualConversionFiles: [], totalFiles: runFiles.length, unlocksFileCount: 0 };
  }

  // 2. Build the import graph across every scanned file so we can attribute
  //    consumers and imported exports to each blocker, and order blockers
  //    bottom-up (a blocker imported by another blocker is converted first).
  const graph = buildImportGraph(scanFiles, cwd);
  const cascadeUnblocks = collectCascadeUnblocks(result.warnings, cwd);
  const displayByNorm = buildDisplayMap(scanFiles, cwd);

  const blockerSet = new Set(blockerReasons.keys());
  const consumersByBlocker = new Map<string, Map<string, Set<string>>>(); // blocker -> export -> consumers
  const depsByBlocker = new Map<string, Set<string>>(); // blocker -> blocker deps
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

  const consumerCount = (blocker: string): number => {
    const consumers = new Set<string>();
    for (const set of consumersByBlocker.get(blocker)?.values() ?? []) {
      for (const c of set) {
        consumers.add(c);
      }
    }
    return consumers.size;
  };
  const unlocksCount = (blocker: string): number => cascadeUnblocks.get(blocker)?.size ?? 0;
  // Prioritize files that unblock the most automatic migration; consumer count
  // breaks ties. Dependency order is still enforced by orderBottomUp.
  const weight = (blocker: string): number =>
    unlocksCount(blocker) * 1_000_000 + consumerCount(blocker);

  const orderedBlockers = orderBottomUp([...blockerSet], depsByBlocker, weight);

  const manualConversionFiles: ManualConversionFile[] = orderedBlockers.map((blocker, index) => {
    const exportUsage = consumersByBlocker.get(blocker) ?? new Map<string, Set<string>>();
    const importedExports: ImportedExportUsage[] = [...exportUsage.entries()]
      .map(([exportName, consumers]) => ({ exportName, consumerCount: consumers.size }))
      .sort(
        (a, b) => b.consumerCount - a.consumerCount || a.exportName.localeCompare(b.exportName),
      );

    return {
      filePath: displayByNorm.get(blocker) ?? blocker,
      order: index + 1,
      consumerCount: consumerCount(blocker),
      unlocksFileCount: unlocksCount(blocker),
      importedExports,
      reasons: blockerReasons.get(blocker) ?? [],
    };
  });

  const unlockedFiles = new Set<string>();
  for (const blocker of blockerSet) {
    for (const consumer of cascadeUnblocks.get(blocker) ?? []) {
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

  const priority = manualConversionFiles.filter((file) => file.unlocksFileCount > 0);
  const standalone = manualConversionFiles.filter((file) => file.unlocksFileCount === 0);

  const lines: string[] = [];
  lines.push("Manual conversion plan");
  lines.push("======================");
  lines.push(`${manualConversionFiles.length} of ${totalFiles} file(s) need manual conversion.`);
  if (unlocksFileCount > 0) {
    lines.push(
      `Converting the ${priority.length} high-impact file(s) below unblocks ${unlocksFileCount} file(s) for automatic migration.`,
    );
  }
  lines.push("");

  if (priority.length > 0) {
    lines.push("Focus here first — convert in this order (dependencies first):");
    lines.push("");
    for (const file of priority) {
      appendFileEntry(lines, file);
    }
  }

  if (standalone.length > 0) {
    lines.push(
      `Standalone file(s) — nothing else depends on these; convert as you reach them (${standalone.length}):`,
    );
    lines.push("");
    appendStandaloneSummary(lines, standalone);
  }

  return lines.join("\n").trimEnd();
}

// --- Non-exported helpers ---

function appendFileEntry(lines: string[], file: ManualConversionFile): void {
  lines.push(`${file.order}. ${file.filePath}`);
  const impact = [`unblocks ${file.unlocksFileCount} file(s) for auto-migration`];
  if (file.consumerCount > 0) {
    impact.push(`imported by ${file.consumerCount} file(s)`);
  }
  lines.push(`   → ${impact.join(" · ")}`);
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
    const target = cascadeTargetPath(warning);
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

function cascadeTargetPath(warning: CollectedWarning): string | undefined {
  const context = warning.context;
  if (!context || typeof context !== "object") {
    return undefined;
  }
  const record = context as Record<string, unknown>;
  if (typeof record.definitionPath === "string") {
    return record.definitionPath;
  }
  return typeof record.importedPath === "string" ? record.importedPath : undefined;
}

/** Build a `consumer -> [{ dep, exportName }]` import graph over all scanned files. */
function buildImportGraph(scanFiles: readonly string[], cwd: string): Map<string, ImportEdge[]> {
  const graph = new Map<string, ImportEdge[]>();
  const resolver = createModuleResolver();
  const parser = createPrepassParser("tsx");
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
    const importMap = buildImportMapFromNodes(importNodes);

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
