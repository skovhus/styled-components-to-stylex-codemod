import { describe, it, expect, vi } from "vitest";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import jscodeshift from "jscodeshift";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import transform, { transformWithWarnings } from "../transform.js";
import type { TransformOptions } from "../transform.js";
import { customAdapter, fixtureAdapter, appLikeAdapter } from "./fixture-adapters.js";
import type { Adapter, ResolveValueContext } from "../adapter.js";

// Suppress codemod logs in tests
vi.mock("../internal/logger.js", () => ({
  Logger: {
    warn: vi.fn(),
    error: vi.fn(),
    logWarnings: vi.fn(),
  },
}));

const __dirname = dirname(fileURLToPath(import.meta.url));

const testCasesDir = join(__dirname, "..", "..", "test-cases");
const j = jscodeshift.withParser("tsx");

type FixtureCase = {
  name: string;
  inputPath: string;
  outputPath: string;
  inputFile: string;
  outputFile: string;
  parser: "tsx" | "babel" | "flow";
};

// Supported file extensions and their parsers
const FIXTURE_EXTENSIONS: {
  inputSuffix: string;
  outputSuffix: string;
  parser: FixtureCase["parser"];
}[] = [
  { inputSuffix: ".input.tsx", outputSuffix: ".output.tsx", parser: "tsx" },
  { inputSuffix: ".input.jsx", outputSuffix: ".output.jsx", parser: "babel" },
  { inputSuffix: ".flow.input.jsx", outputSuffix: ".flow.output.jsx", parser: "flow" },
];

function getTestCases(): FixtureCase[] {
  const files = readdirSync(testCasesDir);
  const cases: FixtureCase[] = [];

  for (const { inputSuffix, outputSuffix, parser } of FIXTURE_EXTENSIONS) {
    // Exclude unsupported fixtures from main test cases
    // Convention: `_unsupported.<case>.input.*` has NO output file.
    const inputFiles = files.filter(
      (f) =>
        f.endsWith(inputSuffix) && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
    );
    const outputFiles = files.filter(
      (f) =>
        f.endsWith(outputSuffix) && !f.startsWith("_unsupported.") && !f.startsWith("unsupported-"),
    );

    const inputNames = new Set(inputFiles.map((f) => f.replace(inputSuffix, "")));
    const outputNames = new Set(outputFiles.map((f) => f.replace(outputSuffix, "")));

    // Check for mismatched files
    for (const name of inputNames) {
      if (!outputNames.has(name)) {
        throw new Error(`Missing output file for test case: ${name}${outputSuffix}`);
      }
    }
    for (const name of outputNames) {
      if (!inputNames.has(name)) {
        throw new Error(`Missing input file for test case: ${name}${inputSuffix}`);
      }
    }

    for (const name of inputNames) {
      cases.push({
        name,
        inputPath: join(testCasesDir, `${name}${inputSuffix}`),
        outputPath: join(testCasesDir, `${name}${outputSuffix}`),
        inputFile: `${name}${inputSuffix}`,
        outputFile: `${name}${outputSuffix}`,
        parser,
      });
    }
  }

  return cases;
}

const fixtureCases: FixtureCase[] = getTestCases();
const unsupportedInputs = readdirSync(testCasesDir)
  .filter((f) => f.startsWith("_unsupported.") && f.endsWith(".input.tsx"))
  .sort();

function readTestCase(
  name: string,
  inputPath?: string,
  outputPath?: string,
): {
  input: string;
  output: string;
  inputPath: string;
  outputPath: string;
} {
  // Default to .tsx extension for backwards compatibility
  const resolvedInputPath = inputPath ?? join(testCasesDir, `${name}.input.tsx`);
  const resolvedOutputPath = outputPath ?? join(testCasesDir, `${name}.output.tsx`);

  if (!existsSync(resolvedInputPath)) {
    throw new Error(`Input file not found: ${resolvedInputPath}`);
  }
  if (!existsSync(resolvedOutputPath)) {
    throw new Error(`Output file not found: ${resolvedOutputPath}`);
  }

  const input = readFileSync(resolvedInputPath, "utf-8");
  const output = readFileSync(resolvedOutputPath, "utf-8");
  return { input, output, inputPath: resolvedInputPath, outputPath: resolvedOutputPath };
}

function getExpectedWarningType(source: string, filePath: string): string {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const match = firstLine.match(/^\/\/\s*@expected-warning:\s*(.+)\s*$/);
  if (!match) {
    throw new Error(`Missing expected warning annotation in ${filePath}`);
  }
  const expected = match[1];
  if (!expected) {
    throw new Error(`Empty expected warning annotation in ${filePath}`);
  }
  return expected;
}

type TestTransformOptions = Partial<Omit<TransformOptions, "adapter">> & {
  adapter?: TransformOptions["adapter"];
};

// Test cases that use the app-like adapter (styleMerger: null) to reproduce
// real-world TS errors with the verbose className/style merging pattern.
const APP_LIKE_ADAPTER_FIXTURES = new Set([
  "bug-data-style-src-not-accepted",
  "bug-data-style-src-incompatible-component",
  "bug-external-styles-missing-classname",
]);

/** Select the adapter based on the fixture name. */
function adapterForFixture(filePath: string): TransformOptions["adapter"] {
  const base = filePath.replace(/^.*[\\/]/, "").replace(/\.input\.\w+$/, "");
  return APP_LIKE_ADAPTER_FIXTURES.has(base) ? appLikeAdapter : fixtureAdapter;
}

function runTransform(
  source: string,
  options: TestTransformOptions = {},
  filePath: string = "test.tsx",
  parser: "tsx" | "babel" | "flow" = "tsx",
): string {
  const opts: TransformOptions = {
    adapter: adapterForFixture(filePath),
    ...options,
  };
  const result = applyTransform(transform, opts, { source, path: filePath }, { parser });
  // applyTransform returns empty string when no changes, return original source
  return result || source;
}

/**
 * Like runTransform, but returns warnings too for better error diagnosis.
 * Use this when you need to debug why a transform failed.
 */
function runTransformWithDiagnostics(
  source: string,
  options: TestTransformOptions = {},
  filePath: string = "test.tsx",
  parser: "tsx" | "babel" | "flow" = "tsx",
): { code: string | null; warnings: ReturnType<typeof transformWithWarnings>["warnings"] } {
  const opts: TransformOptions = {
    adapter: adapterForFixture(filePath),
    ...options,
  };
  const jWithParser = jscodeshift.withParser(parser);
  const result = transformWithWarnings(
    { source, path: filePath },
    { jscodeshift: jWithParser, j: jWithParser, stats: () => {}, report: () => {} },
    opts,
  );
  return result;
}

/**
 * Normalize code for comparison using oxfmt formatter
 */
async function normalizeCode(code: string, filePath: string = "test.tsx"): Promise<string> {
  const { code: formatted } = await format(filePath, code);
  return formatted;
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
          if (s.type !== "ExportSpecifier") {
            return false;
          }
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

describe("test case file pairing", () => {
  it("should have matching input/output files for all test cases", () => {
    // This test verifies the test case structure is valid
    // getTestCases() throws if there are mismatched files
    expect(fixtureCases.length).toBeGreaterThan(0);
  });

  it("supported test cases should not have @expected-warning annotation", () => {
    // @expected-warning is only for _unsupported fixtures that are expected to bail
    // Supported test cases should transform successfully without warnings
    for (const { inputPath, inputFile } of fixtureCases) {
      const content = readFileSync(inputPath, "utf-8");
      const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
      const hasExpectedWarning = /^\/\/\s*@expected-warning:/.test(firstLine);
      expect(hasExpectedWarning, `${inputFile} should not have @expected-warning annotation`).toBe(
        false,
      );
    }
  });
});

describe("_unsupported fixtures", () => {
  it.each(unsupportedInputs)("%s should bail out", (unsupportedInput) => {
    const inputPath = join(testCasesDir, unsupportedInput);
    const input = readFileSync(inputPath, "utf-8");
    const expectedWarning = getExpectedWarningType(input, inputPath);
    const result = transformWithWarnings(
      { source: input, path: inputPath },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(expectedWarning);
  });
});

describe("test case exports", () => {
  it.each(fixtureCases)(
    "$outputFile should export App in both input and output",
    ({ inputPath, outputPath, inputFile, outputFile }) => {
      const { input, output } = readTestCase("", inputPath, outputPath);
      assertExportsApp(input, inputFile);
      assertExportsApp(output, outputFile);
    },
  );
});

describe("output invariants", () => {
  it.each(fixtureCases)(
    "$outputFile should not import styled/css/keyframes from styled-components",
    ({ inputPath, outputPath }) => {
      const { output } = readTestCase("", inputPath, outputPath);
      // Allow imports of useTheme, withTheme, ThemeProvider etc. that aren't transformed
      // But disallow imports of styled, css, keyframes, createGlobalStyle
      const disallowedImports = ["styled", "css", "keyframes", "createGlobalStyle"];
      const importMatch = output.match(
        /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]styled-components['"]/,
      );
      if (importMatch) {
        const namedImports = importMatch[1] || "";
        const defaultImport = importMatch[2] || "";
        const importedNames = [
          defaultImport,
          ...namedImports.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]),
        ].filter(Boolean);
        for (const imp of importedNames) {
          expect(disallowedImports).not.toContain(imp);
        }
      }
    },
  );
});

// All test cases must be fully transformed:
// - Transform must produce a change (no bail/unchanged allowed)
// - Result must not import styled-components
// - Result must match the expected output fixture
describe("transform", () => {
  it.each(fixtureCases)("$outputFile", async ({ name, inputPath, outputPath, parser }) => {
    const { input, output } = readTestCase(name, inputPath, outputPath);
    const diagnostics = runTransformWithDiagnostics(input, {}, inputPath, parser);
    const result = diagnostics.code || input;

    // Transform must produce a change - no bailing allowed
    // If it fails, show any warnings to help diagnose the issue (e.g., adapter not resolving)
    const normalizedResult = await normalizeCode(result, outputPath);
    const normalizedInput = await normalizeCode(input, inputPath);
    if (normalizedResult === normalizedInput) {
      const warningsInfo = diagnostics.warnings.length
        ? `\n\nTransform warnings that may explain the failure:\n${diagnostics.warnings.map((w) => `  - ${w.type}`).join("\n")}`
        : "";
      throw new Error(
        `Transform produced no changes (bailed or returned unchanged code).${warningsInfo}`,
      );
    }

    // Result must not import styled/css/keyframes/createGlobalStyle from styled-components
    // (but useTheme, withTheme, ThemeProvider etc. are allowed)
    const disallowedImports = ["styled", "css", "keyframes", "createGlobalStyle"];
    const importMatch = result.match(
      /import\s+(?:{([^}]+)}|(\w+))\s+from\s+['"]styled-components['"]/,
    );
    if (importMatch) {
      const namedImports = importMatch[1] || "";
      const defaultImport = importMatch[2] || "";
      const importedNames = [
        defaultImport,
        ...namedImports.split(",").map((s) => s.trim().split(/\s+as\s+/)[0]),
      ].filter(Boolean);
      for (const imp of importedNames) {
        expect(disallowedImports).not.toContain(imp);
      }
    }

    // Compare against expected output fixture
    const normalizedExpected = await normalizeCode(output, outputPath);
    expect(normalizedResult).toEqual(normalizedExpected);
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
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning).toMatchObject({
      type: "createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries)",
      severity: "warning",
    });
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
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.warnings).toHaveLength(0);
  });

  it("should warn and skip when universal selectors are used", () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  & * {
    box-sizing: border-box;
  }
\`;

export const App = () => <Box><span /></Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    const warning = result.warnings.find(
      (w) => w.type === "Universal selectors (`*`) are currently unsupported",
    );
    expect(warning).toBeDefined();
    // Line 5 is where `& * {` appears (line 4 is the template start, line 5 has the selector)
    expect(warning?.loc?.line).toBe(5);
  });

  it("should warn with correct line number for universal selector on a later line", () => {
    const source = `
import styled from 'styled-components';

const Container = styled.div\`
  display: flex;
  gap: 16px;

  & > * {
    flex: 1;
  }
\`;

export const App = () => <Container />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    const warning = result.warnings.find(
      (w) => w.type === "Universal selectors (`*`) are currently unsupported",
    );
    expect(warning).toBeDefined();
    // The selector `& > *` appears on a line later in the template.
    // Line 4: template start (`const Container = styled.div\``)
    // The `& > *` selector is 4 lines into the template content (display, gap, empty, & > *)
    // So expected line = 4 + 4 = 8
    // But note: the first line of template content starts on line 5, and `& > *` is on line 8
    expect(warning?.loc?.line).toBe(8);
  });

  it("should warn with correct line number when calc() with * appears before universal selector", () => {
    const source = `
import styled from 'styled-components';

const Container = styled.div\`
  width: calc(100% * 2);
  height: 100px;

  & > * {
    flex: 1;
  }
\`;

export const App = () => <Container />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    const warning = result.warnings.find(
      (w) => w.type === "Universal selectors (`*`) are currently unsupported",
    );
    expect(warning).toBeDefined();
    // Line 4 is the template start (`const Container = styled.div\``)
    // The `& > *` selector is on line 8 (4 lines into template content: width, height, empty, & > *)
    // The `*` in `calc(100% * 2)` on line 5 should NOT be matched as a selector
    expect(warning?.loc?.line).toBe(8);
  });

  it("should bail on unsupported conditional with theme access in test expressions in shouldForwardProp wrappers", () => {
    const source = [
      'import styled from "styled-components";',
      "",
      "const Input = styled.input.withConfig({",
      '  shouldForwardProp: (prop) => prop !== "hasError" && prop !== "other",',
      "})`",
      '  border-color: ${(p) => (p.theme.isDark && p.other ? "red" : "#ccc")};',
      "`;",
      "",
      "export const App = () => (",
      "  <div>",
      "    <Input hasError other />",
      "  </div>",
      ");",
      "",
    ].join("\n");

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    const warning = result.warnings[0]!;
    expect(warning.loc).toBeDefined();
    expect(typeof warning.loc?.line).toBe("number");
    expect(typeof warning.loc?.column).toBe("number");
  });
});

describe("import cleanup safety", () => {
  it("should rewrite standalone css helpers even without styled components", () => {
    const source = `
import styled, { css } from "styled-components";

export function helper() {
  return css\`
    color: red;
  \`;
}

// No styled declarations we currently transform in this snippet.
export const x = 1;
`;
    const result = runTransform(source, {}, "css-import-safety.tsx");
    const expected = `import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

const styles = stylex.create({
  helper: {
    color: "red",
  },
});

export function helper() {
  return styles.helper;
}

// No styled declarations we currently transform in this snippet.
export const x = 1;
`;
    expect(result.trim()).toBe(expected.trim());
  });
});

describe("JS/Flow transforms (no type emits)", () => {
  it("should not emit TypeScript types/annotations when parsing Flow (.jsx)", () => {
    const source = `
// @flow
import styled from "styled-components";

const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => prop !== "foo",
})\`
  color: red;
\`;

export const App = () => <Button foo disabled>Click</Button>;
`;
    const out = applyTransform(
      transform,
      { adapter: fixtureAdapter },
      { source, path: "plain-js-flow.jsx" },
      { parser: "flow" },
    );

    expect(out).toContain("function Button(props)");
    expect(out).not.toMatch(/\bimport\s+type\b/);
    expect(out).not.toMatch(/\btype\s+ButtonProps\b/);
    expect(out).not.toMatch(/props:\s*ButtonProps/);
  });

  it("should not emit TypeScript types/annotations when transforming plain JS (.js)", () => {
    const source = `
import styled from "styled-components";

const Card = styled.div.withConfig({
  shouldForwardProp: (prop) => prop !== "foo",
})\`
  padding: 16px;
\`;

export function App() {
  return <Card foo>Hi</Card>;
}
`;
    const out = applyTransform(
      transform,
      { adapter: fixtureAdapter },
      { source, path: "plain-js.js" },
      { parser: "babel" },
    );

    expect(out).toContain("function Card(props)");
    expect(out).not.toMatch(/\bimport\s+type\b/);
    expect(out).not.toMatch(/\btype\s+CardProps\b/);
    expect(out).not.toMatch(/props:\s*CardProps/);
  });
});

describe("splitVariantsResolvedValue safety", () => {
  it("should not emit empty variant styles when adapter returns an unparseable expression for one branch", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: \${(props) =>
    props.$on ? props.theme.colors.primary : props.theme.colors.secondary};
\`;

export const App = () => <Box $on />;
`;

    const adapterWithBadThemeExpr = {
      externalInterface() {
        return null;
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind !== "theme") {
          return undefined;
        }
        if (ctx.path === "colors.primary") {
          // Intentionally unparseable; lower-rules should warn and skip this declaration without emitting empty variants.
          return { expr: ")", imports: [] };
        }
        if (ctx.path === "colors.secondary") {
          return { expr: '"blue"', imports: [] };
        }
        return undefined;
      },
      resolveCall() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "split-variants-resolved-value-parse-failure.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithBadThemeExpr },
    );

    expect(result.code).toBeNull();
    expect(
      result.warnings.some(
        (w) => w.type === "Adapter resolveCall returned an unparseable styles expression",
      ),
    ).toBe(true);
  });
});

describe("adapter-driven helper resolution", () => {
  it("should bail when a helper call cannot be resolved", () => {
    const source = `
import styled from "styled-components";
import { transitionSpeed } from "./lib/helpers.ts";

const AnimatedPath = styled.path\`
  transition-property: opacity;
  transition-duration: \${transitionSpeed("slowTransition")};
\`;

export const App = () => (
  <svg width="10" height="10">
    <AnimatedPath d="M0 0L10 10" />
  </svg>
);
`;

    const adapterWithoutCallResolution = {
      externalInterface() {
        return null;
      },
      resolveValue(ctx: ResolveValueContext) {
        // Intentionally do not resolve any calls.
        if (ctx.kind === "theme" || ctx.kind === "cssVariable") {
          return undefined;
        }
        return undefined;
      },
      resolveCall() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-dynamicTransitionSpeed.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutCallResolution },
    );

    expect(result.code).toBeNull();
    expect(
      result.warnings.some(
        (w) => w.type === "Adapter resolveCall returned undefined for helper call",
      ),
    ).toBe(true);
  });
});

describe("import resolution scope", () => {
  it("should not resolve imported values when a local binding shadows the import", () => {
    const source = `
import React from "react";
import styled from "styled-components";
import { zIndex } from "./lib/helpers";

export function App() {
  const zIndex = { modal: 2000 };
  const Overlay = styled.div\`
    position: fixed;
    z-index: \${zIndex.modal};
  \`;
  return <Overlay />;
}
`;

    const result = transformWithWarnings(
      { source, path: "shadowed-import.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
    const code = result.code ?? "";
    expect(code).toContain("zIndex: zIndex.modal");
    expect(code).not.toContain("$zIndex");
    expect(code).not.toContain("tokens.stylex");
  });
});

describe("adapter configuration", () => {
  const themeSource = `
import styled from 'styled-components';

const Button = styled.button\`
  color: \${props => props.theme.color.primary};
\`;

export const App = () => <Button>Click</Button>;
`;

  it("should accept custom adapter", () => {
    const result = transformWithWarnings(
      { source: themeSource, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: customAdapter },
    );

    expect(result.warnings).toHaveLength(0);
  });
});

describe("styleMerger configuration", () => {
  const mergerAdapter = {
    externalInterface() {
      return { styles: true } as const;
    },
    resolveValue() {
      return undefined;
    },
    resolveCall() {
      return undefined;
    },
    resolveSelector() {
      return undefined;
    },
    styleMerger: {
      functionName: "stylexProps",
      importSource: { kind: "specifier" as const, value: "@company/ui-utils" },
    },
  };
  const noExternalMergerAdapter = {
    externalInterface() {
      return null;
    },
    resolveValue() {
      return undefined;
    },
    resolveCall() {
      return undefined;
    },
    resolveSelector() {
      return undefined;
    },
    styleMerger: {
      functionName: "stylexProps",
      importSource: { kind: "specifier" as const, value: "@company/ui-utils" },
    },
  };

  it("should use merger function instead of verbose pattern when configured", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should use stylexProps merger function
    expect(result.code).toContain("stylexProps");
    // Should NOT have the verbose sx variable pattern
    expect(result.code).not.toMatch(/const\s+sx\s*=\s*stylex\.props/);
    // Should NOT have the verbose className merging
    expect(result.code).not.toContain(".filter(Boolean).join");
  });

  it("should import the merger function from configured source", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should import stylexProps from @company/ui-utils
    expect(result.code).toMatch(/import\s*{\s*stylexProps\s*}\s*from\s*["']@company\/ui-utils["']/);
  });

  it("should wrap multiple styles in array", async () => {
    const source = `
import styled from 'styled-components';

const Base = styled.div\`
  color: blue;
\`;

export const Extended = styled(Base)\`
  background: red;
\`;

export const App = () => <Extended>Click</Extended>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should wrap multiple styles in array: stylexProps([styles.base, styles.extended], ...)
    expect(result.code).toMatch(/stylexProps\s*\(\s*\[/);
  });

  it("should pass className and style arguments to merger", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // The merger should be called with styles, className, style
    // Pattern: stylexProps(styles.button, className, style)
    expect(result.code).toMatch(/stylexProps\s*\([^)]*className[^)]*style/);
  });

  it("should not use merger when external styles are disabled", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: noExternalMergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should NOT import the merger function (not needed without external styles)
    expect(result.code).not.toContain("stylexProps");
    // Should use plain stylex.props spread
    expect(result.code).toContain("stylex.props");
  });

  it("should avoid merger when only inline styles are needed", async () => {
    const source = `
import styled from 'styled-components';

type BoxProps = {
  $delay: number;
};

const Box = styled.div<BoxProps>\`
  transition-delay: \${(props) => props.$delay}ms;
\`;

export const App = () => <Box $delay={100} />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: noExternalMergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("stylexProps");
    expect(result.code).toContain("stylex.props");
    expect(result.code).toContain("transitionDelay");
  });

  it("should use verbose pattern when no merger is configured", async () => {
    const adapterWithoutMerger = {
      styleMerger: null,
      externalInterface() {
        return { styles: true } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
    };

    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutMerger },
    );

    expect(result.code).not.toBeNull();
    // Should use the verbose sx variable pattern
    expect(result.code).toMatch(/const\s+sx\s*=\s*stylex\.props/);
    // Should have the verbose className merging
    expect(result.code).toContain(".filter(Boolean).join");
    // Should have style spread
    expect(result.code).toContain("...sx.style");
  });
});

describe("conditional value handling", () => {
  it("should bail when a boolean literal is used as a CSS value in conditional expression", () => {
    // In styled-components, falsy interpolations like `false` mean "omit this declaration".
    // We should bail rather than producing invalid CSS like `cursor: "false"`.
    const source = `
import styled from "styled-components";

const Button = styled.button<{ $disabled?: boolean }>\`
  cursor: \${(p) => (p.$disabled ? "not-allowed" : false)};
\`;

export const App = () => <Button $disabled>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "boolean-css-value.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when true is used as a CSS value in conditional expression", () => {
    const source = `
import styled from "styled-components";

const Button = styled.button<{ $active?: boolean }>\`
  visibility: \${(p) => (p.$active ? true : "hidden")};
\`;

export const App = () => <Button $active>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "boolean-true-css-value.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });
});

describe("imported css helper function calls", () => {
  it("should bail on imported function call with pseudo selectors when adapter cannot resolve", () => {
    // When an imported function is called in a styled component with pseudo selectors,
    // we can't determine what properties it sets. If the adapter can't resolve it,
    // we should bail to avoid generating incorrect pseudo selector handling.
    const source = `
import styled from "styled-components";
import { getPrimaryStyles } from "./external-helpers";

const Button = styled.button\`
  padding: 8px 16px;
  \${getPrimaryStyles()}
  &:hover {
    opacity: 0.8;
  }
\`;

export const App = () => <Button>Click me</Button>;
`;

    const resolveCallCalls: unknown[] = [];
    const adapterWithCallTracking = {
      externalInterface() {
        return { styles: false, as: false } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(args: unknown) {
        resolveCallCalls.push(args);
        return undefined; // Can't resolve this call
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCallTracking },
    );

    // Should bail because we can't determine properties for pseudo selector handling
    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("should work when adapter resolves imported function call", () => {
    // When the adapter CAN resolve the call, it should work fine
    const source = `
import styled from "styled-components";
import { getPrimaryStyles } from "./external-helpers";

const Button = styled.button\`
  padding: 8px 16px;
  \${getPrimaryStyles()}
\`;

export const App = () => <Button>Click me</Button>;
`;

    const adapterThatResolves = {
      externalInterface() {
        return { styles: false, as: false } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        // Return a valid styles resolution (usage: "props" means use as StyleX styles in stylex.props())
        return {
          usage: "props" as const,
          expr: "styles.primary",
          imports: [],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterThatResolves },
    );

    // Should succeed because adapter resolved the call
    expect(result.code).not.toBeNull();
  });
});

describe("conditional helper call inside pseudo selector", () => {
  it("should warn with cssText hint when adapter resolves styles but omits cssText", () => {
    // When a conditional helper call appears inside a pseudo selector (e.g., &:hover)
    // and the adapter resolves it as StyleX styles (usage: "props") WITHOUT cssText,
    // the codemod cannot expand individual CSS properties for pseudo-wrapping.
    // It should emit a descriptive warning mentioning cssText.
    const source = `
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const Text = styled.p<{ $truncate?: boolean }>\`
  font-size: 14px;
  &:hover {
    \${(props) => (props.$truncate ? truncate() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterWithoutCssText = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        // Resolve as StyleX styles but WITHOUT cssText
        return {
          usage: "props" as const,
          expr: "helpers.truncate",
          imports: [
            {
              from: { kind: "specifier" as const, value: "./lib/helpers.stylex" },
              names: [{ imported: "helpers" }],
            },
          ],
          // cssText is intentionally omitted
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-no-csstext.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutCssText },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.type).toBe(
      "Adapter resolved StyleX styles inside pseudo selector but did not provide cssText for property expansion — add cssText to resolveCall result to enable pseudo-wrapping",
    );
    expect(result.warnings[0]!.context).toMatchObject({
      selector: "&:hover",
    });
  });

  it("should use generic warning when expression is not a conditional helper call", () => {
    // When the interpolation inside a pseudo selector is NOT a conditional helper call
    // (e.g., it's a direct call without a conditional, or a logical expression),
    // the generic "cannot be applied under nested selectors" warning should be used.
    const source = `
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const Text = styled.p\`
  font-size: 14px;
  &:hover {
    \${(props) => props.$active && truncate()}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterResolving = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "helpers.truncate",
          imports: [],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-logical.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterResolving },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.type).toBe(
      "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
    );
  });

  it("should succeed when adapter provides cssText for pseudo-wrapping", () => {
    // When the adapter resolves the call with both usage: "props" AND cssText,
    // the codemod can expand the CSS properties and wrap them in pseudo selectors.
    const source = `
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const Text = styled.p<{ $truncate?: boolean }>\`
  font-size: 14px;
  &:hover {
    \${(props) => (props.$truncate ? truncate() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterWithCssText = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "helpers.truncate",
          imports: [],
          cssText: "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-with-csstext.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCssText },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
    // Verify the output contains pseudo-wrapped styles
    expect(result.code).toContain('":hover"');
    expect(result.code).toContain("nowrap");
    expect(result.code).toContain("textTruncate");
  });

  it("should preserve base values for overlapping properties in pseudo-wrapped variants", () => {
    // When the component's base styles define a property (e.g., overflow: auto) and the
    // helper's cssText also sets that property, the pseudo-wrapped variant must preserve
    // the base value as the default so it isn't cleared in the non-pseudo state.
    // In styled-components, the base value persists; only the pseudo state overrides it.
    const source = `
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const Text = styled.p<{ $truncate?: boolean }>\`
  font-size: 14px;
  overflow: auto;
  white-space: pre-wrap;
  &:hover {
    \${(props) => (props.$truncate ? truncate() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterWithCssText = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "helpers.truncate",
          imports: [],
          // overflow and white-space overlap with base styles
          cssText: "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-overlap.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCssText },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
    // overflow has base value "auto" → default should preserve it, not null
    expect(result.code).toContain('"auto"');
    // white-space has base value "pre-wrap" → default should preserve it
    expect(result.code).toContain('"pre-wrap"');
    // text-overflow has no base value → default should be null
    expect(result.code).toContain("default: null");
  });

  it("should extract scalar default and preserve existing pseudo entries from base map", () => {
    // When a property in styleObj is already a pseudo/media map
    // (e.g. { default: "auto", ":focus": "scroll" } from a separate &:focus rule),
    // the pseudo-wrapped variant must:
    // 1. Use the scalar `.default` value, not the whole map (avoids invalid nested maps)
    // 2. Merge existing pseudo/media entries (e.g. ":focus") so they aren't lost when
    //    StyleX replaces the entire property map with the variant's value
    const source = `
import styled from "styled-components";
import { truncate } from "./lib/helpers";

const Text = styled.p<{ $truncate?: boolean }>\`
  font-size: 14px;
  overflow: auto;
  &:focus {
    overflow: scroll;
  }
  &:hover {
    \${(props) => (props.$truncate ? truncate() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterWithCssText = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "helpers.truncate",
          imports: [],
          // overflow overlaps with a property that has a pseudo/media map in base styles
          cssText: "white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-pseudo-map-default.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCssText },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
    // overflow's base is a pseudo map { default: "auto", ":focus": "scroll" },
    // so the variant should extract the scalar "auto", not embed the whole map
    expect(result.code).toContain('"auto"');
    // Must NOT contain a nested default object (invalid StyleX)
    expect(result.code).not.toMatch(/default:\s*\{/);
    // The existing :focus entry must be preserved in the variant so it isn't dropped
    // when StyleX replaces the property map
    expect(result.code).toContain('":focus"');
    expect(result.code).toContain('"scroll"');
  });

  it("should emit descriptive error when adapter provides unparseable cssText", () => {
    // When the adapter provides cssText that cannot be parsed as CSS declarations,
    // the codemod should emit a descriptive error mentioning the expected format.
    const source = `
import styled from "styled-components";
import { brokenHelper } from "./lib/helpers";

const Text = styled.p<{ $active?: boolean }>\`
  font-size: 14px;
  &:hover {
    \${(props) => (props.$active ? brokenHelper() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterWithBadCssText = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "helpers.broken",
          imports: [],
          cssText: "this is not valid css at all",
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-bad-csstext.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithBadCssText },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.type).toBe(
      'Adapter resolveCall cssText could not be parsed as CSS declarations — expected semicolon-separated property: value pairs (e.g. "white-space: nowrap; overflow: hidden;")',
    );
    expect(result.warnings[0]!.severity).toBe("error");
    expect(result.warnings[0]!.context).toMatchObject({
      selector: "&:hover",
      cssText: "this is not valid css at all",
    });
  });

  it("should use generic warning when adapter cannot resolve the call at all", () => {
    // When the adapter returns undefined (cannot resolve), the generic warning is used.
    const source = `
import styled from "styled-components";
import { unknownHelper } from "./lib/helpers";

const Text = styled.p<{ $active?: boolean }>\`
  font-size: 14px;
  &:focus {
    \${(props) => (props.$active ? unknownHelper() : "")}
  }
\`;

export const App = () => <Text>Hello</Text>;
`;

    const adapterReturningUndefined = {
      externalInterface() {
        return null;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-unresolved.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterReturningUndefined },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    // Should use generic warning since the call couldn't be resolved at all
    expect(result.warnings[0]!.type).toBe(
      "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
    );
  });
});

describe("destructured param defaults", () => {
  it("should preserve destructured defaults when inlining arrow functions", () => {
    // Regression test: Previously ({ color = "hotpink" }) => color || "blue"
    // was incorrectly transformed to props.color || "blue", losing the default.
    // The correct transformation should be (props.color ?? "hotpink") || "blue"
    const source = `
import styled from "styled-components";

const Button = styled.button<{ color?: string }>\`
  color: \${({ color = "hotpink" }) => color || "blue"};
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "destructured-default.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should preserve the default using nullish coalescing
    expect(result.code).toContain('props.color ?? "hotpink"');
    // Should still have the || fallback
    expect(result.code).toContain('|| "blue"');
  });

  it("should preserve renamed destructured param defaults", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ margin?: number }>\`
  margin: \${({ margin: m = 10 }) => m || 5}px;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "renamed-destructured-default.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should preserve the default using nullish coalescing on the original prop name
    expect(result.code).toContain("props.margin ?? 10");
    // Should still have the || fallback
    expect(result.code).toContain("|| 5");
  });
});

describe("css helper closure variable detection", () => {
  const closureVarWarning =
    "css`` helper function interpolation references closure variable that cannot be hoisted";

  it("should bail on function parameter in interpolation", () => {
    const source = `
import { css } from "styled-components";

export function helper(size: number) {
  return css\`
    width: \${size}px;
  \`;
}
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(closureVarWarning);
    expect(result.warnings[0]?.context).toEqual({ variable: "size" });
  });

  it("should bail on local variable in interpolation", () => {
    const source = `
import { css } from "styled-components";

export function helper() {
  const color = getColor();
  return css\`
    color: \${color};
  \`;
}
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(closureVarWarning);
    expect(result.warnings[0]?.context).toEqual({ variable: "color" });
  });

  it("should bail on multiple closure variables", () => {
    const source = `
import { css } from "styled-components";

export function helper(height: number) {
  const transition = getTransition();
  return css\`
    height: \${height}px;
    transition: \${transition};
  \`;
}
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(closureVarWarning);
    // Should report the first closure variable found
  });

  it("should bail on arrow function css helper with closure variable", () => {
    const source = `
import { css } from "styled-components";

const helper = (size: number) => css\`
  width: \${size}px;
\`;

export { helper };
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(closureVarWarning);
    expect(result.warnings[0]?.context).toEqual({ variable: "size" });
  });

  it("should bail on local variable used as member expression object", () => {
    // This is a regression test for a false negative where local variables
    // used as objects (e.g., theme.primary) were incorrectly treated as safe.
    // Only function parameters should be allowed in member expression patterns.
    const source = `
import { css } from "styled-components";

export function helper() {
  const theme = getTheme();
  return css\`
    color: \${theme.primary};
  \`;
}
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(closureVarWarning);
    expect(result.warnings[0]?.context).toEqual({ variable: "theme" });
  });

  it("should NOT generate closure variable warning for props.X member access pattern", () => {
    const source = `
import styled from "styled-components";
import { css } from "styled-components";

const helper = (props: { size: number }) => css\`
  width: \${props.size}px;
\`;

const Box = styled.div\`
  \${helper}
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // props.X is not a closure variable (it's a supported member access pattern)
    // The transform may bail for other reasons, but NOT due to closure variable detection
    const closureWarning = result.warnings.find((w) => w.type === closureVarWarning);
    expect(closureWarning).toBeUndefined();
  });

  it("should NOT generate closure variable warning for static values only", () => {
    const source = `
import { css } from "styled-components";
import styled from "styled-components";

const helper = () => css\`
  width: 100px;
  color: red;
\`;

const Box = styled.div\`
  \${helper}
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // No interpolations means no closure variables to detect
    // The transform may bail for other reasons, but NOT due to closure variable detection
    const closureWarning = result.warnings.find((w) => w.type === closureVarWarning);
    expect(closureWarning).toBeUndefined();
  });

  it("should NOT generate closure variable warning for module-level imports in interpolation", () => {
    const source = `
import { css } from "styled-components";
import styled from "styled-components";
import { colors } from "./theme";

const helper = () => css\`
  color: \${colors.primary};
\`;

const Box = styled.div\`
  \${helper}
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // colors is a module-level import, not a closure variable
    // The transform may bail for other reasons, but NOT due to closure variable detection
    const closureWarning = result.warnings.find((w) => w.type === closureVarWarning);
    expect(closureWarning).toBeUndefined();
  });
});

describe("array destructuring holes", () => {
  it("should handle array destructuring patterns with holes (elisions)", () => {
    // Regression test: `const [, setHovered] = useState(false)` produces an
    // ArrayPattern with a null element representing the hole.  The AST safety
    // check must not throw on legitimate elisions.
    const source = `
import styled from "styled-components";
import { useState } from "react";

const Container = styled.div\`
  padding: 16px;
  background-color: #f0f0f0;
\`;

export function App() {
  const [, setHovered] = useState(false);
  return <Container onClick={() => setHovered(true)}>Hello</Container>;
}
`;

    const result = transformWithWarnings(
      { source, path: "array-destructure-hole.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
    // The destructuring pattern should be preserved in the output
    expect(result.code).toContain("[, setHovered]");
  });

  it("should handle array expressions with holes (sparse arrays)", () => {
    // [1, , 3] produces an ArrayExpression with a null element.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: blue;
\`;

const sparse = [1, , 3];

export function App() {
  return <Box>{sparse.length}</Box>;
}
`;

    const result = transformWithWarnings(
      { source, path: "array-expression-hole.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toHaveLength(0);
  });
});

describe("attrs defaultAttrs nullish coalescing", () => {
  it("should preserve nullish-coalescing semantics for intrinsic element attrs", () => {
    // Regression test: styled.div.attrs with props.X ?? defaultValue should
    // use nullish coalescing (??) in the output, not destructuring defaults.
    // Destructuring defaults only apply on undefined, but ?? also handles null.
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
}))\`
  overflow: auto;
\`;

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: "attrs-nullish-coalescing.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Should use nullish coalescing in JSX attribute, not destructuring default
    // Bad: const { tabIndex: tabIndex = 0, ...rest } = props; ... tabIndex={tabIndex}
    // Good: const { tabIndex, ...rest } = props; ... tabIndex={tabIndex ?? 0}
    expect(result.code).toContain("tabIndex ?? 0");
    // Should NOT use destructuring default for this pattern
    expect(result.code).not.toMatch(/tabIndex:\s*tabIndex\s*=\s*0/);
  });
});

describe("theme boolean conditionals", () => {
  it("should handle negated !theme.isDark conditional", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  opacity: \${(props) => !props.theme.isDark ? 0.9 : 0.7};
\`;

export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-isdark-negated.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import React from "react";
      import * as stylex from "@stylexjs/stylex";
      import { useTheme } from "styled-components";

      function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
        const {
          children,
        } = props;

        const theme = useTheme();
        return <div {...stylex.props(theme.isDark ? styles.boxDark : styles.boxLight)}>{children}</div>;
      }

      export const App = () => <Box>Hello</Box>;

      const styles = stylex.create({
        boxDark: {
          opacity: 0.7,
        },
        boxLight: {
          opacity: 0.9,
        },
      });
      "
    `);
  });

  it("should support any boolean theme property, not just isDark", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  font-weight: \${(props) => props.theme.isHighContrast ? 700 : 400};
\`;

export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-isHighContrast.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import React from "react";
      import * as stylex from "@stylexjs/stylex";
      import { useTheme } from "styled-components";

      function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
        const {
          children,
        } = props;

        const theme = useTheme();

        return (
          <div
            {...stylex.props(theme.isHighContrast ? styles.boxHighContrast : styles.boxNotHighContrast)}>{children}</div>
        );
      }

      export const App = () => <Box>Hello</Box>;

      const styles = stylex.create({
        boxHighContrast: {
          fontWeight: 700,
        },
        boxNotHighContrast: {
          fontWeight: 400,
        },
      });
      "
    `);
  });

  it("should support multiple different theme boolean properties in the same component", () => {
    // This tests that each theme prop gets its own style buckets
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  mix-blend-mode: \${(props) => props.theme.isDark ? "lighten" : "darken"};
  font-weight: \${(props) => props.theme.isHighContrast ? 700 : 400};
\`;

export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-multiple-props.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import React from "react";
      import * as stylex from "@stylexjs/stylex";
      import { useTheme } from "styled-components";

      function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
        const {
          children,
        } = props;

        const theme = useTheme();

        return (
          <div
            {...stylex.props(
              theme.isDark ? styles.boxDark : styles.boxLight,
              theme.isHighContrast ? styles.boxHighContrast : styles.boxNotHighContrast,
            )}>{children}</div>
        );
      }

      export const App = () => <Box>Hello</Box>;

      const styles = stylex.create({
        boxDark: {
          mixBlendMode: "lighten",
        },
        boxLight: {
          mixBlendMode: "darken",
        },
        boxHighContrast: {
          fontWeight: 700,
        },
        boxNotHighContrast: {
          fontWeight: 400,
        },
      });
      "
    `);
  });

  it("should bail on complex conditions combining theme boolean with other expressions", () => {
    // This tests that we bail when the condition is more complex than just theme.prop
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: \${(props) => props.theme.isDark && props.isActive ? "red" : "blue"};
\`;

export const App = () => <Box isActive>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-isdark-complex.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail out - complex conditions are not supported
    expect(result.code).toBeNull();
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        {
          "context": {
            "localName": "Box",
            "propLabel": "color",
          },
          "loc": {
            "column": 11,
            "line": 5,
          },
          "severity": "warning",
          "type": "Unsupported prop-based inline style props.theme access is not supported",
        },
      ]
    `);
  });

  it("should not treat closure variables as destructured props in theme conditionals", () => {
    // When the arrow param is ({ theme }) and the test is `closureVar`,
    // closureVar is NOT a destructured prop — it comes from outer scope.
    // The codemod should NOT create prop-based variants for it.
    const source = `
import styled from "styled-components";

const isSpecial = true;

const Badge = styled.div\`
  color: \${({ theme }) => (isSpecial ? theme.color.greenBase : theme.color.labelMuted)};
\`;

export const App = () => <Badge>Hello</Badge>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-closure.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail — closureVar is not a prop, so we can't create variants
    expect(result.code).toBeNull();
  });
});
