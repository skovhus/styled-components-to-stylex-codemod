/**
 * Regenerates StyleX output fixtures from `test-cases/*.input.tsx`.
 *
 * Usage:
 *   node scripts/regenerate-test-case-outputs.mts
 *     Regenerates all supported fixtures (skips _unsupported.* and unsupported-*)
 *
 *   node scripts/regenerate-test-case-outputs.mts --only attrs
 *     Regenerates a single fixture by name (no extension)
 *
 *   node scripts/regenerate-test-case-outputs.mts --only attrs,css-helper
 *     Regenerates multiple fixtures by comma-separated names
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { register } from "node:module";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import { format } from "oxfmt";

// Allow Node to run `src/*.ts` directly even though source uses `.js` specifiers.
// We register a tiny resolver hook, then dynamically import the TS sources.
register(new URL("./src-ts-specifier-loader.mjs", import.meta.url).href, pathToFileURL(".."));

const [{ default: transform }, { fixtureAdapter }] = await Promise.all([
  import("../src/transform.ts"),
  import("../src/__tests__/fixture-adapters.ts"),
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const testCasesDir = join(repoRoot, "test-cases");

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
