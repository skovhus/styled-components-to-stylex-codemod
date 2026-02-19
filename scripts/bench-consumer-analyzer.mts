/* eslint-disable no-console */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { ResolverFactory } from "oxc-resolver";

function shellQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

const searchDirs = ["test-cases/"];
const globs = "--glob '*.tsx' --glob '*.ts' --glob '*.jsx'";

function rg(pattern: string): string[] {
  try {
    const cmd = `rg ${shellQuote(pattern)} --no-heading ${globs} ${searchDirs.map(shellQuote).join(" ")}`;
    return execSync(cmd, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

console.log("=== Phase breakdown ===\n");

// Phase 1: rg calls
let t0 = performance.now();
const asLines = rg(String.raw`<[A-Z]\w+\b[^>]*\bas[={]`);
let t1 = performance.now();
console.log(`rg as-prop:      ${(t1 - t0).toFixed(1)}ms  (${asLines.length} matches)`);

t0 = performance.now();
const styledLines = rg(String.raw`styled\([A-Z][A-Za-z0-9]+`);
t1 = performance.now();
console.log(`rg styled():     ${(t1 - t0).toFixed(1)}ms  (${styledLines.length} matches)`);

const names = [
  ...new Set(
    asLines.map((l) => l.match(/<([A-Z][A-Za-z0-9]*)\b/)?.[1]).filter((n): n is string => !!n),
  ),
];

t0 = performance.now();
const defLines = rg(String.raw`const (${names.join("|")})\b.*=\s*styled[.(]`);
t1 = performance.now();
console.log(`rg definitions:  ${(t1 - t0).toFixed(1)}ms  (${defLines.length} matches)`);

// Phase 2: Resolver creation
t0 = performance.now();
const factory = new ResolverFactory({
  extensions: [".tsx", ".ts", ".jsx", ".js"],
  conditionNames: ["import", "types"],
  mainFields: ["module", "main"],
  tsconfig: { configFile: path.resolve("tsconfig.json") },
});
t1 = performance.now();
console.log(`ResolverFactory:  ${(t1 - t0).toFixed(1)}ms`);

// Phase 3: File reads + import resolution
const fileCache = new Map<string, string>();
function readCached(f: string): string {
  let c = fileCache.get(f);
  if (c === undefined) {
    c = readFileSync(f, "utf-8");
    fileCache.set(f, c);
  }
  return c;
}
function resolve(spec: string, from: string): string | null {
  const r = factory.sync(path.resolve(path.dirname(from)), spec);
  if (r.error || !r.path) {
    return null;
  }
  return path.relative(process.cwd(), r.path);
}

t0 = performance.now();
let resolveCount = 0;
for (const line of styledLines) {
  const file = line.split(":")[0] ?? "";
  const m = line.match(/styled\(([A-Z][A-Za-z0-9]+)/);
  if (!m?.[1]) {
    continue;
  }
  const name = m[1];
  const src = readCached(file);
  const namedRe = new RegExp(
    String.raw`import\s+\{[^}]*\b${name}\b[^}]*\}\s+from\s+["']([^"']+)["']`,
  );
  const namedMatch = src.match(namedRe);
  if (namedMatch?.[1]) {
    resolve(namedMatch[1], file);
    resolveCount++;
  }
}
t1 = performance.now();
console.log(
  `resolve imports:  ${(t1 - t0).toFixed(1)}ms  (${resolveCount} resolutions, ${fileCache.size} files cached)`,
);

// Phase 4: Full function
console.log("\n=== Full function ===\n");
const { createExternalInterface } = await import("../src/consumer-analyzer.ts");

// Warmup
createExternalInterface({ searchDirs: ["test-cases/"] });

const times: number[] = [];
for (let i = 0; i < 10; i++) {
  t0 = performance.now();
  createExternalInterface({ searchDirs: ["test-cases/"] });
  t1 = performance.now();
  times.push(t1 - t0);
}
console.log(`10 runs: ${times.map((t) => t.toFixed(0) + "ms").join(", ")}`);
console.log(`avg: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms`);
console.log(`min: ${Math.min(...times).toFixed(1)}ms  max: ${Math.max(...times).toFixed(1)}ms`);
