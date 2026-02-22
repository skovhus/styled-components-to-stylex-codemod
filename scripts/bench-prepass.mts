/* eslint-disable no-console */
/**
 * Benchmark script for prepass functions against linear-app-v2.
 *
 * Measures:
 * 1. runPrepass (unified) — timing + saves consumer analysis result to JSON
 * 2. scanCrossFileSelectors (standalone) — timing for comparison
 *
 * Usage: node scripts/bench-prepass.mts
 */
import { register } from "node:module";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { pathToFileURL } from "node:url";

register(new URL("./src-ts-specifier-loader.mjs", import.meta.url).href, pathToFileURL(".."));

const LINEAR_ROOT = "/Users/kenneth/work/git/linear-app-v2";
const PATTERNS = [
  `${LINEAR_ROOT}/web/src/**/*.tsx`,
  `${LINEAR_ROOT}/web/src/**/*.ts`,
  `${LINEAR_ROOT}/client/src/**/*.tsx`,
  `${LINEAR_ROOT}/client/src/**/*.ts`,
  `${LINEAR_ROOT}/common/src/**/*.tsx`,
  `${LINEAR_ROOT}/common/src/**/*.ts`,
  `${LINEAR_ROOT}/editor/src/**/*.tsx`,
  `${LINEAR_ROOT}/editor/src/**/*.ts`,
  `${LINEAR_ROOT}/orbiter/src/**/*.tsx`,
  `${LINEAR_ROOT}/orbiter/src/**/*.ts`,
  `${LINEAR_ROOT}/app-front/src/**/*.tsx`,
  `${LINEAR_ROOT}/app-front/src/**/*.ts`,
  `${LINEAR_ROOT}/app-figma/**/*.tsx`,
  `${LINEAR_ROOT}/app-figma/**/*.ts`,
  `${LINEAR_ROOT}/app-zendesk/src/**/*.tsx`,
  `${LINEAR_ROOT}/app-zendesk/src/**/*.ts`,
];

async function main() {
  // Dynamic imports to let the loader hook resolve .ts files
  const { createModuleResolver } = await import("../src/internal/prepass/resolve-imports.js");
  const { runPrepass } = await import("../src/internal/prepass/run-prepass.js");
  const { scanCrossFileSelectors } =
    await import("../src/internal/prepass/scan-cross-file-selectors.js");

  // Resolve all file paths
  console.log("Resolving file paths from glob patterns...");
  const filePaths: string[] = [];
  for (const pattern of PATTERNS) {
    for await (const file of glob(pattern)) {
      filePaths.push(resolve(file));
    }
  }
  const uniqueFiles = [...new Set(filePaths)];
  console.log(`  Found ${uniqueFiles.length} files\n`);

  // Create shared resolver
  const resolver = createModuleResolver();

  // Warmup
  console.log("Warming up resolver...");
  resolver.resolve(uniqueFiles[0]!, "./foo");

  const RUNS = 3;

  // --- Benchmark unified runPrepass ---
  console.log(`\n=== runPrepass unified (${RUNS} runs) ===`);
  const unifiedTimes: number[] = [];
  let prepassResult: Awaited<ReturnType<typeof runPrepass>> | undefined;
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    prepassResult = await runPrepass({
      filesToTransform: uniqueFiles,
      consumerPaths: [],
      resolver,
      parserName: "tsx",
      createExternalInterface: true,
    });
    const elapsed = performance.now() - start;
    unifiedTimes.push(elapsed);
    const acSize = prepassResult.consumerAnalysis?.size ?? 0;
    const scSize = prepassResult.crossFileInfo.selectorUsages.size;
    console.log(
      `  Run ${i + 1}: ${elapsed.toFixed(1)}ms (${acSize} consumer entries, ${scSize} selector files)`,
    );
  }
  const unifiedAvg = unifiedTimes.reduce((a, b) => a + b, 0) / unifiedTimes.length;
  console.log(`  Average: ${unifiedAvg.toFixed(1)}ms`);

  // Save consumer analysis result for comparison
  if (prepassResult?.consumerAnalysis) {
    const sorted = [...prepassResult.consumerAnalysis.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({ key, ...val }));
    const outPath = resolve("scripts/bench-prepass-ac-result.json");
    writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");
    console.log(`  Consumer analysis result saved to ${outPath}`);

    const withStyles = sorted.filter((e) => e.styles).length;
    const withAs = sorted.filter((e) => e.as).length;
    console.log(`  Entries: ${sorted.length} total, ${withStyles} styles=true, ${withAs} as=true`);
  }

  // Cross-file selector summary
  if (prepassResult) {
    const sc = prepassResult.crossFileInfo;
    console.log(`  Selector usages: ${sc.selectorUsages.size} consumer files`);
    let totalUsages = 0;
    for (const usages of sc.selectorUsages.values()) {
      totalUsages += usages.length;
    }
    console.log(`  Total usages: ${totalUsages}`);
    console.log(`  Style acceptance targets: ${sc.componentsNeedingStyleAcceptance.size} files`);
    console.log(`  Bridge targets: ${sc.componentsNeedingBridge.size} files`);
  }

  // --- Benchmark standalone scanCrossFileSelectors for comparison ---
  console.log(`\n=== scanCrossFileSelectors standalone (${RUNS} runs) ===`);
  const scTimes: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    scanCrossFileSelectors(uniqueFiles, [], resolver, "tsx");
    const elapsed = performance.now() - start;
    scTimes.push(elapsed);
    console.log(`  Run ${i + 1}: ${elapsed.toFixed(1)}ms`);
  }
  const scAvg = scTimes.reduce((a, b) => a + b, 0) / scTimes.length;
  console.log(`  Average: ${scAvg.toFixed(1)}ms`);

  // --- Summary ---
  console.log(`\n=== Summary ===`);
  console.log(`  Unified prepass: ${unifiedAvg.toFixed(1)}ms`);
  console.log(`  Standalone scanCrossFileSelectors: ${scAvg.toFixed(1)}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
