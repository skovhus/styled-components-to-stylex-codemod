import { applyTransform } from "jscodeshift/src/testUtils.js";
import { readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Allow Node to run `src/*.ts` directly even though source uses `.js` specifiers.
register(new URL("./src-ts-specifier-loader.mjs", import.meta.url).href, pathToFileURL(".."));

const { default: transform } = await import("../src/transform.ts");

// Minimal fixture adapter that returns false for shouldSupportExternalStyling
// (matching the behavior of fixtureAdapter for most test cases)
const fixtureAdapter = {
  styleMerger: null,
  shouldSupportExternalStyling(ctx) {
    return (
      ctx.filePath.includes("external-styles-support") && ctx.componentName === "ExportedButton"
    );
  },
  resolveValue(_ctx) {
    return null;
  },
};

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

for (const name of testCases) {
  const inputPath = join(testCasesDir, `${name}.input.tsx`);
  const input = readFileSync(inputPath, "utf8");
  const result = applyTransform(
    transform,
    { adapter: fixtureAdapter },
    { source: input, path: inputPath },
    { parser: "tsx" },
  );
  writeFileSync(join(testCasesDir, `${name}.actual.tsx`), result);

  // oxlint-disable-next-line no-console
  console.log(`Wrote ${name}.actual.tsx`);
}
