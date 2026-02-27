import { applyTransform } from "jscodeshift/src/testUtils.js";
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Allow Node to run `src/*.ts` directly even though source uses `.js` specifiers.
register(new URL("./src-ts-specifier-loader.mjs", import.meta.url).href, pathToFileURL(".."));

const { default: transform } = await import("../src/transform.ts");

// Import the fixtureAdapter from the test utilities
import { fixtureAdapter } from "../src/__tests__/fixture-adapters.ts";

// Get test case names from command line or use defaults
const defaultTestCases = [
  "attrs",
  "as-prop",
  "duplicate-type-identifier",
  "removed-export",
  "static-properties",
];

const testCases = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTestCases;

const projectRoot = join(import.meta.dirname, "..");
const testCasesDir = join(projectRoot, "test-cases");

/**
 * Test cases whose imported components are known to be StyleX-backed.
 * Must match the mapping in regenerate-test-case-outputs.mts and transform.test.ts.
 */
const SX_BACKED_IMPORT_MAP: Record<string, string[]> = {
  "wrapper-sxProp": ["StyleXButton"],
};

for (const name of testCases) {
  const inputPath = join(testCasesDir, `${name}.input.tsx`);
  const input = readFileSync(inputPath, "utf8");

  const sxBackedImports = new Map<string, Set<string>>();
  const sxBacked = SX_BACKED_IMPORT_MAP[name];
  if (sxBacked) {
    const { resolve: pathResolve } = await import("node:path");
    sxBackedImports.set(pathResolve(inputPath), new Set(sxBacked));
  }

  const crossFilePrepassResult = {
    selectorUsages: new Map(),
    componentsNeedingGlobalSelectorBridge: new Map(),
    sxBackedImports,
  };

  const result = applyTransform(
    transform,
    { adapter: fixtureAdapter, crossFilePrepassResult },
    { source: input, path: inputPath },
    { parser: "tsx" },
  );
  writeFileSync(join(testCasesDir, `${name}.actual.tsx`), result);

  // oxlint-disable-next-line no-console
  console.log(`Wrote ${name}.actual.tsx`);
}
