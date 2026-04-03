/**
 * Init command: scans a codebase for styled-components patterns and
 * generates a starter adapter file with TODO placeholders.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { glob } from "node:fs/promises";
import { scanPatterns, type ScannedPatterns } from "./internal/init/scan-patterns.js";
import { generateAdapterStub, generateSummary } from "./internal/init/generate-adapter-stub.js";
import type { PrepassParserName } from "./internal/prepass/prepass-parser.js";

/* ── Public types ─────────────────────────────────────────────────────── */

export interface InitOptions {
  /** Glob pattern(s) for source files to scan (e.g. "src/**\/*.{ts,tsx}"). */
  files: string | string[];
  /** Output path for the generated adapter file (default: "./codemod-adapter.ts"). */
  outputPath?: string;
  /** Parser to use (default: "tsx"). */
  parser?: PrepassParserName;
  /** If true, only print summary without writing the adapter file. */
  dryRun?: boolean;
}

export interface InitResult {
  /** Detected patterns summary. */
  patterns: ScannedPatterns;
  /** The generated adapter TypeScript source code. */
  adapterSource: string;
  /** Human-readable summary of detected patterns. */
  summary: string;
  /** Path where the adapter file was written (undefined if dryRun). */
  outputPath?: string;
}

/* ── Public API ───────────────────────────────────────────────────────── */

export async function runInit(options: InitOptions): Promise<InitResult> {
  const filePatterns = Array.isArray(options.files) ? options.files : [options.files];
  const outputPath = resolve(options.outputPath ?? "./codemod-adapter.ts");
  const parserName = options.parser ?? "tsx";

  // Resolve glob patterns to absolute file paths
  const cwd = process.cwd();
  const files: string[] = [];
  for (const pattern of filePatterns) {
    for await (const file of glob(pattern, { cwd })) {
      files.push(resolve(file));
    }
  }

  if (files.length === 0) {
    throw new Error(
      `No files matched the pattern(s): ${filePatterns.join(", ")}\nCheck your glob pattern and try again.`,
    );
  }

  // Scan files for styled-components patterns
  const patterns = scanPatterns(files, parserName);
  const adapterSource = generateAdapterStub(patterns);
  const summary = generateSummary(patterns);

  let writtenPath: string | undefined;
  if (!options.dryRun) {
    writeFileSync(outputPath, adapterSource, "utf-8");
    writtenPath = outputPath;
  }

  return {
    patterns,
    adapterSource,
    summary,
    outputPath: writtenPath,
  };
}
