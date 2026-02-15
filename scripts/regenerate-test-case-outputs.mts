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

const [{ default: transform }, { fixtureAdapter, appLikeAdapter }] = await Promise.all([
  import("../src/transform.ts"),
  import("../src/__tests__/fixture-adapters.ts"),
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const testCasesDir = join(repoRoot, "test-cases");

// Test cases that use the app-like adapter (styleMerger: null) to reproduce
// real-world TS errors with the verbose className/style merging pattern.
const APP_LIKE_ADAPTER_FIXTURES = new Set([
  "bug-data-style-src-not-accepted",
  "bug-data-style-src-incompatible-component",
  "bug-external-styles-missing-classname",
]);

function selectAdapter(name: string) {
  return APP_LIKE_ADAPTER_FIXTURES.has(name) ? appLikeAdapter : fixtureAdapter;
}

async function normalizeCode(code: string, ext: string) {
  const { code: formatted } = await format(`test.${ext}`, code);
  return formatted.trimEnd() + "\n";
}

function parseFixtureName(filename: string): { name: string; ext: string } | null {
  // Match patterns like "foo.input.tsx", "foo.flow.input.jsx"
  const match = filename.match(/^(.+)\.input\.(tsx|jsx)$/);
  if (!match) {
    return null;
  }
  return { name: match[1], ext: match[2] };
}

async function listFixtureNames(): Promise<Array<{ name: string; ext: string }>> {
  const files = await readdir(testCasesDir);
  return files
    .filter((f) => !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"))
    .map(parseFixtureName)
    .filter((x): x is { name: string; ext: string } => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function updateFixture(name: string, ext: string) {
  const inputPath = join(testCasesDir, `${name}.input.${ext}`);
  const outputPath = join(testCasesDir, `${name}.output.${ext}`);
  const input = await readFile(inputPath, "utf-8");

  // Determine parser based on filename pattern
  const parser = name.includes(".flow") ? "flow" : ext === "jsx" ? "babel" : "tsx";

  // Select adapter: appLikeAdapter (styleMerger: null, externalInterface
  // returns { styles: true }) mimics a real-world app config to reproduce
  // TS errors from the verbose className merging pattern.
  const adapter = selectAdapter(name);
  const result = applyTransform(
    transform,
    { adapter },
    { source: input, path: inputPath },
    { parser },
  );
  const out = result || input;
  await writeFile(outputPath, await normalizeCode(out, ext), "utf-8");
  return outputPath;
}

const args = new Set(process.argv.slice(2));
const only = args.has("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const allFixtures = await listFixtureNames();

const targetFixtures = (() => {
  if (only) {
    const names = only
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return allFixtures.filter((f) => names.some((n) => f.name === n || f.name.startsWith(n)));
  }
  // Default: update all fixtures that have outputs (excluding unsupported).
  return allFixtures;
})();

for (const { name, ext } of targetFixtures) {
  await updateFixture(name, ext);
}
