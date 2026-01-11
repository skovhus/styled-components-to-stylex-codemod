import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import { format } from "oxfmt";

import transform from "../dist/transform.mjs";
import { defineAdapter } from "../dist/index.mjs";
import { fixtureAdapterConfig } from "../src/__tests__/fixture-adapter-config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const testCasesDir = join(repoRoot, "test-cases");

const fixtureAdapter = defineAdapter(fixtureAdapterConfig as any);

async function normalizeCode(code: string) {
  const { code: formatted } = await format("test.tsx", code);
  // Remove extra blank line before return statements in tiny wrapper components:
  //   const { ... } = props;
  //
  //   return (...)
  const cleaned = formatted.replace(
    /\n(\s*(?:const|let|var)\s+[^\n]+;\n)\n(\s*return\b)/g,
    "\n$1$2",
  );
  return cleaned.trimEnd() + "\n";
}

async function listFixtureNames() {
  const files = await readdir(testCasesDir);
  const inputNames = files
    .filter(
      (f) =>
        f.endsWith(".input.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
    )
    .map((f) => f.replace(".input.tsx", ""));
  return inputNames.sort();
}

async function updateFixture(name: string) {
  const inputPath = join(testCasesDir, `${name}.input.tsx`);
  const outputPath = join(testCasesDir, `${name}.output.tsx`);
  const input = await readFile(inputPath, "utf-8");

  const result = applyTransform(
    transform as any,
    { adapter: fixtureAdapter as any },
    { source: input, path: inputPath },
    { parser: "tsx" },
  );
  const out = result || input;
  await writeFile(outputPath, await normalizeCode(out), "utf-8");
  return outputPath;
}

const args = new Set(process.argv.slice(2));
const only = args.has("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const targetNames = (() => {
  if (only) {
    return only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // Default: update all fixtures that have outputs (excluding unsupported).
  return null;
})();

const names = targetNames ?? (await listFixtureNames());
for (const name of names) {
  // Skip when output file doesn't exist (should only happen for unsupported fixtures).
  const outPath = join(testCasesDir, `${name}.output.tsx`);
  try {
    await readFile(outPath, "utf-8");
  } catch {
    continue;
  }
  await updateFixture(name);
}
