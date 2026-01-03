import { describe, it, expect } from "vitest";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import jscodeshift from "jscodeshift";
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { format } from "oxfmt";
import transform, {
  transformWithWarnings,
  defineHook,
  defaultHook,
  defineVarsHook,
  inlineValuesHook,
} from "./transform.js";
import type { TransformOptions } from "./transform.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test hooks - examples of custom hook usage
const customHook = defineHook({
  resolveValue({ path, defaultValue }) {
    return `customVar('${path}', '${defaultValue ?? ""}')`;
  },
  imports: ["import { customVar } from './custom-theme';"],
});
const testCasesDir = join(__dirname, "..", "test-cases");
const j = jscodeshift.withParser("tsx");

function getTestCases(): string[] {
  const files = readdirSync(testCasesDir);
  // Exclude unsupported fixtures from main test cases
  // Convention: `_unsupported.<case>.input.tsx` has NO output file.
  const inputFiles = files.filter(
    (f) =>
      f.endsWith(".input.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
  );
  const outputFiles = files.filter(
    (f) =>
      f.endsWith(".output.tsx") && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
  );

  const inputNames = new Set(inputFiles.map((f) => f.replace(".input.tsx", "")));
  const outputNames = new Set(outputFiles.map((f) => f.replace(".output.tsx", "")));

  // Check for mismatched files
  for (const name of inputNames) {
    if (!outputNames.has(name)) {
      throw new Error(`Missing output file for test case: ${name}`);
    }
  }
  for (const name of outputNames) {
    if (!inputNames.has(name)) {
      throw new Error(`Missing input file for test case: ${name}`);
    }
  }

  return [...inputNames];
}

function readTestCase(name: string): {
  input: string;
  output: string;
  inputPath: string;
  outputPath: string;
} {
  const inputPath = join(testCasesDir, `${name}.input.tsx`);
  const outputPath = join(testCasesDir, `${name}.output.tsx`);

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!existsSync(outputPath)) {
    throw new Error(`Output file not found: ${outputPath}`);
  }

  const input = readFileSync(inputPath, "utf-8");
  const output = readFileSync(outputPath, "utf-8");
  return { input, output, inputPath, outputPath };
}

function runTransform(source: string, options: TransformOptions = {}): string {
  const opts = { hook: defaultHook, ...options };
  const result = applyTransform(transform, opts, { source, path: "test.tsx" }, { parser: "tsx" });
  // applyTransform returns empty string when no changes, return original source
  return result || source;
}

/**
 * Normalize code for comparison using oxfmt formatter
 */
async function normalizeCode(code: string): Promise<string> {
  const { code: formatted } = await format("test.tsx", code);
  return formatted;
}

function lintCode(code: string, name: string): void {
  const tempFile = join(testCasesDir, `_temp_${name}.tsx`);
  try {
    writeFileSync(tempFile, code);
    execSync(`pnpm oxlint "${tempFile}"`, { encoding: "utf-8", stdio: "pipe" });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    throw new Error(`Lint errors in transformed output:\n${err.stdout ?? err.stderr ?? ""}`);
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
}

function assertExportsApp(source: string, fileLabel: string): void {
  const root = j(source);
  const hasExportedApp =
    root
      .find(j.ExportNamedDeclaration)
      .filter((p) => {
        const decl = p.node.declaration;
        if (decl?.type === "FunctionDeclaration") {
          return decl.id?.name === "App";
        }
        if (decl?.type === "VariableDeclaration") {
          return decl.declarations.some(
            (d) => "id" in d && d.id.type === "Identifier" && d.id.name === "App",
          );
        }
        // export { App } (or export { App as Something })
        const specs = p.node.specifiers ?? [];
        return specs.some((s) => {
          if (s.type !== "ExportSpecifier") return false;
          const exported = s.exported;
          if (exported.type === "Identifier") {
            return exported.name === "App";
          }
          // Handle Literal type for string exports
          if ("value" in exported && typeof exported.value === "string") {
            return exported.value === "App";
          }
          return false;
        });
      })
      .size() > 0;

  if (!hasExportedApp) {
    throw new Error(
      `${fileLabel} must export a named App component (required by Storybook auto-discovery).`,
    );
  }
}

type ExpectedWarning = { feature: string; type?: string };

function readExpectedWarningsFromComments(source: string): ExpectedWarning[] | null {
  // Convention (place near top of fixture):
  //   // expected-warnings: createGlobalStyle, component-selector
  // Can appear multiple times; values are merged.
  const features = new Set<string>();
  const lines = source.split(/\r?\n/);
  // Only scan the header-ish region to avoid false positives in code samples.
  const maxLines = Math.min(lines.length, 30);
  for (let i = 0; i < maxLines; i++) {
    const line = lines[i]!;
    const match = line.match(/^\s*\/\/\s*expected-warnings\s*:\s*(.+?)\s*$/);
    if (!match) continue;
    const raw = match[1] ?? "";
    for (const part of raw.split(",")) {
      const feature = part.trim();
      if (feature) features.add(feature);
    }
  }
  if (features.size === 0) return null;
  return [...features].map((feature) => ({
    feature,
    type: "unsupported-feature",
  }));
}

describe("test case file pairing", () => {
  it("should have matching input/output files for all test cases", () => {
    // This test verifies the test case structure is valid
    // getTestCases() throws if there are mismatched files
    const testCases = getTestCases();
    expect(testCases.length).toBeGreaterThan(0);
  });
});

describe("test case exports", () => {
  const testCases = getTestCases();

  it.each(testCases)("%s should export App in both input and output", (name) => {
    const { input, output } = readTestCase(name);
    assertExportsApp(input, `${name}.input.tsx`);
    assertExportsApp(output, `${name}.output.tsx`);
  });
});

describe("output invariants", () => {
  const testCases = getTestCases();

  it.each(testCases)("%s output should not import styled-components", (name) => {
    const { output } = readTestCase(name);
    expect(output).not.toMatch(/from\s+['"]styled-components['"]/);
  });
});

describe("output file linting", () => {
  const testCases = getTestCases();

  it.each(testCases)("%s output should pass linting", (name) => {
    const { output } = readTestCase(name);
    // Output fixtures are `.ts` but contain JSX; lint via a `.tsx` temp file.
    lintCode(output, `${name}_output`);
  });
});

describe("fixture warning expectations", () => {
  const testCases = getTestCases();

  it.each(testCases)("%s warnings should match expectations (if provided)", (name) => {
    const { input } = readTestCase(name);
    const expected = readExpectedWarningsFromComments(input);

    const result = transformWithWarnings(
      { source: input, path: `${name}.input.tsx` },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { hook: defaultHook },
    );

    // Fixture expectations only cover stable `unsupported-feature` warnings.
    // Dynamic-node warnings are runtime/bail diagnostics and are not asserted via fixtures.
    const actualFeatures = [
      ...new Set(
        result.warnings.filter((w) => w.type === "unsupported-feature").map((w) => w.feature),
      ),
    ].sort();

    if (!expected) {
      expect(actualFeatures).toEqual([]);
      return;
    }

    const expectedFeatures = expected.map((w) => w.feature).sort();
    expect(actualFeatures).toEqual(expectedFeatures);
  });
});

// All test cases must be fully transformed:
// - Transform must produce a change (no bail/unchanged allowed)
// - Result must not import styled-components
// - Result must pass linting
// - Result must match the expected output fixture
describe("transform", () => {
  const testCases = getTestCases();

  it.each(testCases)("%s", async (name) => {
    const { input, output } = readTestCase(name);
    const result = runTransform(input);

    // Transform must produce a change - no bailing allowed
    expect(await normalizeCode(result)).not.toEqual(await normalizeCode(input));

    // Result must not import styled-components
    expect(result).not.toMatch(/from\s+['"]styled-components['"]/);

    // Result must pass linting
    lintCode(result, name);

    // Compare against expected output fixture
    expect(await normalizeCode(result)).toEqual(await normalizeCode(output));
  });
});

describe("transform warnings", () => {
  it("should warn when createGlobalStyle is used", () => {
    const source = `
import styled, { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle\`
  body {
    margin: 0;
    padding: 0;
  }
\`;

export const App = () => (
  <>
    <GlobalStyle />
    <div>Hello</div>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: defaultHook },
    );

    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning).toMatchObject({
      type: "unsupported-feature",
      feature: "createGlobalStyle",
    });
    expect(warning.message).toContain("createGlobalStyle is not supported in StyleX");
  });

  it("should not warn when createGlobalStyle is not used", () => {
    const source = `
import styled from 'styled-components';

const Button = styled.button\`
  color: blue;
\`;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: defaultHook },
    );

    expect(result.warnings).toHaveLength(0);
  });
});

describe("hook configuration", () => {
  const themeSource = `
import styled from 'styled-components';

const Button = styled.button\`
  color: \${props => props.theme.colors.primary};
\`;

export const App = () => <Button>Click</Button>;
`;

  it("should accept defaultHook", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: defaultHook },
    );

    // Transform runs without error
    expect(result.warnings).toHaveLength(0);
  });

  it("should accept defineVarsHook", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: defineVarsHook },
    );

    expect(result.warnings).toHaveLength(0);
  });

  it("should accept inlineValuesHook", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: inlineValuesHook },
    );

    expect(result.warnings).toHaveLength(0);
  });

  it("should accept custom hook", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: customHook },
    );

    expect(result.warnings).toHaveLength(0);
  });

  it("should use defaultHook when no hook specified", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      {},
    );

    // Should run without error using default hook
    expect(result.warnings).toHaveLength(0);
  });

  it("should accept defineVarsHook", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { hook: defineVarsHook },
    );

    expect(result.warnings).toHaveLength(0);
  });
});
