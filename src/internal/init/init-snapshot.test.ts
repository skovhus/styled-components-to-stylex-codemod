import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { scanPatterns } from "./scan-patterns.js";
import { generateAdapterStub, generateSummary } from "./generate-adapter-stub.js";

const TEST_CASES_DIR = resolve(import.meta.dirname, "../../../test-cases");

describe("init against test-cases", () => {
  const inputFiles = readdirSync(TEST_CASES_DIR)
    .filter((f) => f.endsWith(".input.tsx"))
    .map((f) => resolve(TEST_CASES_DIR, f));

  // Scan once, snapshot all three outputs
  const patterns = scanPatterns(inputFiles);

  it("scanned patterns snapshot", () => {
    expect({
      filesScanned: patterns.filesScanned,
      filesWithStyledComponents: patterns.filesWithStyledComponents,
      themePaths: [...patterns.themePaths].sort(),
      themeRoots: [...patterns.themeRoots].sort(),
      hasIndexedThemeLookup: patterns.hasIndexedThemeLookup,
      cssVariables: [...patterns.cssVariables].sort(),
      helperCalls: Object.fromEntries(
        [...patterns.helperCalls.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
      selectorInterpolations: Object.fromEntries(
        [...patterns.selectorInterpolations.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
      styledWrappers: Object.fromEntries(
        [...patterns.styledWrappers.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      ),
      hasUseTheme: patterns.hasUseTheme,
    }).toMatchSnapshot();
  });

  it("generated adapter stub snapshot", () => {
    expect(generateAdapterStub(patterns)).toMatchSnapshot();
  });

  it("generated summary snapshot", () => {
    expect(generateSummary(patterns)).toMatchSnapshot();
  });
});
