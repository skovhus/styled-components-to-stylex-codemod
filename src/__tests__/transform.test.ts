import { describe, it, expect, vi } from "vitest";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import jscodeshift from "jscodeshift";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import transform, { transformWithWarnings } from "../transform.js";
import type { TransformOptions } from "../transform.js";
import { customAdapter, fixtureAdapter } from "./fixture-adapters.js";
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

type TestTransformOptions = Partial<Omit<TransformOptions, "adapter">> & {
  adapter?: TransformOptions["adapter"];
};

function runTransform(
  source: string,
  options: TestTransformOptions = {},
  filePath: string = "test.tsx",
  parser: "tsx" | "babel" | "flow" = "tsx",
): string {
  const opts: TransformOptions = {
    adapter: fixtureAdapter,
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
    adapter: fixtureAdapter,
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
});

describe("_unsupported fixtures", () => {
  it.each(unsupportedInputs)("%s should bail out", (unsupportedInput) => {
    const inputPath = join(testCasesDir, unsupportedInput);
    const input = readFileSync(inputPath, "utf-8");
    const result = transformWithWarnings(
      { source: input, path: inputPath },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
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
    expect(
      result.warnings.some((w) => w.type === "Universal selectors (`*`) are currently unsupported"),
    ).toBe(true);
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
  it("should not remove `css` import when `css` is still referenced (even if no transforms apply)", () => {
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
    expect(result).toBe(source);
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
      result.warnings.some((w) => w.type === "Adapter returned an unparseable styles expression"),
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
      { source, path: join(testCasesDir, "dynamic-helper-transition-speed.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutCallResolution },
    );

    expect(result.code).toBeNull();
    expect(
      result.warnings.some((w) => w.type === "Adapter returned undefined for helper call"),
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
