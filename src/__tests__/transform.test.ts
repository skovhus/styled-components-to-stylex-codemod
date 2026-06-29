import { describe, it, expect } from "vitest";
import { applyTransform } from "jscodeshift/src/testUtils.js";
import jscodeshift from "jscodeshift";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format } from "oxfmt";
import transform, { transformWithWarnings } from "../transform.js";
import type { TransformOptions } from "../transform.js";
import { customAdapter, fixtureAdapter } from "./fixture-adapters.js";
import type { Adapter, CallResolveContext, ResolveValueContext } from "../adapter.js";
import { scanCrossFileSelectors } from "../internal/prepass/scan-cross-file-selectors.js";
import { createModuleResolver } from "../internal/prepass/resolve-imports.js";
import { analyzeTypeScriptProgram } from "../internal/prepass/typescript-analysis.js";
import type { CrossFileInfo } from "../internal/transform-types.js";
import { toRealPath } from "../internal/utilities/path-utils.js";

/** Test case files prefixed with these names are expected to bail out (no output file). */
const BAIL_OUT_PREFIXES = ["_unsupported.", "_unimplemented."] as const;

/** Test cases that intentionally keep specific styled-components APIs after migration. */
const CSS_IMPORT_ALLOWED_FIXTURES = new Set(["naming-inlinedComponentSelector"]);
const KEYFRAMES_IMPORT_ALLOWED_FIXTURES = new Set(["partial-keyframesPreserveTemplateUsage"]);

const PRESERVED_FIXTURES = new Set([
  "cssHelper-componentSelectorReference",
  "selector-pseudoElementConditionalValue",
]);

/**
 * Fixtures that intentionally test partial-file transforms: at least one styled
 * declaration cannot be transformed and remains as `styled\`...\`` in the output,
 * so the `styled` default import must be preserved.
 */
function isPartialFixture(name: string): boolean {
  return name.startsWith("partial-") || PRESERVED_FIXTURES.has(name);
}

function styledComponentsDisallowedImports(name: string): string[] {
  const disallowed = CSS_IMPORT_ALLOWED_FIXTURES.has(name)
    ? ["styled", "keyframes", "createGlobalStyle"]
    : ["styled", "css", "keyframes", "createGlobalStyle"];
  const allowed = new Set<string>();
  if (isPartialFixture(name)) {
    allowed.add("styled");
    allowed.add("css");
  }
  if (KEYFRAMES_IMPORT_ALLOWED_FIXTURES.has(name)) {
    allowed.add("keyframes");
  }
  return disallowed.filter((importName) => !allowed.has(importName));
}

function isBailOutFixture(filename: string): boolean {
  return BAIL_OUT_PREFIXES.some((prefix) => filename.startsWith(prefix));
}

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

type TransformTestParser = FixtureCase["parser"] | "ts";

// Supported file extensions and their parsers
const FIXTURE_EXTENSIONS: {
  inputSuffix: string;
  outputSuffix: string;
  parser: FixtureCase["parser"];
}[] = [
  { inputSuffix: ".input.tsx", outputSuffix: ".output.tsx", parser: "tsx" },
  { inputSuffix: ".input.jsx", outputSuffix: ".output.jsx", parser: "babel" },
  {
    inputSuffix: ".flow.input.jsx",
    outputSuffix: ".flow.output.jsx",
    parser: "flow",
  },
];

function getTestCases(): FixtureCase[] {
  const files = readdirSync(testCasesDir);
  const cases: FixtureCase[] = [];

  for (const { inputSuffix, outputSuffix, parser } of FIXTURE_EXTENSIONS) {
    // Exclude bail-out fixtures from main test cases
    // Convention: `_unsupported.<case>.input.*` and `_unimplemented.<case>.input.*` have NO output file.
    const inputFiles = files.filter((f) => f.endsWith(inputSuffix) && !isBailOutFixture(f));
    const outputFiles = files.filter((f) => f.endsWith(outputSuffix) && !isBailOutFixture(f));

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
const bailOutInputs = readdirSync(testCasesDir)
  .filter((f) => isBailOutFixture(f) && f.endsWith(".input.tsx"))
  .sort();

// Run cross-file prepass once for all test cases (fast, no-op for non-cross-file cases)
const prepassResolver = createModuleResolver();
const prepassResult = scanCrossFileSelectors(
  fixtureCases.map((c) => c.inputPath),
  [],
  prepassResolver,
);
const testCaseTypeScriptMetadata = analyzeTypeScriptProgram({
  files: collectTypeScriptFiles(testCasesDir),
});

function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Extract per-file cross-file info from the prepass result. */
function getCrossFileInfo(
  filePath: string,
  parser: TransformTestParser,
): CrossFileInfo | undefined {
  const absPath = pathResolve(filePath);
  const usages = prepassResult.selectorUsages.get(absPath);
  const typeScriptMetadata = parser === "tsx" ? testCaseTypeScriptMetadata : undefined;
  if ((!usages || usages.length === 0) && !typeScriptMetadata) {
    return undefined;
  }
  return { selectorUsages: usages ?? [], typeScriptMetadata };
}

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
  return {
    input,
    output,
    inputPath: resolvedInputPath,
    outputPath: resolvedOutputPath,
  };
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

function runTransform(
  source: string,
  options: TestTransformOptions = {},
  filePath: string = "test.tsx",
  parser: TransformTestParser = "tsx",
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
  parser: TransformTestParser = "tsx",
): ReturnType<typeof transformWithWarnings> {
  const opts: TransformOptions = {
    adapter: fixtureAdapter,
    ...options,
  };
  const jWithParser = jscodeshift.withParser(parser);
  const result = transformWithWarnings(
    { source, path: filePath },
    {
      jscodeshift: jWithParser,
      j: jWithParser,
      stats: () => {},
      report: () => {},
    },
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

function getPreservedComponentSelectorWithCssHelperSource(): string {
  return `
import styled, { css } from "styled-components";

const hoverStyles = css\`
  color: tomato;
\`;

const ReferencedChild = styled.span\`
  \${hoverStyles}
  color: navy;
\`;

const PreservedContainer = styled.div\`
  &:hover \${ReferencedChild} {
    opacity: 1;
  }

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <PreservedContainer>
    <a className="active">link</a>
    <ReferencedChild>child</ReferencedChild>
  </PreservedContainer>
);
`;
}

function getPreservedComponentSelectorWithCssHelperFunctionSource(): string {
  return `
import styled, { css } from "styled-components";

const hoverStyles = (tone: "danger" | "safe") => css\`
  font-weight: 700;
  \${() => {
    switch (tone) {
      case "danger":
        return css\`
          color: tomato;
        \`;
      default:
        return css\`
          color: navy;
        \`;
    }
  }}
\`;

const ReferencedChild = styled.span<{ tone: "danger" | "safe" }>\`
  \${(props) => hoverStyles(props.tone)}
  color: navy;
\`;

const PreservedContainer = styled.div\`
  &:hover \${ReferencedChild} {
    opacity: 1;
  }

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <PreservedContainer>
    <a className="active">link</a>
    <ReferencedChild tone="danger">child</ReferencedChild>
  </PreservedContainer>
);
`;
}

function getPreservedComponentSelectorWithResolverImportSource(): string {
  return `
import styled from "styled-components";

const ReferencedChild = styled.span\`
  color: \${(props) => props.theme.color.bgBase};
  padding: 4px;
\`;

const PreservedContainer = styled.div\`
  &:hover \${ReferencedChild} {
    opacity: 1;
  }

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <PreservedContainer>
    <a className="active">link</a>
    <ReferencedChild>child</ReferencedChild>
  </PreservedContainer>
);
`;
}

function getPreservedCssHelperFunctionWithComponentSelectorSource(): string {
  return `
import styled, { css } from "styled-components";

const Child = styled.span\`
  color: navy;
  padding: 4px;
\`;

const ConvertedBox = styled.div\`
  margin: 4px;
\`;

const childHover = (tone: "danger" | "safe") => css\`
  &:hover \${Child} {
    color: \${tone === "danger" ? "tomato" : "navy"};
  }
\`;

const PreservedContainer = styled.div\`
  \${() => childHover("danger")}

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <PreservedContainer>
    <Child>child</Child>
    <ConvertedBox>box</ConvertedBox>
    <a className="active">link</a>
  </PreservedContainer>
);
`;
}

function getPreservedComponentSelectorWithBaseResolverImportSource(): string {
  return `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const ReferencedChild = styled(Flex).attrs({ direction: "row" })\`
  padding: 4px;
\`;

const ConvertedBox = styled.div\`
  margin: 4px;
\`;

const PreservedContainer = styled.div\`
  &:hover \${ReferencedChild} {
    opacity: 1;
  }

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <PreservedContainer>
    <a className="active">link</a>
    <ReferencedChild>child</ReferencedChild>
    <ConvertedBox>box</ConvertedBox>
  </PreservedContainer>
);
`;
}

describe("test case file pairing", () => {
  it("should have matching input/output files for all test cases", () => {
    // This test verifies the test case structure is valid
    // getTestCases() throws if there are mismatched files
    expect(fixtureCases.length).toBeGreaterThan(0);
  });

  it("supported test cases should not have @expected-warning annotation", () => {
    // @expected-warning is only for bail-out fixtures (_unsupported / _unimplemented) that are expected to bail
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

describe("bail-out fixtures (_unsupported + _unimplemented)", () => {
  it.each(bailOutInputs)("%s should bail out", (bailOutInput) => {
    const inputPath = join(testCasesDir, bailOutInput);
    const input = readFileSync(inputPath, "utf-8");
    const expectedWarning = getExpectedWarningType(input, inputPath);
    // Only the `_unsupported.partial-*` fixtures need partial-migration mode —
    // they exercise the cascade-conflict guard that fires only when per-decl
    // skips are allowed. Regular `_unsupported.*` cases should bail under the
    // default stricter semantics.
    const allowPartialMigration = bailOutInput.startsWith("_unsupported.partial-");
    const parser = bailOutInput.endsWith(".input.jsx") ? "babel" : "tsx";
    const crossFileInfo = getCrossFileInfo(inputPath, parser);
    const result = transformWithWarnings(
      { source: input, path: inputPath },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration, crossFileInfo },
    );
    // With per-decl skips, other decls in the fixture may transform successfully while
    // the one carrying the unsupported pattern is preserved. Require the expected
    // warning to be present rather than forcing the whole file to bail.
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.map((w) => w.type)).toContain(expectedWarning);
  });
});

const CASCADE_CONFLICT_WARNING =
  "styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts";
const PARTIAL_MIGRATION_INCOMPLETE_WARNING =
  "Partial migration left styled-components declarations unconverted";

describe("cascade conflict detection", () => {
  const WARNING_TYPE = CASCADE_CONFLICT_WARNING;

  it("bails on default-imported component wrapping internal styled-components", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import GroupHeader from "./lib/styled-group-header";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomGroupHeader label="test" id="t" />;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-default.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.type).toBe(WARNING_TYPE);
  });

  it("reports every imported styled-components base conflict in the file before bailing", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

const CompactGroupHeader = styled(GroupHeader)\`
  padding-block: 4px;
\`;

export const App = () => (
  <>
    <CustomGroupHeader label="test" id="a" />
    <CompactGroupHeader label="test" id="b" />
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-multiple.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.map((w) => w.type)).toEqual([WARNING_TYPE, WARNING_TYPE]);
    expect(result.warnings.map((w) => w.context)).toEqual([
      expect.objectContaining({ component: "CustomGroupHeader" }),
      expect.objectContaining({ component: "CompactGroupHeader" }),
    ]);
  });

  it("reports the original styled-components definition path when fallback scanning follows a barrel", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header-barrel";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomGroupHeader label="test" id="t" />;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-barrel-definition.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.context).toEqual(
      expect.objectContaining({
        definitionPath: toRealPath(join(testCasesDir, "lib/styled-group-header.tsx")),
      }),
    );
  });

  it("does not bail for unrelated styled-components files behind star barrels", () => {
    const source = `
import styled from "styled-components";
import { Plain } from "./lib/cascade-star-barrel";

const CustomPlain = styled(Plain)\`
  padding: 4px;
\`;

export const App = () => <CustomPlain>safe</CustomPlain>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-star-safe.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not bail on non-styled-components styled factory usage", () => {
    const source = `
import styled from "styled-components";
import { LocalStyledFactoryComponent } from "./lib/local-styled-factory";

const CustomFactoryComponent = styled(LocalStyledFactoryComponent)\`
  padding: 4px;
\`;

export const App = () => <CustomFactoryComponent>safe</CustomFactoryComponent>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-local-styled-factory.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not treat a transformed dependency file as proof that every export converted", () => {
    const boxPath = toRealPath(join(__dirname, "fixtures/cascade/box.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./fixtures/cascade/box";

const CustomBox = styled(Box)\`
  padding: 4px;
\`;

export const App = () => <CustomBox>unsafe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(__dirname, "cascade-partial-dependency.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[boxPath, new Set(["Box"])]]),
          transformedFiles: new Set([boxPath]),
          transformedComponents: new Map([[boxPath, new Set(["OtherBox"])]]),
        },
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });

  it("allows same-run styled wrappers only when the imported component converted", () => {
    const boxPath = toRealPath(join(__dirname, "fixtures/cascade/box.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./fixtures/cascade/box";

const CustomBox = styled(Box)\`
  padding: 4px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(__dirname, "cascade-converted-dependency.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[boxPath, new Set(["Box"])]]),
          transformedFiles: new Set([boxPath]),
          transformedComponents: new Map([[boxPath, new Set(["Box"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("still bails when a same-run plain component renders an unconverted styled definition", () => {
    const groupHeaderPath = toRealPath(join(testCasesDir, "lib/styled-group-header.tsx"));
    const source = `
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomGroupHeader label="test" id="t" />;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-same-run-plain-wrapper.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[groupHeaderPath, new Set(["StyledHeader"])]]),
          transformedFiles: new Set([groupHeaderPath]),
          transformedComponents: new Map([[groupHeaderPath, new Set(["OtherHeader"])]]),
        },
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });

  it("does not bail when a same-run plain component renders only converted styled definitions", () => {
    const groupHeaderPath = toRealPath(join(testCasesDir, "lib/styled-group-header.tsx"));
    const source = `
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomGroupHeader label="test" id="t" />;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-same-run-converted-wrapper.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[groupHeaderPath, new Set(["StyledHeader"])]]),
          transformedFiles: new Set([groupHeaderPath]),
          transformedComponents: new Map([[groupHeaderPath, new Set(["StyledHeader"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not bail when a pre-converted mixed dependency export is clearly StyleX", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-mixed.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-mixed";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-mixed.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[mixedPath, new Set(["LegacyPanel"])]]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["Box"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not bail when a pre-converted mixed dependency was omitted from the StyleX prepass map", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-mixed.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-mixed";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-mixed-fallback.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[mixedPath, new Set(["LegacyPanel"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("still bails when a pre-converted mixed dependency export uses StyleX but renders styled-components", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-mixed-unsafe.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-mixed-unsafe";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>unsafe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-mixed-unsafe.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[mixedPath, new Set(["LegacyPanel"])]]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["Box"])]]),
        },
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });

  it("does not bail when a pre-converted default export wraps a StyleX component", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-default-wrapper.tsx"));
    const source = `
import styled from "styled-components";
import DefaultBox from "./lib/preconverted-default-wrapper";

const CustomBox = styled(DefaultBox)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-default-wrapper.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[mixedPath, new Set(["LegacyPanel"])]]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["default"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not bail when a pre-converted named class export is clearly StyleX", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-class.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-class";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-class.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([[mixedPath, new Set(["LegacyPanel"])]]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["Box"])]]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("still bails when a pre-converted StyleX export renders an imported styled-components root", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-imported-styled-root.tsx"));
    const importedStyledPath = toRealPath(join(testCasesDir, "lib/styled-group-header.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-imported-styled-root";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>unsafe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-imported-root.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([
            [mixedPath, new Set(["UnrelatedLocal"])],
            [importedStyledPath, new Set(["StyledHeader"])],
          ]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["Box"])]]),
        },
        resolveModule: (fromFile, specifier) =>
          specifier === "./styled-group-header"
            ? join(dirname(fromFile), "styled-group-header.tsx")
            : undefined,
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });

  it("still bails when a pre-converted StyleX export renders an alias-resolved styled-components root", () => {
    const mixedPath = toRealPath(join(testCasesDir, "lib/preconverted-aliased-styled-root.tsx"));
    const importedStyledPath = toRealPath(join(testCasesDir, "lib/styled-group-header.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./lib/preconverted-aliased-styled-root";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>unsafe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-preconverted-aliased-root.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([
            [mixedPath, new Set(["UnrelatedLocal"])],
            [importedStyledPath, new Set(["StyledHeader"])],
          ]),
          stylexComponentFiles: new Map([[mixedPath, new Set(["Box"])]]),
        },
        resolveModule: (_fromFile, specifier) =>
          specifier === "@ui/styled-group-header" ? importedStyledPath : undefined,
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });

  it("does not bail when a pre-converted StyleX export renders an imported StyleX export from a mixed file", () => {
    const mixedPath = toRealPath(join(__dirname, "fixtures/preconverted/imported-stylex-root.tsx"));
    const basePath = toRealPath(join(__dirname, "fixtures/preconverted/base-mixed.tsx"));
    const source = `
import styled from "styled-components";
import { Box } from "./fixtures/preconverted/imported-stylex-root";

const CustomBox = styled(Box)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomBox>safe</CustomBox>;
`;
    const result = transformWithWarnings(
      { source, path: join(__dirname, "cascade-preconverted-imported-stylex.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        crossFileInfo: {
          selectorUsages: [],
          styledDefFiles: new Map([
            [mixedPath, new Set(["_UnrelatedLocal"])],
            [basePath, new Set(["_LegacyBase"])],
          ]),
          stylexComponentFiles: new Map([
            [mixedPath, new Set(["Box"])],
            [basePath, new Set(["Base"])],
          ]),
        },
        resolveModule: (fromFile, specifier) =>
          specifier === "./base-mixed" ? join(dirname(fromFile), "base-mixed.tsx") : undefined,
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
  });

  it("does not bail in partial migration when wrapping a styled-components imported root", () => {
    // In partial migration, `styled(ImportedComponent)` decls are left as
    // styled-components by `markPartialImportedComponentRoots` later in the pipeline.
    // The cascade-conflict step must honor the same skip policy so unrelated local
    // styled-components in the same file can still migrate.
    const source = `
import styled from "styled-components";
import GroupHeader from "./lib/styled-group-header";

const Notice = styled.div\`
  padding: 12px;
\`;

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => (
  <>
    <Notice>local</Notice>
    <CustomGroupHeader label="test" id="t" />
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-partial-imported-root.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(WARNING_TYPE);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
        context: expect.objectContaining({
          skippedDeclarations: ["CustomGroupHeader"],
          convertedDeclarations: ["Notice"],
        }),
      }),
    );
    // Local component migrated to StyleX.
    expect(result.code).toMatch(/sx=\{styles\.notice\}/);
    // Imported root left as styled-components.
    expect(result.code).toMatch(/const\s+CustomGroupHeader\s*=\s*styled\(GroupHeader\)`/);
  });

  it("skips imported member roots before unsupported-pattern checks in partial migration", () => {
    const source = `
import styled from "styled-components";
import * as UI from "./lib/ui";

const Notice = styled.div\`
  padding: 12px;
\`;

const CustomText = styled(UI.Text)\`
  color: red;
\`;

CustomText.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => (
  <>
    <Notice>local</Notice>
    <CustomText />
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-imported-member-root.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(
      "Theme prop overrides on styled components are not supported",
    );
    expect(result.code).toMatch(/sx=\{styles\.notice\}/);
    expect(result.code).toMatch(/const\s+CustomText\s*=\s*styled\(UI\.Text\)`/);
    expect(result.code).not.toContain("customText:");
  });

  it("prefers full conversion in partial migration when an imported member root is convertible", () => {
    const source = `
import styled from "styled-components";
import { motion } from "./lib/framer-motion";

const Controls = styled(motion.div)\`
  flex: none;
  border-left: 1px solid red;
  border-bottom-right-radius: 12px;
\`;

export const App = () => (
  <Controls animate={{ width: "50%" }}>
    Panel
  </Controls>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-convertibleImportedMemberRoot.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(PARTIAL_MIGRATION_INCOMPLETE_WARNING);
    expect(result.code).toContain("<motion.div");
    expect(result.code).toContain("styles.controls");
    expect(result.code).not.toContain("styled-components");
  });

  it("falls back to partial migration when a typed imported root has static assignments", () => {
    const source = `
import styled from "styled-components";
import { Text } from "./lib/text";

type TitleProps = {
  variant?: "small" | "large";
};

const Notice = styled.div\`
  padding: 12px;
\`;

const Title = styled(Text)<TitleProps>\`
  color: red;
\`;

Title.defaultProps = {
  variant: "small",
};

export const App = () => (
  <Notice>
    <Title>Panel</Title>
  </Notice>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-importedRootStatics.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("<div sx={styles.notice}>");
    expect(result.code).toMatch(/const\s+Title\s*=\s*styled\(Text\)<TitleProps>`/);
    expect(result.code).toContain("Title.defaultProps = {");
    expect(result.code).not.toContain("title:");
  });

  it("does not emit inline keyframes from skipped imported roots in partial migration", () => {
    const source = `
import styled from "styled-components";
import ImportedPanel from "./lib/panel";

const Notice = styled.div\`
  padding: 12px;
\`;

const CustomPanel = styled(ImportedPanel)\`
  @keyframes shimmer {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  animation: shimmer 1s linear infinite;
\`;

CustomPanel.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => (
  <>
    <Notice>local</Notice>
    <CustomPanel />
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-imported-root-keyframes.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/sx=\{styles\.notice\}/);
    expect(result.code).toMatch(/const\s+CustomPanel\s*=\s*styled\(ImportedPanel\)`/);
    expect(result.code).not.toContain("stylex.keyframes");
  });

  it("bails for non-relative barrel re-exports resolved by the configured resolver", () => {
    const source = `
import styled from "styled-components";
import { GroupHeader } from "./lib/styled-group-header-alias-barrel";

const CustomGroupHeader = styled(GroupHeader)\`
  padding-inline: 14px;
\`;

export const App = () => <CustomGroupHeader label="test" id="t" />;
`;
    const groupHeaderPath = join(testCasesDir, "lib/styled-group-header.tsx");
    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "cascade-non-relative-barrel.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: fixtureAdapter,
        resolveModule: (_fromFile: string, specifier: string) =>
          specifier === "@fixtures/styled-group-header" ? groupHeaderPath : undefined,
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(WARNING_TYPE);
  });
});

describe("partial-file transforms", () => {
  // All partial-file tests need allowPartialMigration: true so per-decl bails
  // don't escalate to a whole-file bail.
  const runPartial = (source: string, filename: string) =>
    transformWithWarnings(
      { source, path: join(testCasesDir, filename) },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter, allowPartialMigration: true },
    );

  it("emits a warning for the skipped decl and transforms the rest", () => {
    const source = `
import styled from "styled-components";

const Container = styled.div\`
  padding: 12px;
\`;

const Complex = styled.nav\`
  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const result = runPartial(source, "partial-warning.input.tsx");

    expect(result.code).not.toBeNull();
    // StyleX output for Container (fixture adapter uses the `sx` prop)
    expect(result.code).toContain("stylex.create");
    expect(result.code).toMatch(/sx=\{styles\.container\}/);
    // Original styled-components declaration preserved for Complex
    expect(result.code).toMatch(/const\s+Complex\s*=\s*styled\.nav`/);
    expect(result.code).toContain('import styled from "styled-components"');
    // Warning emitted for the skipped decl
    expect(result.warnings.some((w) => w.type.startsWith("Unsupported selector"))).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
        context: expect.objectContaining({
          skippedDeclarationCount: 1,
          skippedDeclarations: ["Complex"],
          convertedDeclarationCount: 1,
          convertedDeclarations: ["Container"],
        }),
      }),
    );
  });

  it("preserves a child reveal whose ancestor stays styled-components without leaking a dead style", () => {
    // `Card` has an unsupported descendant selector and stays as styled-components,
    // so it can never render the marker that `Actions`'s `${Card}:hover &` reveal
    // depends on. `Actions` must be preserved too — including its dynamic prop-based
    // `gap` style — so no unused StyleX style leaks into the converted `Footer` output.
    const source = `
import * as React from "react";
import styled from "styled-components";

const Card = styled.div\`
  padding: 8px;

  & span.label {
    color: red;
  }
\`;

const Actions = styled.div<{ $gap: number }>\`
  opacity: 0;
  gap: \${(p) => p.$gap}px;

  \${Card}:hover & {
    opacity: 1;
  }
\`;

const Footer = styled.div\`
  color: gray;
\`;

export const App = () => (
  <Card>
    <span className="label">Label</span>
    <Actions $gap={4}>Actions</Actions>
    <Footer>Footer</Footer>
  </Card>
);
`;
    const result = runPartial(source, "partial-childReveal.input.tsx");

    expect(result.code).not.toBeNull();
    // Footer converts to StyleX.
    expect(result.code).toMatch(/sx=\{styles\.footer\}/);
    // Both Card and Actions are preserved as styled-components so the original
    // `${Card}:hover &` reveal keeps working natively.
    expect(result.code).toMatch(/const\s+Card\s*=\s*styled\.div`/);
    expect(result.code).toMatch(/const\s+Actions\s*=\s*styled\.div</);
    // No leaked StyleX style for the preserved child: neither the reveal override,
    // an unmarked when.ancestor(), nor the dynamic prop style may appear.
    expect(result.code).not.toContain("actionsInCard");
    expect(result.code).not.toContain("when.ancestor");
    expect(result.code).not.toMatch(/\bactions[A-Za-z0-9]*:/);
    // Clear warning naming the preserved child and its ancestor.
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: expect.stringContaining("StyleX child reveal targeting a styled-components ancestor"),
        context: expect.objectContaining({ child: "Actions", ancestor: "Card" }),
      }),
    );
  });

  it("preserves a reveal child when its ancestor is preserved only via reference propagation", () => {
    // `Card` converts on its own, but a *skipped* sibling (`Other`) references it
    // as a selector, so partial migration preserves `Card` as styled-components
    // after lowering. `Actions` already lowered its `${Card}:hover &` reveal against
    // a converting `Card`; without back-propagation that would leave a dead
    // `actionsInCard` style (and a dynamic `actionsGap` style-fn) in stylex.create().
    const source = `
import * as React from "react";
import styled from "styled-components";

const Card = styled.div\`
  padding: 8px;
\`;

const Other = styled.div\`
  \${Card} span.label {
    color: red;
  }
\`;

const Actions = styled.div<{ $gap: number }>\`
  opacity: 0;
  gap: \${(p) => p.$gap}px;

  \${Card}:hover & {
    opacity: 1;
  }
\`;

const Footer = styled.div\`
  color: gray;
\`;

export const App = () => (
  <Card>
    <Other>
      <span className="label">L</span>
    </Other>
    <Actions $gap={4}>Actions</Actions>
    <Footer>Footer</Footer>
  </Card>
);
`;
    const result = runPartial(source, "partial-childRevealReferenced.input.tsx");

    expect(result.code).not.toBeNull();
    // Footer still converts.
    expect(result.code).toMatch(/sx=\{styles\.footer\}/);
    // Card (the referenced ancestor) and Actions (its reveal child) are both
    // preserved as styled-components.
    expect(result.code).toMatch(/const\s+Card\s*=\s*styled\.div`/);
    expect(result.code).toMatch(/const\s+Actions\s*=\s*styled\.div</);
    // No leaked StyleX style for the preserved child — neither the reveal override,
    // an unmarked when.ancestor(), nor the dynamic style-fn may appear.
    expect(result.code).not.toContain("actionsInCard");
    expect(result.code).not.toContain("when.ancestor");
    expect(result.code).not.toMatch(/\bactions[A-Za-z0-9]*:/);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: expect.stringContaining("StyleX child reveal targeting a styled-components ancestor"),
        context: expect.objectContaining({ child: "Actions", ancestor: "Card" }),
      }),
    );
  });

  it.each([
    ["universal descendant selector", "& *"],
    ["universal child selector", "& > *"],
  ])("skips only the declaration with a %s", (_label, selector) => {
    const source = `
import styled from "styled-components";

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  color: navy;

  ${selector} {
    margin: 0;
  }
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelector.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: "Universal selectors (`*`) are currently unsupported",
      }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
        context: expect.objectContaining({
          skippedDeclarations: ["Typography"],
          convertedDeclarations: ["Icon"],
        }),
      }),
    );
  });

  it("preserves a universal-selector css helper and skips only its consumers", () => {
    const source = `
import styled, { css } from "styled-components";

const typographyReset = css\`
  & * {
    margin: 0;
  }
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  color: navy;
  \${typographyReset}
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+typographyReset\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: PARTIAL_MIGRATION_INCOMPLETE_WARNING,
        context: expect.objectContaining({
          skippedDeclarations: ["Typography"],
          convertedDeclarations: ["Icon"],
        }),
      }),
    );
  });

  it("preserves universal-selector object-member css helpers for skipped consumers", () => {
    const source = `
import styled, { css } from "styled-components";

const mixins = {
  typographyReset: css\`
    & * {
      margin: 0;
    }
  \`,
};

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  color: navy;
  \${mixins.typographyReset}
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorObjectHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/typographyReset:\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("propagates universal-selector skips through composed css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const typographyReset = css\`
  & * {
    margin: 0;
  }
\`;

const mixins = {
  typographyColor: css\`
    color: navy;
  \`,
};

const typographyStyles = css\`
  \${typographyReset}
  \${mixins.typographyColor}
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${typographyStyles}
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorComposedHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+typographyReset\s*=\s*css`/);
    expect(result.code).toMatch(/const\s+typographyStyles\s*=\s*css`/);
    expect(result.code).toMatch(/typographyColor:\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("propagates universal-selector skips from object-member helpers through composed css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const mixins = {
  typographyReset: css\`
    & * {
      margin: 0;
    }
  \`,
};

const typographyStyles = css\`
  \${mixins.typographyReset}
  color: navy;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${typographyStyles}
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorObjectComposedHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/typographyReset:\s*css`/);
    expect(result.code).toMatch(/const\s+typographyStyles\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("preserves object-member css helpers referenced by untransformed css templates", () => {
    const source = `
import styled, { css } from "styled-components";

const mixins = {
  typographyReset: css\`
    margin: 0;
  \`,
};

const getTypographyStyles = () => css\`
  \${mixins.typographyReset}
  color: navy;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => <Icon />;
`;
    const result = runPartial(source, "partial-objectHelperUntransformedCssTemplate.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/typographyReset:\s*css`/);
    expect(result.code).toContain("${mixins.typographyReset}");
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves object-member css helpers referenced by exported css templates", () => {
    const source = `
import styled, { css } from "styled-components";

const mixins = {
  typographyReset: css\`
    margin: 0;
  \`,
};

export const typographyStyles = css\`
  \${mixins.typographyReset}
  color: navy;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => <Icon />;
`;
    const result = runPartial(source, "partial-objectHelperExportedCssTemplate.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/typographyReset:\s*css`/);
    expect(result.code).toContain("${mixins.typographyReset}");
    expect(result.code).toMatch(/export\s+const\s+typographyStyles\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves universal-selector standalone css templates instead of rewriting them", () => {
    const source = `
import styled, { css } from "styled-components";

const baseColor = css\`
  color: navy;
\`;

const resets = [
  css\`
    \${baseColor}

    & * {
      margin: 0;
    }
  \`,
];

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => <Icon />;
`;
    const result = runPartial(source, "partial-universalSelectorStandaloneCssTemplate.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+baseColor\s*=\s*css`/);
    expect(result.code).toContain("css`");
    expect(result.code).toContain("& *");
    expect(result.code).not.toContain("styles.standaloneCssHelper");
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves standalone css templates composed from universal helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const reset = css\`
  & * {
    margin: 0;
  }
\`;

const rules = [
  css\`
    \${reset}
    color: red;
  \`,
];

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => <Icon />;
`;
    const result = runPartial(
      source,
      "partial-universalSelectorComposedStandaloneCssTemplate.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+reset\s*=\s*css`/);
    expect(result.code).toMatch(/const\s+rules\s*=\s*\[/);
    expect(result.code).toMatch(/\$\{reset\}/);
    expect(result.code).not.toMatch(/standaloneCssHelper/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves selector targets in universal standalone css templates", () => {
    const source = `
import styled, { css } from "styled-components";

const Child = styled.span\`
  color: navy;
\`;

const rules = [
  css\`
    \${Child} {
      color: tomato;
    }

    & * {
      margin: 0;
    }
  \`,
];

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => (
  <div>
    <Icon />
    <Child>Text</Child>
  </div>
);
`;
    const result = runPartial(
      source,
      "partial-universalSelectorStandaloneTemplateSelectorTarget.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+Child\s*=\s*styled\.span`/);
    expect(result.code).toMatch(/const\s+rules\s*=\s*\[/);
    expect(result.code).toMatch(/\$\{Child\}/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("propagates universal-selector skips through exported composed css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

export const typographyReset = css\`
  & * {
    margin: 0;
  }
\`;

export const typographyStyles = css\`
  \${typographyReset}
  color: navy;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${typographyStyles}
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorExportedComposedHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/export\s+const\s+typographyReset\s*=\s*css`/);
    expect(result.code).toMatch(/export\s+const\s+typographyStyles\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("preserves css helpers interpolated by skipped universal-selector declarations", () => {
    const source = `
import styled, { css } from "styled-components";

const baseColor = css\`
  color: navy;
\`;

const typographyColor = css\`
  \${baseColor}
  font-weight: 600;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${typographyColor}

  & * {
    margin: 0;
  }
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorTemplateHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+typographyColor\s*=\s*css`/);
    expect(result.code).toMatch(/const\s+baseColor\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("preserves css helpers used by universal styled-call css templates", () => {
    const source = `
import styled, { css } from "styled-components";

const baseColor = css\`
  color: navy;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div(() => css\`
  \${baseColor}

  & * {
    margin: 0;
  }
\`);

export const App = () => (
  <div>
    <Icon />
    <Typography><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorStyledCallHelper.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+baseColor\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div\(/);
  });

  it("preserves selector targets referenced through source-kept helper chains", () => {
    const source = `
import styled, { css } from "styled-components";

const Child = styled.span\`
  color: navy;
\`;

const childRules = css\`
  \${Child} {
    color: tomato;
  }
\`;

const parentRules = css\`
  \${childRules}
  color: inherit;
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${parentRules}

  & * {
    margin: 0;
  }
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><Child>Text</Child></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorHelperSelectorTarget.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+Child\s*=\s*styled\.span`/);
    expect(result.code).toMatch(/const\s+childRules\s*=\s*css`/);
    expect(result.code).toMatch(/const\s+parentRules\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("preserves selector targets referenced only by source-kept css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const Child = styled.span\`
  color: navy;
\`;

const childRules = css\`
  \${Child} {
    color: tomato;
  }
\`;

export const reset = css\`
  \${childRules}

  & * {
    margin: 0;
  }
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => (
  <div>
    <Icon />
    <Child>Text</Child>
  </div>
);
`;
    const result = runPartial(
      source,
      "partial-universalSelectorExportedHelperSelectorTarget.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+Child\s*=\s*styled\.span`/);
    expect(result.code).toMatch(/const\s+childRules\s*=\s*css`/);
    expect(result.code).toMatch(/export\s+const\s+reset\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves direct selector targets in source-kept css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const Child = styled.span\`
  color: navy;
\`;

export const reset = css\`
  \${Child} {
    color: tomato;
  }

  & * {
    margin: 0;
  }
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

export const App = () => (
  <div>
    <Icon />
    <Child>Text</Child>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorHelperDirectSelector.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+Child\s*=\s*styled\.span`/);
    expect(result.code).toMatch(/export\s+const\s+reset\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
  });

  it("preserves css helper functions referenced by source-kept css helpers", () => {
    const source = `
import styled, { css } from "styled-components";

const toneStyles = (tone: "danger" | "safe") => css\`
  font-weight: 700;
  \${() => {
    switch (tone) {
      case "danger":
        return css\`
          color: tomato;
        \`;
      default:
        return css\`
          color: navy;
        \`;
    }
  }}
\`;

const baseColor = css\`
  \${(props) => toneStyles(props.tone)}
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div<{ tone: "danger" | "safe" }>\`
  \${baseColor}

  & * {
    margin: 0;
  }
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography tone="danger"><span>Text</span></Typography>
  </div>
);
`;
    const result = runPartial(source, "partial-universalSelectorHelperFunction.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(
      /const\s+toneStyles\s*=\s*\(\s*tone:\s*"danger"\s*\|\s*"safe"\s*\)\s*=>\s*css`/,
    );
    expect(result.code).toMatch(/const\s+baseColor\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div/);
  });

  it("allows source-kept css helpers with unsupported selectors to skip locally", () => {
    const source = `
import styled, { css } from "styled-components";

const linkStyles = css\`
  & a.active {
    color: gold;
  }
\`;

const Icon = styled.div\`
  width: 16px;
  height: 16px;
  background-color: green;
\`;

const Typography = styled.div\`
  \${linkStyles}

  & * {
    margin: 0;
  }
\`;

export const App = () => (
  <div>
    <Icon />
    <Typography><a className="active">Text</a></Typography>
  </div>
);
`;
    const result = runPartial(
      source,
      "partial-universalSelectorHelperUnsupportedSelector.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+linkStyles\s*=\s*css`/);
    expect(result.code).toMatch(/sx=\{styles\.icon\}/);
    expect(result.code).toMatch(/const\s+Typography\s*=\s*styled\.div`/);
  });

  it("does not treat member properties as standalone helper identifiers", () => {
    const source = `
import styled, { css } from "styled-components";

const reset = css\`
  & * {
    margin: 0;
  }
\`;

const mixins = {
  reset: css\`
    color: navy;
  \`,
};

const card = css\`
  \${mixins.reset}
  background-color: green;
\`;

const Box = styled.div\`
  \${card}
  padding: 8px;
\`;

export const App = () => <Box>Box</Box>;
`;
    const result = runPartial(source, "partial-universalSelectorMemberPropertyName.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+reset\s*=\s*css`/);
    expect(result.code).toMatch(/sx=/);
    expect(result.code).not.toMatch(/const\s+Box\s*=\s*styled\.div`/);
  });

  it("preserves `import { styled as alias }` aliasing across partial transforms", () => {
    // Aliased named-import form: both the `imported` (styled) and `local` (sc) names
    // must survive the re-emit. Emitting only the alias would produce
    // `import { sc }` which is not an exported name.
    const source = `
import { styled as sc } from "styled-components";

const Container = sc.div\`
  padding: 12px;
\`;

const Complex = sc.nav\`
  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const result = runPartial(source, "partial-aliasedStyled.input.tsx");

    expect(result.code).not.toBeNull();
    // Alias is preserved: `import { styled as sc }` must survive.
    expect(result.code).toMatch(
      /import\s+\{\s*styled\s+as\s+sc\s*\}\s+from\s+["']styled-components["']/,
    );
    // The preserved decl still uses the alias (sc.nav).
    expect(result.code).toMatch(/const\s+Complex\s*=\s*sc\.nav`/);
  });

  it("falls back to stylexStyles when the existing stylex.create name is shadowed by a function parameter", () => {
    // A function parameter named `styles` shadows the top-level `const styles = ...`
    // inside the function body. Emitting `sx={styles.container}` at a call site
    // inside that function would bind to the parameter — reject the merge.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Container = styled.div\`
  padding: 12px;
\`;

const styles = stylex.create({
  heading: { color: "navy" },
});

function Row(styles) {
  return <Container>{styles.label}</Container>;
}

export const App = () => (
  <div>
    <Row styles={{ label: "a" }} />
  </div>
);
`;
    const result = runPartial(source, "partial-shadowedParam.input.tsx");

    expect(result.code).not.toBeNull();
    // Merge rejected → new declaration under `stylexStyles`.
    expect(result.code).toMatch(/const\s+stylexStyles\s*=\s*stylex\.create/);
    expect(result.code).toMatch(/sx=\{stylexStyles\.container\}/);
  });

  it("bails when a skipped decl still interpolates an extracted css helper", () => {
    // `const hoverStyles = css\`...\`` is simple and would normally lower cleanly,
    // but extractCssHelpersStep removes its source declaration before lowering.
    // If the consumer `Complex` is then skipped (unsupported selector), its
    // preserved template would reference the now-undefined `hoverStyles` identifier.
    const source = `
import styled, { css } from "styled-components";

const hoverStyles = css\`
  color: tomato;
\`;

const Container = styled.div\`
  padding: 12px;
\`;

const Complex = styled.nav\`
  \${hoverStyles}
  & a.active { color: gold; }
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const result = runPartial(source, "partial-danglingHelper.input.tsx");

    expect(result.code).toBeNull();
  });

  it("bails when a newly preserved component references an extracted css helper", () => {
    const result = runPartial(
      getPreservedComponentSelectorWithCssHelperSource(),
      "partial-componentSelectorDanglingHelper.input.tsx",
    );

    expect(result.code).toBeNull();
  });

  it("preserves css helper functions used by newly preserved component selector targets", () => {
    const result = runPartial(
      getPreservedComponentSelectorWithCssHelperFunctionSource(),
      "partial-componentSelectorHelperFunction.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(
      /const\s+hoverStyles\s*=\s*\(\s*tone:\s*"danger"\s*\|\s*"safe"\s*\)\s*=>\s*css`/,
    );
    expect(result.code).toMatch(/const\s+ReferencedChild\s*=\s*styled\.span/);
    expect(result.code).toContain("hoverStyles(props.tone)");
  });

  it("does not emit resolver imports from newly preserved component selector targets", () => {
    const result = runPartial(
      getPreservedComponentSelectorWithResolverImportSource(),
      "partial-componentSelectorResolverImport.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("./tokens.stylex");
    expect(result.code).not.toContain("$colors");
    expect(result.code).toMatch(/const\s+ReferencedChild\s*=\s*styled\.span`/);
  });

  it("bails when a preserved css helper function contains component selectors", () => {
    const result = runPartial(
      getPreservedCssHelperFunctionWithComponentSelectorSource(),
      "partial-componentSelectorHelperFunctionSelector.input.tsx",
    );

    expect(result.code).toBeNull();
  });

  it("does not emit base resolver imports from newly preserved component selector targets", () => {
    const result = runPartial(
      getPreservedComponentSelectorWithBaseResolverImportSource(),
      "partial-componentSelectorBaseResolverImport.input.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("./lib/mixins.stylex");
    expect(result.code).not.toContain("mixins.flex");
    expect(result.code).toMatch(/const\s+ReferencedChild\s*=\s*styled\(Flex\)\.attrs/);
    expect(result.code).toMatch(/sx=\{styles\.convertedBox\}/);
  });

  it("preserves shared mixin style keys when one of the mixin's consumers is skipped", () => {
    // `sharedReset` is a css helper used by both `Container` (transforms) and
    // `Complex` (skipped). The helper's `stylex.create` entry must survive so the
    // transformed `Container` still gets its mixin styles.
    const source = `
import styled, { css } from "styled-components";

const sharedReset = css\`
  box-sizing: border-box;
\`;

const Container = styled.div\`
  \${sharedReset}
  padding: 12px;
\`;

const Complex = styled.nav\`
  color: rebeccapurple;

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const result = runPartial(source, "partial-sharedMixin.input.tsx");

    expect(result.code).not.toBeNull();
    // Container transforms — its mixin reference compiled into the shared helper's
    // style entry, and `collectOwnedDeclStyleKeys` doesn't delete keys referenced
    // by non-skipped decls even though Complex (skipped) conceptually also
    // referenced the reset helper.
    expect(result.code).toMatch(/container:\s*\{/);
    expect(result.code).toMatch(/boxSizing:\s*["']border-box["']/);
    // Complex stays as styled-components since its descendant selector can't lower.
    expect(result.code).toMatch(/const\s+Complex\s*=\s*styled\.nav`/);
  });

  it("falls back to stylexStyles when the existing stylex.create name is shadowed by a nested binding", () => {
    // The top-level `const styles = stylex.create({...})` name is shadowed by
    // a nested `const styles = ...` inside the component. Emitting `sx={styles.X}`
    // at that call site would bind to the inner variable — reject the merge.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Container = styled.div\`
  padding: 12px;
\`;

const styles = stylex.create({
  heading: { color: "navy" },
});

export const App = () => {
  const styles = { inline: true };
  return (
    <div>
      <Container data-inline={styles.inline}>c</Container>
    </div>
  );
};
`;
    const result = runPartial(source, "partial-shadowedStyles.input.tsx");

    expect(result.code).not.toBeNull();
    // Merge rejected → new declaration under `stylexStyles`.
    expect(result.code).toMatch(/const\s+stylexStyles\s*=\s*stylex\.create/);
    expect(result.code).toMatch(/sx=\{stylexStyles\.container\}/);
    // Existing `styles` is preserved as-is.
    expect(result.code).toMatch(/heading:\s*\{\s*color:\s*["']navy["']/);
  });

  it("falls back to stylexStyles when a new style key collides with an existing stylex.create key", () => {
    // The existing `styles.container` and our new entry would both be called
    // `container`. To avoid silently overwriting the user's styles, emit a
    // separate `stylexStyles` declaration instead of merging.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const Container = styled.div\`
  padding: 12px;
\`;

const styles = stylex.create({
  container: { color: "red" },
});

export const App = () => (
  <div>
    <Container>c</Container>
    <p {...stylex.props(styles.container)}>existing</p>
  </div>
);
`;
    const result = runPartial(source, "partial-keyCollision.input.tsx");

    expect(result.code).not.toBeNull();
    // A second `stylex.create` declaration is emitted under a different name.
    expect(result.code).toMatch(/const\s+stylexStyles\s*=\s*stylex\.create/);
    expect(result.code).toMatch(/sx=\{stylexStyles\.container\}/);
    // Existing `styles` is preserved as-is.
    expect(result.code).toMatch(/container:\s*\{\s*color:\s*["']red["']/);
  });

  it("bails the whole file when a `css` helper decl cannot be lowered", () => {
    // `css\`\`` helpers are extracted (and removed from the source) before lowering.
    // If the helper itself fails to lower, its declaration is gone and any consumer
    // would dangle — so the whole file must bail rather than emit broken output.
    const source = `
import styled, { css } from "styled-components";

const hoverStyles = css\`
  & a.active {
    color: tomato;
  }
\`;

const Container = styled.div\`
  padding: 12px;
\`;

const Complex = styled.nav\`
  \${hoverStyles}
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const result = runPartial(source, "partial-cssHelper.input.tsx");

    expect(result.code).toBeNull();
  });

  it("bails the whole file when a leaf converts but its non-leaf base is skipped", () => {
    // `Base` carries an unsupported descendant selector and stays as styled-components.
    // `Derived` is simple and would convert to StyleX. That direction is unsafe:
    // the StyleX leaf's overrides can lose to the base's later-injected
    // styled-components CSS depending on property overlap. Bail.
    const source = `
import styled from "styled-components";

const Base = styled.div\`
  color: navy;

  & a.active {
    color: gold;
  }
\`;

const Derived = styled(Base)\`
  color: red;
  padding: 16px;
\`;

export const App = () => (
  <div>
    <Base><a className="active">b</a></Base>
    <Derived>d</Derived>
  </div>
);
`;
    const result = runPartial(source, "partial-cascade.input.tsx");

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(
      "Partial transform would have a StyleX leaf wrap a styled-components base — the extending component was transformed but its base was not, so the leaf's StyleX overrides cannot reliably beat the base's styled-components styles",
    );
  });

  it("allows the reverse direction: non-leaf base converts while the leaf stays as styled-components", () => {
    // `Derived` has an unsupported selector and stays as styled-components.
    // `Base` is simple and converts to StyleX. styled-components injects its
    // class AFTER StyleX's precompiled atomic CSS, so the leaf's overrides
    // still win. Base must be emitted as a wrapper so `styled(Base)` in the
    // preserved leaf still has a callable React component to reference.
    const source = `
import styled from "styled-components";

const Base = styled.div\`
  color: navy;
  padding: 8px;
\`;

const Derived = styled(Base)\`
  color: tomato;

  & a.active {
    color: gold;
  }
\`;

export const App = () => (
  <div>
    <Base>b</Base>
    <Derived><a className="active">d</a></Derived>
  </div>
);
`;
    const result = runPartial(source, "partial-nonleafBase.input.tsx");

    expect(result.code).not.toBeNull();
    // Base converts to a wrapper function (not inlined) so `styled(Base)` works.
    expect(result.code).toMatch(/function\s+Base\s*</);
    // Derived stays as styled-components and references the Base wrapper.
    expect(result.code).toMatch(/const\s+Derived\s*=\s*styled\(Base\)`/);
  });

  it("preserves converted candidates referenced by a skipped styled template", () => {
    const { input, output } = readTestCase("partial-componentSelectorReference");

    const result = runPartial(input, "partial-componentSelectorReference.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toBe(output);
    expect(result.code).toMatch(/const\s+ConvertedChild\s*=\s*styled\.span`/);
    expect(result.code).toContain("&:hover ${ConvertedChild}");
  });

  it("bails the whole file by default when a decl cannot be lowered (allowPartialMigration: false)", () => {
    // Default behavior matches the pre-flag semantics: any per-decl bail
    // escalates to a whole-file bail unless `allowPartialMigration: true` is
    // explicitly passed.
    const source = `
import styled from "styled-components";

const Container = styled.div\`
  padding: 12px;
\`;

const Complex = styled.nav\`
  & a.active { color: tomato; }
\`;

export const App = () => (
  <div>
    <Container>c</Container>
    <Complex><a className="active">x</a></Complex>
  </div>
);
`;
    const defaultResult = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-defaultBail.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(defaultResult.code).toBeNull();

    // Same source with the flag explicitly enabled produces partial output.
    const partialResult = runPartial(source, "partial-defaultBail.input.tsx");
    expect(partialResult.code).not.toBeNull();
    expect(partialResult.code).toMatch(/const\s+Complex\s*=\s*styled\.nav`/);
  });

  it("bails by default when an empty custom call wrapper must be preserved", () => {
    const source = readFileSync(
      join(testCasesDir, "partial-generatedBaseReference.input.tsx"),
      "utf-8",
    );

    const defaultResult = transformWithWarnings(
      { source, path: join(testCasesDir, "partial-generatedBaseReference.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(defaultResult.code).toBeNull();

    const partialResult = runPartial(source, "partial-generatedBaseReference.input.tsx");
    expect(partialResult.code).not.toBeNull();
    expect(partialResult.code).toMatch(/export const Notice = styled\(\s*observe/);
  });

  it("preserves styled imports for shadowed uncollected styled templates", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

function observe<P extends object>(Component: React.ComponentType<P>): React.ComponentType<P> {
  return Component;
}

export const Notice = styled.div\`
  padding: 8px;
\`;

export function makeNotice() {
  const Notice = styled(
    observe(function NoticeBase(props: { className?: string }) {
      return <div className={props.className} />;
    }),
  )\`\`;
  return Notice;
}

export const App = () => <Notice>outer</Notice>;
`;

    const result = runPartial(source, "partial-shadowedGeneratedBaseReference.input.tsx");

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/import\s+styled\s+from\s+["']styled-components["']/);
    expect(result.code).toMatch(/const\s+Notice\s*=\s*styled\(\s*observe/);
  });
});

describe("keyframes alias handling", () => {
  it("emits generated keyframes aliases next to local keyframes declarations", () => {
    const source = `
import styled, { keyframes } from "styled-components";

export function App() {
  const fade = keyframes\`
    from { opacity: 0; }
    to { opacity: 1; }
  \`;

  const Card = styled.div\`
    animation: \${fade} 1s linear;
    padding: 8px;
  \`;

  const Preserved = styled.span\`
    animation: \${fade} 2s linear;

    & a.active {
      color: tomato;
    }
  \`;

  return (
    <Card>
      <Preserved>
        <a className="active">preserved</a>
      </Preserved>
    </Card>
  );
}
`;

    const filePath = pathResolve(join(__dirname, "virtual-local-keyframes-alias.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+fade\s*=\s*keyframes`/);
    expect(result.code).toMatch(/const\s+fadeStylex\s*=\s*stylex\.keyframes/);
    expect(result.code).toMatch(/animationName:\s*fadeStylex/);
    expect(result.code).toMatch(/animation:\s*\$\{fade\}\s*2s linear/);
  });

  it("does not reuse existing bindings for generated keyframes aliases", () => {
    const source = `
import styled, { keyframes } from "styled-components";

const fadeStylex = "already used";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

const Preserved = styled.span\`
  animation: \${fade} 2s linear;

  & a.active {
    color: tomato;
  }
\`;

export const App = () => (
  <Card>
    <Preserved>
      <a className="active">{fadeStylex}</a>
    </Preserved>
  </Card>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-colliding-keyframes-alias.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+fadeStylex\s*=\s*"already used"/);
    expect(result.code).toMatch(/const\s+fadeStylex2\s*=\s*stylex\.keyframes/);
    expect(result.code).toMatch(/animationName:\s*fadeStylex2/);
    expect(result.code).toMatch(/animation:\s*\$\{fade\}\s*2s linear/);
  });

  it("does not collapse user-authored stylex.keyframes bindings that look like generated aliases", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

const fadeStylex = stylex.keyframes({
  from: { opacity: 0.4 },
  to: { opacity: 1 },
});

const manualStyles = stylex.create({
  manual: {
    animationName: fadeStylex,
    animationDuration: "3s",
  },
});

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

export const App = () => (
  <>
    <Card>card</Card>
    <div sx={manualStyles.manual}>manual</div>
  </>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-user-authored-stylex-alias.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("const fadeStylex = stylex.keyframes");
    expect(result.code).toMatch(/animationName:\s*fadeStylex/);
  });

  it("does not rename nested bindings that share a keyframes alias name", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

const fadeStylex = stylex.keyframes({
  from: { opacity: 0.4 },
  to: { opacity: 1 },
});

function readNestedAlias() {
  const fadeStylex = "nested";
  return fadeStylex;
}

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

export const App = () => (
  <>
    <Card>card</Card>
    <span>{readNestedAlias()}</span>
  </>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-nested-stylex-alias.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/const\s+fadeStylex\s*=\s*"nested"/);
    expect(result.code).toMatch(/return\s+fadeStylex/);
  });

  it("collapses only generated stylex keyframes alias references in the same scope", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

/* @styled-components-to-stylex generated keyframes alias */
const fadeStylex = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const manualStyles = stylex.create({
  manual: {
    animationName: fadeStylex,
    animationDuration: "3s",
  },
});

function readNestedAlias() {
  const fadeStylex = "nested";
  return fadeStylex;
}

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

export const App = () => (
  <>
    <Card>card</Card>
    <div sx={manualStyles.manual}>{readNestedAlias()}</div>
  </>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-generated-stylex-alias.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toContain("const fadeStylex = stylex.keyframes");
    expect(result.code).toMatch(/animationName:\s*fade/);
    expect(result.code).toMatch(/const\s+fadeStylex\s*=\s*"nested"/);
    expect(result.code).toMatch(/return\s+fadeStylex/);
  });

  it("does not rename object property keys that match a generated keyframes alias", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

/* @styled-components-to-stylex generated keyframes alias */
const fadeStylex = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const lookup = {
  fadeStylex: "preserve key shape",
};

const manualStyles = stylex.create({
  manual: {
    animationName: fadeStylex,
    animationDuration: "3s",
  },
});

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

export const App = () => (
  <>
    <Card>card</Card>
    <div sx={manualStyles.manual}>{lookup.fadeStylex}</div>
  </>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-generated-stylex-alias-key.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toContain("const fadeStylex = stylex.keyframes");
    expect(result.code).toMatch(/animationName:\s*fade/);
    expect(result.code).toMatch(/fadeStylex:\s*"preserve key shape"/);
    expect(result.code).toMatch(/lookup\.fadeStylex/);
  });

  it("preserves shorthand object keys that reference a generated keyframes alias", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

/* @styled-components-to-stylex generated keyframes alias */
const fadeStylex = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const lookup = {
  fadeStylex,
};

const manualStyles = stylex.create({
  manual: {
    animationName: fadeStylex,
    animationDuration: "3s",
  },
});

const Card = styled.div\`
  animation: \${fade} 1s linear;
  padding: 8px;
\`;

export const App = () => (
  <>
    <Card>card</Card>
    <div sx={manualStyles.manual}>{lookup.fadeStylex}</div>
  </>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-generated-stylex-alias-shorthand.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    expect(result.code).not.toContain("const fadeStylex = stylex.keyframes");
    expect(result.code).toMatch(/animationName:\s*fade/);
    expect(result.code).toMatch(/fadeStylex:\s*fade/);
    expect(result.code).toMatch(/lookup\.fadeStylex/);
  });

  it("ignores nested stylex.keyframes bindings when collecting keyframe names", () => {
    // A nested `const fade = stylex.keyframes(...)` inside a function body must not
    // be added to `ctx.keyframesNames`. Animation lowering only resolves identifiers
    // by name, so collecting nested bindings would let a module-level `fade`
    // binding (which is NOT a keyframe) be misinterpreted as one when a styled
    // template interpolates `${fade}` in an `animation` shorthand.
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

function Plain(props: any) {
  return <div {...props} />;
}

// Module-level binding — a plain string, NOT a keyframe.
const fade = "spin 1s linear";

function helper() {
  // Nested binding shadows the module-level \`fade\`. Restricted to this
  // function — must not pollute the module-level keyframesNames set.
  const fade = stylex.keyframes({
    from: { opacity: 0 },
    to: { opacity: 1 },
  });
  return fade;
}

const Inner = styled(Plain)\`
  animation: \${fade} 2s linear;
  color: navy;
\`;

export const App = () => (
  <div>
    <Inner>inner</Inner>
    {helper()}
  </div>
);
`;

    const filePath = pathResolve(join(__dirname, "virtual-nested-keyframes-binding.tsx"));
    const result = runTransformWithDiagnostics(source, { allowPartialMigration: true }, filePath);

    // The interpolated `${fade}` here resolves to the module-level string binding,
    // not a keyframe. The codemod must NOT emit `animationName: fade` based on
    // the nested keyframes binding (which is out of scope at the styled template).
    expect(result.code ?? "").not.toMatch(/animationName:\s*fade\b/);
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
    ({ name, inputPath, outputPath }) => {
      const { output } = readTestCase("", inputPath, outputPath);
      // Allow imports of useTheme, withTheme, ThemeProvider etc. that aren't transformed
      // But disallow imports of styled, css, keyframes, createGlobalStyle
      const disallowedImports = styledComponentsDisallowedImports(name);
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
  it("uses prepass prop values to emit observed unitless numeric identity variants", () => {
    const input = `
import styled from "styled-components";

export const Panel = styled.div<{ opacity: number }>\`
  opacity: \${({ opacity }) => opacity};
  background-color: tomato;
\`;

export const App = () => (
  <div>
    <Panel opacity={0.4}>Dim</Panel>
    <Panel opacity={0.8}>Bright</Panel>
  </div>
);
`;
    const result = runTransform(
      input,
      {
        crossFileInfo: {
          selectorUsages: [],
          propUsageByComponent: new Map([
            [
              "Panel",
              {
                componentName: "Panel",
                usageCount: 2,
                hasUnknownUsage: false,
                props: {
                  opacity: {
                    values: [0.4, 0.8],
                    hasUnknown: false,
                    usageCount: 2,
                    omittedCount: 0,
                  },
                },
              },
            ],
          ]),
        },
      },
      "observed-variants.tsx",
    );

    expect(result).toContain(
      "opacityVariants[opacity as keyof typeof opacityVariants] ?? styles.panelOpacity(opacity)",
    );
    expect(result).toContain("0.4: {");
    expect(result).toContain("0.8: {");
    expect(result).toContain("panelOpacity: (");
  });

  it("uses prepass prop values to emit observed transient unitless numeric identity variants", () => {
    const input = `
import styled from "styled-components";

export const Panel = styled.div<{ $opacity: number }>\`
  opacity: \${({ $opacity }) => $opacity};
  background-color: tomato;
\`;

export const App = () => (
  <div>
    <Panel $opacity={0.4}>Dim</Panel>
    <Panel $opacity={0.8}>Bright</Panel>
  </div>
);
`;
    const diagnostics = runTransformWithDiagnostics(
      input,
      {
        crossFileInfo: {
          selectorUsages: [],
          propUsageByComponent: new Map([
            [
              "Panel",
              {
                componentName: "Panel",
                usageCount: 2,
                hasUnknownUsage: false,
                props: {
                  $opacity: {
                    values: [0.4, 0.8],
                    hasUnknown: false,
                    usageCount: 2,
                    omittedCount: 0,
                  },
                },
              },
            ],
          ]),
        },
      },
      "observed-transient-variants.tsx",
    );
    const result = diagnostics.code ?? "";

    expect(result).toContain(
      "opacityVariants[opacity as keyof typeof opacityVariants] ?? styles.panelOpacity(opacity)",
    );
    expect(result).toContain("0.4: {");
    expect(result).toContain("0.8: {");
    expect(result).not.toContain("$opacity");
    expect(result).toContain("panelOpacity: (");
    expect(diagnostics.transientPropRenames).toEqual([
      {
        exportName: "Panel",
        renames: { $opacity: "opacity" },
      },
    ]);
  });

  it("uses same-file JSX prop values to emit observed unitless numeric identity variants without prepass", () => {
    const input = `
import styled from "styled-components";

const dynamicOpacity = 1;

export const Panel = styled.div<{ opacity: number }>\`
  opacity: \${({ opacity }) => opacity};
  background-color: tomato;
\`;

export const App = () => (
  <div>
    <Panel opacity={0.4}>Dim</Panel>
    <Panel opacity={0.8}>Bright</Panel>
    <Panel opacity={dynamicOpacity}>Dynamic</Panel>
  </div>
);
`;
    const result = runTransform(input, {}, "local-observed-variants.tsx");

    expect(result).toContain(
      "opacityVariants[opacity as keyof typeof opacityVariants] ?? styles.panelOpacity(opacity)",
    );
    expect(result).toContain("0.4: {");
    expect(result).toContain("0.8: {");
    expect(result).toContain("panelOpacity: (");
  });

  it("adds a runtime fallback for transformed observed variant buckets", () => {
    const input = `
import styled from "styled-components";

function toGap(size: string): string {
  return size === "lg" ? "16px" : "8px";
}

export const Stack = styled.div<{ size: string }>\`
  gap: \${(props) => toGap(props.size)};
  display: flex;
\`;

export const App = () => (
  <div>
    <Stack size="sm">Small</Stack>
    <Stack size="lg">Large</Stack>
  </div>
);
`;
    const result = runTransform(input, {}, "observed-transformed-variants.tsx");

    expect(result).toContain(
      "sizeVariants[size as keyof typeof sizeVariants] ?? styles.stackSize(size)",
    );
    expect(result).toContain("sm: {");
    expect(result).toContain("lg: {");
    expect(result).toContain("styles.stackSize(size)");
    expect(result).toContain("gap: toGap(size)");
  });

  it("does not bucket an exported component's observed CSS block (would drop unobserved values)", () => {
    const input = `
import styled from "styled-components";

const getSize = (size?: number | string) =>
  !size || typeof size === "number" ? \`\${size}px\` : size;
const showProperty = (size?: number | string) => !!size || size === 0;

export const Spacer = styled.div<{ width?: number | string }>\`
  \${(props) => (showProperty(props.width) ? \`width: \${getSize(props.width)}\` : "")};
\`;

export const App = () => (
  <div>
    <Spacer width={100} />
    <Spacer width={50} />
    <Spacer />
  </div>
);
`;
    const result = runTransform(input, {}, "observed-css-block-exported.tsx");

    // Exported: an external <Spacer width={42}> is not observable, so static-only buckets would
    // resolve to undefined and lose styling. Keep the dynamic style function instead.
    expect(result).not.toContain("widthVariants[");
    expect(result).toContain("getSize(width)");
  });

  it("buckets a private component's observed CSS block (all call sites observable)", () => {
    const input = `
import styled from "styled-components";

const getSize = (size?: number | string) =>
  !size || typeof size === "number" ? \`\${size}px\` : size;
const showProperty = (size?: number | string) => !!size || size === 0;

const Spacer = styled.div<{ width?: number | string }>\`
  \${(props) => (showProperty(props.width) ? \`width: \${getSize(props.width)}\` : "")};
\`;

export const App = () => (
  <div>
    <Spacer width={100} />
    <Spacer width={50} />
    <Spacer />
  </div>
);
`;
    const result = runTransform(input, {}, "observed-css-block-private.tsx");

    // Private: every call site is observable, so static buckets are safe.
    expect(result).toContain("widthVariants[");
    expect(result).toContain("100: {");
    expect(result).toContain("50: {");
  });

  it("does not bucket a private component that escapes as a value", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const getSize = (size?: number | string) =>
  !size || typeof size === "number" ? \`\${size}px\` : size;
const showProperty = (size?: number | string) => !!size || size === 0;

const Spacer = styled.div<{ width?: number | string }>\`
  \${(props) => (showProperty(props.width) ? \`width: \${getSize(props.width)}\` : "")};
\`;

function List(props: { itemComponent: React.ElementType }) {
  const Item = props.itemComponent;
  return <Item />;
}

export const App = () => (
  <div>
    <Spacer width={100} />
    <Spacer width={50} />
    <Spacer />
    <List itemComponent={Spacer} />
  </div>
);
`;
    const result = runTransform(input, {}, "observed-css-block-escapes.tsx");

    // Passed to itemComponent: a host could render <Spacer width={42}>, which is unobserved.
    expect(result).not.toContain("widthVariants[");
    expect(result).toContain("getSize(width)");
  });

  it("keeps the wrapper for a member-base styled component that escapes as a value", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";
import { animated } from "./lib/react-spring";

const Box = styled(animated.div)\`
  color: red;
\`;

function Picker(props: { optionComponent: React.ElementType }) {
  const Option = props.optionComponent;
  return <Option />;
}

export const App = () => (
  <div>
    <Box />
    <Picker optionComponent={Box} />
  </div>
);
`;
    const result = runTransform(input, {}, "member-base-escapes.tsx");

    // Box is rendered once in JSX but also passed as a value, so its wrapper must not be inlined
    // away — otherwise optionComponent={Box} would dangle.
    expect(result).toContain("optionComponent={Box}");
    expect(result).toContain("<Box");
  });

  it("adds a runtime fallback for observed expression variant buckets", () => {
    const input = `
import styled from "styled-components";

export const Badge = styled.div<{ active?: boolean; color: string }>\`
  color: \${(props) => props.active ? "red" : props.color};
\`;

export const App = () => (
  <div>
    <Badge color="blue">Blue</Badge>
    <Badge color="green">Green</Badge>
  </div>
);
`;
    const result = runTransform(input, {}, "observed-expression-variants.tsx");

    // Now that simple guards are recognized, variants are grouped into a dimension
    // with a fallback function for runtime values not observed in JSX
    expect(result).toContain("!active && badgeColorVariants[color]");
    expect(result).toContain("!active && styles.badgeColor(color)");
    expect(result).toContain("color: color");
  });

  it("keeps separate observed expression fallbacks for distinct guards on the same prop", () => {
    const input = `
import styled from "styled-components";

export const Badge = styled.div<{ active?: boolean; highlighted?: boolean; color: string }>\`
  color: \${(props) => props.active ? "red" : props.color};
  background-color: \${(props) => props.highlighted ? props.color : "white"};
\`;

export const App = () => (
  <div>
    <Badge color="blue">Blue</Badge>
    <Badge color="green" highlighted>Green</Badge>
  </div>
);
`;
    const result = runTransform(input, {}, "observed-expression-distinct-guards.tsx");

    expect(result).toContain("!active && styles.badgeColor(color)");
    expect(result).toContain("highlighted && styles.badgeColorHighlighted(color)");
    expect(result).toContain("badgeColor: (");
    expect(result).toContain("color: color");
    expect(result).toContain("badgeColorHighlighted: (");
    expect(result).toContain("backgroundColor: color");
  });

  it("does not forward observed expression condition props to unresolved component bases", () => {
    const input = `
import styled from "styled-components";
import { Base } from "./Base";

export const Badge = styled(Base)<{ active?: boolean; color: string }>\`
  color: \${(props) => props.active ? "red" : props.color};
\`;

export const App = () => (
  <div>
    <Badge color="blue">Blue</Badge>
    <Badge color="green">Green</Badge>
  </div>
);
`;
    const result = runTransform(input, {}, "observed-expression-condition-drop.tsx");

    expect(result).toContain("active,");
    expect(result).toContain("!active && styles.badgeColor(props.color)");
    expect(result).not.toContain("active={active}");
  });

  it("forwards non-transient observed variant props to wrapped components", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

function Base(props: { tone: string; className?: string; children?: React.ReactNode }) {
  return <div className={props.className} data-tone={props.tone}>{props.children}</div>;
}

export const Badge = styled(Base)<{ tone: string }>\`
  color: \${(props) => props.tone};
\`;

export const App = () => (
  <div>
    <Badge tone="red">Red</Badge>
    <Badge tone="blue">Blue</Badge>
  </div>
);
`;
    const result = runTransform(input, {}, "observed-component-prop-forward.tsx");

    expect(result).toContain(
      "toneVariants[tone as keyof typeof toneVariants] ?? styles.badgeTone(tone)",
    );
    expect(result).toContain("tone={tone}");
  });

  it("falls back to runtime css helper conditionals when observed values are not exhaustive", () => {
    const input = `
import styled from "styled-components";

const getTone = (tone: string) => tone;
const hasTone = (tone: string) => !!tone;

export const Badge = styled.div<{ tone: string }>\`
  \${(props) => (hasTone(props.tone) ? \`color: \${getTone(props.tone)}\` : "")};
\`;

export const App = () => (
  <div>
    <Badge tone="red">Red</Badge>
    <Badge tone="blue">Blue</Badge>
  </div>
);
`;
    const result = runTransform(input, {}, "css-helper-observed-nonexhaustive.tsx");

    expect(result).toContain("hasTone(tone) ? styles.");
    expect(result).toContain("color: getTone(tone)");
    expect(result).not.toContain("toneVariants");
  });

  it("uses same-file transient prop values to emit observed unitless numeric identity variants without prepass", () => {
    const input = `
import styled from "styled-components";

export const Panel = styled.div<{ $opacity: number }>\`
  opacity: \${({ $opacity }) => $opacity};
  background-color: tomato;
\`;

export const App = () => (
  <div>
    <Panel $opacity={0.4}>Dim</Panel>
    <Panel $opacity={0.8}>Bright</Panel>
  </div>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "local-observed-transient.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain(
      "opacityVariants[opacity as keyof typeof opacityVariants] ?? styles.panelOpacity(opacity)",
    );
    expect(result).toContain("0.4: {");
    expect(result).toContain("0.8: {");
    expect(result).not.toContain("$opacity");
    expect(diagnostics.transientPropRenames).toEqual([
      {
        exportName: "Panel",
        renames: { $opacity: "opacity" },
      },
    ]);
  });

  it("does not emit numeric variants without observed consumer prop values", () => {
    const input = `
import styled from "styled-components";

export const Panel = styled.div<{ height: 40 | 80 }>\`
  height: \${({ height }) => height};
  background-color: tomato;
\`;
`;
    const result = runTransform(input, {}, "unobserved-numeric-variants.tsx");

    expect(result).toContain("panel: (height: 40 | 80) =>");
    expect(result).toContain("styles.panel(height)");
    expect(result).not.toContain("heightVariants");
  });

  it("does not emit JSX into .ts, .mts, or .cts files", () => {
    const input = `
import styled from "styled-components";

export const Label = styled.span\`
  color: tomato;
\`;
`;
    for (const filename of ["styledExports.ts", "styledExports.mts", "styledExports.cts"]) {
      const diagnostics = runTransformWithDiagnostics(input, {}, filename, "ts");
      expect(diagnostics.code).toBeNull();
    }
  });

  it("does not copy styled-components RuleSet helper calls into sx", () => {
    const input = `
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

const MaskedPanel = styled.div\`
  \${scrollFadeMaskStyles(12)}
  overflow: hidden;
\`;

export const App = () => <MaskedPanel>Masked</MaskedPanel>;
`;
    const adapter: Adapter = {
      ...fixtureAdapter,
      resolveCall(ctx) {
        if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
          return {
            usage: "props",
            expr: "scrollFadeMaskStyles(12)",
            imports: [],
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    };
    const diagnostics = transformWithWarnings(
      { source: input, path: join(testCasesDir, "css-helper-ruleset-copy.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter },
    );

    expect(diagnostics.code).toBeNull();
  });

  it("does not copy aliased styled-components RuleSet helper calls into sx", () => {
    const input = `
import styled from "styled-components";
import { scrollFadeMaskStyles as mask } from "./lib/helpers";

const MaskedPanel = styled.div\`
  \${mask(12)}
  overflow: hidden;
\`;

export const App = () => <MaskedPanel>Masked</MaskedPanel>;
`;
    const adapter: Adapter = {
      ...fixtureAdapter,
      resolveCall(ctx) {
        if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
          return {
            usage: "props",
            expr: "mask(12)",
            imports: [],
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    };
    const diagnostics = transformWithWarnings(
      { source: input, path: join(testCasesDir, "css-helper-ruleset-copy.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter },
    );

    expect(diagnostics.code).toBeNull();
  });

  it("does not copy member styled-components RuleSet helper calls into sx", () => {
    const input = `
import styled from "styled-components";
import { helpers } from "./lib/helpers";

const MaskedPanel = styled.div\`
  \${helpers.scrollFadeMaskStyles(12)}
  overflow: hidden;
\`;

export const App = () => <MaskedPanel>Masked</MaskedPanel>;
`;
    const adapter: Adapter = {
      ...fixtureAdapter,
      resolveCall(ctx) {
        if (
          ctx.calleeImportedName === "helpers" &&
          ctx.calleeMemberPath?.join(".") === "scrollFadeMaskStyles"
        ) {
          return {
            usage: "props",
            expr: "helpers.scrollFadeMaskStyles(12)",
            imports: [],
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    };
    const diagnostics = transformWithWarnings(
      { source: input, path: join(testCasesDir, "css-helper-ruleset-copy.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter },
    );

    expect(diagnostics.code).toBeNull();
  });

  it("does not copy reimported styled-components RuleSet helper calls into sx", () => {
    const input = `
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

const MaskedPanel = styled.div\`
  \${scrollFadeMaskStyles(10, "both")}
  overflow: hidden;
\`;

export const App = () => <MaskedPanel>Masked</MaskedPanel>;
`;
    const adapter: Adapter = {
      ...fixtureAdapter,
      resolveCall(ctx) {
        if (ctx.calleeImportedName === "scrollFadeMaskStyles") {
          return {
            usage: "props",
            expr: 'scrollFadeMaskStyles(10, "both")',
            imports: [
              {
                from: { kind: "specifier", value: "./lib/helpers" },
                names: [{ imported: "scrollFadeMaskStyles" }],
              },
            ],
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    };
    const diagnostics = transformWithWarnings(
      { source: input, path: join(testCasesDir, "css-helper-ruleset-copy.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter },
    );

    expect(diagnostics.code).toBeNull();
  });

  it("does not rename transient props on unrelated JSX member expressions", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const Other = {
  Grid(props: { $active?: boolean; children?: React.ReactNode }) {
    return <section>{props.children}</section>;
  },
};

export namespace WidgetSet {
  type GridProps = {
    $active?: boolean;
  };

  export const Grid = styled.div<GridProps>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

export const App = () => (
  <>
    <WidgetSet.Grid $active>Styled grid</WidgetSet.Grid>
    <Other.Grid $active>Other grid</Other.Grid>
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-member-transient.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("<WidgetSet.Grid active>");
    expect(result).toContain("<Other.Grid $active>");
  });

  it("does not rename transient props when a nested scope shadows the namespace binding", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const Other = {
  Grid(props: { $active?: boolean; children?: React.ReactNode }) {
    return <section>{props.children}</section>;
  },
};

export namespace WidgetSet {
  type GridProps = {
    $active?: boolean;
  };

  export const Grid = styled.div<GridProps>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

function ShadowingX() {
  const WidgetSet = Other;
  return <WidgetSet.Grid $active>Shadowed grid</WidgetSet.Grid>;
}

export const App = () => (
  <>
    <WidgetSet.Grid $active>Styled grid</WidgetSet.Grid>
    <ShadowingX />
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-shadowed.tsx");
    const result = diagnostics.code ?? "";

    // Top-level JSX correctly resolves to the namespace's Grid → renamed.
    expect(result).toContain("<WidgetSet.Grid active>");
    // Shadowed JSX inside ShadowingX resolves to the local `WidgetSet = Other` → not renamed.
    expect(result).toContain("$active>Shadowed grid");
  });

  it("does not rename transient props when a destructured binding shadows the namespace", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const Other = {
  Grid(props: { $active?: boolean; children?: React.ReactNode }) {
    return <section>{props.children}</section>;
  },
};

export namespace WidgetSet {
  export const Grid = styled.div<{ $active?: boolean }>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

function DestructuredShadowing(props: { WidgetSet: typeof Other }) {
  const { WidgetSet } = props;
  return <WidgetSet.Grid $active>Destructured shadow</WidgetSet.Grid>;
}

export const App = () => (
  <>
    <WidgetSet.Grid $active>Styled grid</WidgetSet.Grid>
    <DestructuredShadowing WidgetSet={Other} />
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-destructured.tsx");
    const result = diagnostics.code ?? "";

    // Top-level usage still resolves to namespace's Grid → renamed.
    expect(result).toContain("<WidgetSet.Grid active>");
    // Destructured-shadowed JSX resolves to the local destructured binding → not renamed.
    expect(result).toContain("$active>Destructured shadow");
  });

  it("does not rename a namespace-local styled when an `as`-renamed re-export aliases the name", () => {
    // `export { Other as Grid }` makes `<WidgetSet.Grid>` resolve to `Other`, not the
    // styled local `Grid` elsewhere in the file. The JSX rewrite must not rename the
    // unrelated component's transient props.
    const input = `
import * as React from "react";
import styled from "styled-components";

const Grid = styled.div<{ $active?: boolean }>\`
  color: \${({ $active }) => ($active ? "green" : "gray")};
\`;

function Other(props: { $active?: boolean; children?: React.ReactNode }) {
  return <section>{props.children}</section>;
}

export namespace WidgetSet {
  export { Other as Grid };
}

export const App = () => (
  <>
    <Grid $active>Top-level grid</Grid>
    <WidgetSet.Grid $active>Aliased re-export</WidgetSet.Grid>
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-aliased-reexport.tsx");
    const result = diagnostics.code ?? "";

    // Top-level Grid (the styled one) was renamed.
    expect(result).toContain("<Grid active>Top-level grid");
    // WidgetSet.Grid is `Other`, an unrelated component → must not be renamed.
    expect(result).toContain("$active>Aliased re-export");
  });

  it("renames transient props for namespace export aliases and nested namespaces", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const Grid = styled.div<{ $active?: boolean }>\`
  color: \${({ $active }) => ($active ? "green" : "gray")};
\`;

export namespace WidgetSet {
  export { Grid as Renamed };
}

export namespace A {
  export namespace B {
    export const Grid = styled.div<{ $active?: boolean }>\`
      color: \${({ $active }) => ($active ? "green" : "gray")};
    \`;
  }
}

export const App = () => (
  <>
    <WidgetSet.Renamed $active>Aliased grid</WidgetSet.Renamed>
    <A.B.Grid $active>Nested grid</A.B.Grid>
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-alias-nested.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("<WidgetSet.Renamed active>");
    expect(result).toContain("<A.B.Grid active>");
    expect(result).not.toContain("$active>Aliased grid");
    expect(result).not.toContain("$active>Nested grid");
  });

  it("renames prop types declared in a parent namespace for nested-namespace styled components", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

export namespace A {
  type Props = {
    $active?: boolean;
  };

  export namespace B {
    export const Grid = styled.div<Props>\`
      color: \${({ $active }) => ($active ? "green" : "gray")};
    \`;
  }
}

export const App = () => <A.B.Grid>Nested</A.B.Grid>;
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-parent-type.tsx");
    const result = diagnostics.code ?? "";

    // Type declaration in the parent namespace was renamed alongside the wrapper —
    // before the fix the wrapper/style code renamed `$active` → `active` but the
    // parent-namespace `Props` declaration stayed `$active`, breaking type checking.
    expect(result).toContain("active?: boolean");
    expect(result).not.toContain("$active?: boolean");
  });

  it("resolves nested namespace prop types by full namespace path", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

export namespace C {
  export namespace B {
    type Props = {
      $unrelated?: boolean;
    };
  }
}

export namespace A {
  export namespace B {
    type Props = {
      $active?: boolean;
    };

    export const Grid = styled.div<Props>\`
      color: \${({ $active }) => ($active ? "green" : "gray")};
    \`;
  }
}

export const App = () => <A.B.Grid $active>Nested</A.B.Grid>;
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-full-path-type.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("$unrelated?: boolean");
    expect(result).toContain("active?: boolean");
    expect(result).toContain("<A.B.Grid active>");
    expect(result).not.toContain("$active?: boolean");
  });

  it("renames transient props for dotted namespace declarations", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

export namespace A.B {
  export const Grid = styled.div<{ $active?: boolean }>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

export const App = () => <A.B.Grid $active>Dotted namespace</A.B.Grid>;
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-dotted.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("<A.B.Grid active>");
    expect(result).not.toContain("$active>Dotted namespace");
  });

  it("does not match same-named namespace exports from unrelated declarations", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

const Other = {
  Grid(props: { $active?: boolean; children?: React.ReactNode }) {
    return <section>{props.children}</section>;
  },
};

export namespace A {
  export const Grid = Other.Grid;
}

export namespace B {
  export const Grid = styled.div<{ $active?: boolean }>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

export const App = () => (
  <>
    <A.Grid $active>Other grid</A.Grid>
    <B.Grid $active>Styled grid</B.Grid>
  </>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-unrelated-export.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("<A.Grid $active>Other grid");
    expect(result).toContain("<B.Grid active>Styled grid");
  });

  it("does not rename a namespace-local type referenced from a nested namespace", () => {
    // Type `Props` is declared in namespace `A` alongside styled `Button`. A nested
    // namespace `Docs` initializes `Props` with `$active`. The codemod must treat
    // `Props` as shared (not just owned by `Button`) so the rename is skipped.
    const input = `
import styled from "styled-components";

export namespace A {
  type Props = { $active?: boolean };
  export const Button = styled.div<Props>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
  export namespace Docs {
    export const p: Props = { $active: true };
  }
}

export const App = () => <A.Button $active>Btn</A.Button>;
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-nested-usage.tsx");
    const result = diagnostics.code ?? "";

    // Shared-type guard fired: $active is preserved everywhere.
    expect(result).toContain("$active?: boolean");
    expect(result).toContain("$active: true");
    expect(result).toContain("<A.Button $active>");
  });

  it("does not collect transient props from same-named types outside the namespace", () => {
    const input = `
import * as React from "react";
import styled from "styled-components";

type GridProps = {
  $unrelated?: boolean;
};

export namespace WidgetSet {
  type GridProps = {
    $active?: boolean;
  };

  export const Grid = styled.div<GridProps>\`
    color: \${({ $active }) => ($active ? "green" : "gray")};
  \`;
}

export const unrelatedProps: GridProps = { $unrelated: true };
export const App = () => <WidgetSet.Grid $active>Styled grid</WidgetSet.Grid>;
`;
    const diagnostics = runTransformWithDiagnostics(input, {}, "namespace-member-transient.tsx");
    const result = diagnostics.code ?? "";

    expect(result).toContain("$unrelated?: boolean");
    expect(result).toContain("export const unrelatedProps: GridProps = { $unrelated: true };");
    expect(result).toContain("active?: boolean");
    expect(result).not.toContain("  unrelated?: boolean;");
    expect(result).not.toContain("$active?: boolean");
  });

  it("emits exported css helper styles when the helper is mixed into converted styles", () => {
    const input = `
import styled, { css } from "styled-components";

export const exportedMixin = css\`
  color: tomato;
\`;

const Box = styled.div\`
  \${exportedMixin}
  padding: 8px;
\`;

export const App = () => <Box>Mixed</Box>;
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(result).toContain("export const exportedMixin = css");
    expect(result).toContain("exportedMixin:");
    expect(result).toContain("sx={[styles.box, styles.exportedMixin]}");
  });

  it("preserves css helpers referenced by skipped imported component roots during partial migration", () => {
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const titleMixin = css\`
  font-weight: 600;
\`;

const Notice = styled.div\`
  padding: 8px;
\`;

const Title = styled(Text)\`
  \${titleMixin}
  color: #1d4ed8;
\`;

Title.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => (
  <Notice>
    <Title>Imported root with helper</Title>
  </Notice>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    expect(result).toContain("const titleMixin = css");
    expect(result).toContain("const Title = styled(Text)");
    expect(result).toContain("<div sx={styles.notice}>");
  });

  it("preserves exported css helpers with selectors for skipped imported roots", () => {
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const Title = styled(Text)\`
  color: #1d4ed8;
\`;

export const titleSelectorCss = css\`
  \${Title} {
    font-weight: 600;
  }
\`;

const Notice = styled.div\`
  padding: 8px;
\`;

export const App = () => (
  <Notice>
    <Title>Imported root selector helper</Title>
  </Notice>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    expect(result).toContain("export const titleSelectorCss = css");
    expect(result).toContain("${Title}");
    expect(result).toContain("const Title = styled(Text)");
    expect(result).toContain("<div sx={styles.notice}>");
    expect(result).not.toContain("titleSelectorCss:");
  });

  it("emits css helper styles when the helper is referenced by both a converted component and a skipped imported root", () => {
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const sharedMixin = css\`
  font-weight: 600;
\`;

const Notice = styled.div\`
  \${sharedMixin}
  padding: 8px;
\`;

const Title = styled(Text)\`
  \${sharedMixin}
  color: #1d4ed8;
\`;

Title.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => (
  <Notice>
    <Title>Imported root with shared helper</Title>
  </Notice>
);
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    // Original helper declaration preserved for the skipped `styled(Text)` template.
    expect(result).toContain("const sharedMixin = css");
    // Skipped `styled(Text)` stays as-is and still references `sharedMixin`.
    expect(result).toContain("const Title = styled(Text)");
    // Converted `Notice` references `styles.sharedMixin` — the stylex.create entry
    // must be emitted because the helper is an active mixin on a converted component.
    expect(result).toMatch(/sharedMixin:\s*\{/);
    expect(result).toContain("sx={[styles.notice, styles.sharedMixin]}");
  });

  it("preserves object-member css helpers referenced by skipped imported roots", () => {
    // `mixins.root` is an object-member css helper. The skipped `styled(Text)` template
    // still interpolates `${mixins.root}`, so the property must NOT be removed from the
    // object literal — otherwise the preserved template references `mixins.root` which
    // no longer exists.
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const mixins = {
  root: css\`
    font-weight: 600;
  \`,
};

const Title = styled(Text)\`
  \${mixins.root}
  color: #1d4ed8;
\`;

Title.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => <Title>Imported root with object-member helper</Title>;
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    // The object literal preserves the `root` property because the skipped template references it.
    expect(result).toMatch(/const\s+mixins\s*=\s*\{/);
    expect(result).toMatch(/root:\s*css`/);
    // The skipped `styled(Text)` template still uses `mixins.root`.
    expect(result).toContain("const Title = styled(Text)");
    expect(result).toContain("${mixins.root}");
  });

  it("does not preserve standalone helpers from imported-root member property names", () => {
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const root = css\`
  background-color: hotpink;
\`;

const mixins = {
  root: css\`
    font-weight: 600;
  \`,
};

const Title = styled(Text)\`
  \${mixins.root}
  color: #1d4ed8;
\`;

Title.defaultProps = {
  theme: { mode: "dark" },
};

export const App = () => <Title>Imported root with object-member helper</Title>;
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    expect(result).not.toContain("const root = css");
    expect(result).toMatch(/const\s+mixins\s*=\s*\{/);
    expect(result).toMatch(/root:\s*css`/);
    expect(result).toContain("${mixins.root}");
  });

  it("preserves computed object-member css helpers referenced by skipped imported roots", () => {
    const input = `
import styled, { css } from "styled-components";
import { Text } from "./lib/text";

const mixins = {
  root: css\`
    font-weight: 600;
  \`,
};

const Title = styled(Text)\`
  \${mixins["root"]}
  color: #1d4ed8;
\`;

export const App = () => <Title>Imported root with computed helper</Title>;
`;
    const diagnostics = runTransformWithDiagnostics(input, { allowPartialMigration: true });
    const result = diagnostics.code ?? "";

    expect(diagnostics.code).not.toBeNull();
    expect(result).toMatch(/const\s+mixins\s*=\s*\{/);
    expect(result).toMatch(/root:\s*css`/);
    expect(result).toContain('${mixins["root"]}');
  });

  it.each(fixtureCases)("$outputFile", async ({ name, inputPath, outputPath, parser }) => {
    const { input, output } = readTestCase(name, inputPath, outputPath);
    const crossFileInfo = getCrossFileInfo(inputPath, parser);
    const diagnostics = runTransformWithDiagnostics(
      input,
      { crossFileInfo, allowPartialMigration: isPartialFixture(name) },
      inputPath,
      parser,
    );
    const result = diagnostics.code || input;

    // Transform must produce a change - no bailing allowed
    // If it fails, show any warnings to help diagnose the issue (e.g., adapter not resolving)
    const normalizedResult = await normalizeCode(result, outputPath);
    const normalizedInput = await normalizeCode(input, inputPath);
    if (normalizedResult === normalizedInput && !PRESERVED_FIXTURES.has(name)) {
      const warningsInfo = diagnostics.warnings.length
        ? `\n\nTransform warnings that may explain the failure:\n${diagnostics.warnings.map((w) => `  - ${w.type}`).join("\n")}`
        : "";
      throw new Error(
        `Transform produced no changes (bailed or returned unchanged code).${warningsInfo}`,
      );
    }

    // Result must not import styled/css/keyframes/createGlobalStyle from styled-components
    // (but useTheme, withTheme, ThemeProvider etc. are allowed)
    const disallowedImports = styledComponentsDisallowedImports(name);
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

    // Verify sidecar marker content
    if (diagnostics.sidecarFiles && diagnostics.sidecarFiles.length > 0) {
      const sharedMarkersPath = join(testCasesDir, "markers.stylex.ts");
      const sharedMarkers = readFileSync(sharedMarkersPath, "utf-8");

      for (const sidecar of diagnostics.sidecarFiles) {
        const markerLines = sidecar.content
          .split("\n")
          .filter((line) => line.startsWith("export const"));
        expect(markerLines.length).toBeGreaterThan(0);

        if (sidecar.filePath) {
          // Cross-file markers: filePath points to the shared markers file
          for (const line of markerLines) {
            expect(sharedMarkers).toContain(line);
          }
          expect(sidecar.filePath).toBe(sharedMarkersPath);
        }
      }
    }
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

  it("should warn with correct line number for adjacent sibling selector", () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: red;

  & + span {
    margin-left: 8px;
  }
\`;

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    const warning = result.warnings.find(
      (w) => w.type === "Unsupported selector: adjacent sibling combinator",
    );
    expect(warning).toBeDefined();
    // Line 4 is template start, `& + span` is on line 7 (3 lines into template content)
    expect(warning?.loc?.line).toBe(7);
  });

  it("should bail instead of emitting unsupported all reset property", () => {
    const source = `
import styled from "styled-components";

const Option = styled.li\`
  all: unset;
  display: flex;
\`;

export const App = () => <Option>Option</Option>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(
      result.warnings.some((w) => String(w.type).includes('Unsupported CSS property "all"')),
    ).toBe(true);
  });

  it("should warn with correct line number for descendant/child/sibling selector", () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: red;

  a {
    text-decoration: none;
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
      (w) => w.type === "Unsupported selector: descendant/child/sibling selector",
    );
    expect(warning).toBeDefined();
    // Line 4 is template start, `a {` is on line 7 (3 lines into template content)
    expect(warning?.loc?.line).toBe(7);
  });

  it("should warn with correct line number for imported css helper mixin interpolation", () => {
    const source = [
      'import styled from "styled-components";',
      'import { surfaceMixin } from "./mixins";',
      "",
      "const Box = styled.div`",
      "  color: red;",
      "  ${surfaceMixin};",
      "  &:hover {",
      "    color: blue;",
      "  }",
      "`;",
      "",
      "export const App = () => <Box />;",
      "",
    ].join("\n");

    const unresolvedImportAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "importedValue") {
          return undefined;
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: unresolvedImportAdapter },
    );

    const warning = result.warnings.find(
      (w) =>
        w.type ===
        "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling",
    );
    expect(warning).toBeDefined();
    expect(warning?.loc?.line).toBe(6);
  });

  it("should warn with correct line number for unsupported selectors inside conditional css blocks", () => {
    const source = [
      'import styled, { css } from "styled-components";',
      "",
      "const Box = styled.div<{ $active?: boolean }>`",
      "  color: blue;",
      "  ${(props) =>",
      "    props.$active &&",
      "    css`",
      "      a {",
      "        color: red;",
      "      }",
      "    `}",
      "`;",
      "",
      "export const App = () => <Box $active />;",
      "",
    ].join("\n");

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    const warning = result.warnings.find(
      (w) => w.type === "Conditional `css` block: unsupported selector",
    );
    expect(warning).toBeDefined();
    expect(warning?.loc?.line).toBe(8);
  });

  it("should bail on multi-slot background shorthands inside conditional css blocks", () => {
    const source = [
      'import styled, { css } from "styled-components";',
      'import { color } from "./lib/helpers";',
      "",
      "const Box = styled.div<{ $active?: boolean }>`",
      "  ${(props) =>",
      "    props.$active",
      "      ? css`",
      '          background: ${color("bgSub")} center / cover ${color("controlPrimary")};',
      "        `",
      "      : null}",
      "`;",
      "",
      "export const App = () => <Box $active />;",
      "",
    ].join("\n");

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand",
      }),
    ]);
  });

  it("should map multi-slot image-set backgrounds inside conditional css blocks", () => {
    const source = [
      'import styled, { css } from "styled-components";',
      "",
      "const Box = styled.div<{ $active?: boolean }>`",
      "  ${(props) =>",
      "    props.$active",
      "      ? css`",
      '          background: image-set(${"/one.png"} 1x, ${"/two.png"} 2x);',
      "        `",
      "      : null}",
      "`;",
      "",
      "export const App = () => <Box $active />;",
      "",
    ].join("\n");

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("backgroundImage");
    expect(result.code).not.toContain("backgroundColor");
  });

  it("should bail when same-file descendant proof crosses a non-provable local wrapper component", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

function Wrapper({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  return asChild ? children : <section>{children}</section>;
}

export const App = () => (
  <Container>
    <Wrapper asChild>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </Wrapper>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with dynamic children",
      }),
    ]);
  });

  it("should bail when same-file descendant proof crosses an imported component", () => {
    const source = `
import styled from "styled-components";
import { SmallIcon } from "./some-ui";

const LargeIcon = styled.svg\`
  fill: gray;
  width: 32px;
\`;

const Container = styled.div\`
  padding: 16px;

  svg {
    fill: blue;
  }
\`;

export const App = () => (
  <Container>
    <SmallIcon viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
    </SmallIcon>
    <LargeIcon viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" />
    </LargeIcon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with dynamic children",
      }),
    ]);
  });

  it("should bail instead of merging local child overrides into exported targets", () => {
    const source = `
import styled from "styled-components";

export const Icon = styled.svg\`
  fill: gray;
\`;

const Card = styled.div\`
  > svg {
    fill: red;
  }
\`;

export const App = () => (
  <Card>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Card>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail when child selector proof crosses an unknown direct child", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  > svg {
    fill: blue;
  }
\`;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export const App = () => (
  <>
    <Container>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </Container>
    <Container>
      <Wrapper>
        <Icon viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
        </Icon>
      </Wrapper>
    </Container>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with dynamic children",
      }),
    ]);
  });

  it("should bail when a locally-targeted styled intrinsic is later forced into a wrapper", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const SmallIcon = styled.svg\`
  fill: gray;
\`;

const LargeIcon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

const useAsValue = (Comp: React.ComponentType<any>) => Comp;
useAsValue(SmallIcon);

export const App = () => (
  <Container>
    <SmallIcon viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
    </SmallIcon>
    <LargeIcon viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" />
    </LargeIcon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail when a locally-targeted styled intrinsic is later wrapped by same-file delegation", () => {
    const source = `
import styled from "styled-components";

const BaseIcon = styled.svg\`
  fill: gray;
\`;

const DerivedIcon = styled(BaseIcon)\`
  width: 32px;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

export const App = () => (
  <Container>
    <BaseIcon viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6" />
    </BaseIcon>
    <DerivedIcon viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" />
    </DerivedIcon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with dynamic children",
      }),
    ]);
  });

  it("should preserve earlier local override defaults when later child pseudo overrides target the same element", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }

  svg:hover {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('fill: "blue"');
    expect(result.code).toContain('default: "blue"');
    expect(result.code).toContain('":hover": "red"');
  });

  it("should reserve promoted style keys before naming local element overrides", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

const Descendant = styled.div\`
  color: black;
\`;

export const App = () => (
  <>
    <Container>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </Container>
    <Descendant style={{ color: "red" }}>Icon</Descendant>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("descendantIcon2");
  });

  it("should use after-base mixin values for local pseudo override defaults", () => {
    const source = `
import styled, { css } from "styled-components";

const iconTone = css\`
  fill: green;
\`;

const Icon = styled.svg\`
  fill: gray;
  \${iconTone};
\`;

const Container = styled.div\`
  svg:hover {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('default: "green"');
    expect(result.code).toContain('":hover": "red"');
  });

  it("should not merge direct child overrides before after-base mixins", () => {
    const source = `
import styled, { css } from "styled-components";

const iconTone = css\`
  fill: gray;
\`;

const Icon = styled.svg\`
  fill: green;
  \${iconTone};
\`;

const Container = styled.div\`
  > svg {
    fill: blue;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("childIcon");
    expect(result.code).toContain('fill: "blue"');
  });

  it("should bail when parent child overrides would conflict with child variants", () => {
    const source = `
import styled from "styled-components";

const Child = styled.button<{ $primary?: boolean }>\`
  color: \${(props) => (props.$primary ? "green" : "gray")};
\`;

const Parent = styled.div\`
  > button {
    color: red;
  }
\`;

export const App = () => (
  <Parent>
    <Child $primary>Action</Child>
  </Parent>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should preserve child pseudo maps when parent child overrides target the same prop", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;

  &:hover {
    fill: red;
  }
\`;

const Container = styled.div\`
  > svg {
    fill: blue;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("childIcon");
    expect(result.code).toContain('":hover": "red"');
  });

  it("should bail when local pseudo defaults would override child variants", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg<{ $active?: boolean }>\`
  fill: gray;
  \${(props) => props.$active && "fill: green;"}
\`;

const Container = styled.div\`
  svg:hover {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon $active viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail when local pseudo defaults would override runtime style props", () => {
    const source = `
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

const Icon = styled.svg\`
  fill: gray;
  \${scrollFadeMaskStyles(18, "both")}
\`;

const Container = styled.div\`
  svg:hover {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail for multiple pseudo-only local overrides targeting the same prop", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg:focus {
    fill: green;
  }

  svg:hover {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail when attrs as changes a local selector target tag", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg.attrs({ as: "span" })\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: red;
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">Icon</Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with dynamic children",
      }),
    ]);
  });

  it("should bail for local element selectors inside at-rules", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  @media (min-width: 600px) {
    svg {
      fill: red;
    }
  }
\`;

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: descendant/child/sibling selector",
      }),
    ]);
  });

  it("should recheck direct child targets that become wrappers after proof", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  > svg {
    fill: blue;
  }
\`;

const useAsValue = (Comp: React.ComponentType<any>) => Comp;
useAsValue(Icon);

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: ambiguous element selector",
      }),
    ]);
  });

  it("should bail when local element selector parents are extended with styled", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

const Special = styled(Container)\`
  padding: 4px;
\`;

export const App = () => (
  <>
    <Container>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </Container>
    <Special>
      <Icon viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
      </Icon>
    </Special>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with plain intrinsic children",
      }),
    ]);
  });

  it("should bail when local element selector parents are used as non-JSX values", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const Icon = styled.svg\`
  fill: gray;
\`;

const Container = styled.div\`
  svg {
    fill: blue;
  }
\`;

const useAsValue = (Comp: React.ComponentType<any>) => Comp;
useAsValue(Container);

export const App = () => (
  <Container>
    <Icon viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
    </Icon>
  </Container>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: element selector with plain intrinsic children",
      }),
    ]);
  });

  it("should transform & + & when same-file JSX adjacency is statically provable", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;
  & + & {
    color: red;
  }
\`;

export const App = () => (
  <>
    <Thing>First</Thing>
    <Thing>Second</Thing>
    <span>Spacer</span>
    <Thing>Third</Thing>
    <Thing>Fourth</Thing>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("thingAdjacentSibling");
  });

  it("should preserve media guards for supported & + & callsites", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;

  @media (min-width: 768px) {
    & + & {
      margin-top: 16px;
    }
  }
\`;

export const App = () => (
  <>
    <Thing>First</Thing>
    <Thing>Second</Thing>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("thingAdjacentSibling");
    expect(result.code).toContain('"@media (min-width: 768px)": 16');
  });

  it("should ignore text nodes when proving adjacent & + & callsites", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;
  & + & {
    color: red;
  }
\`;

export const App = () => (
  <>
    <Thing>First</Thing>
    {"hello"}
    <Thing>Second</Thing>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("thingAdjacentSibling");
    expect(result.code).toContain("Second");
    expect(result.code).toContain("[styles.thing, styles.thingAdjacentSibling]");
  });

  it("should not split custom component children when preserving JSX whitespace", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

function Counter(props: { children: React.ReactNode }) {
  return <span data-count={React.Children.count(props.children)}>{props.children}</span>;
}

const ui = { Counter };

const Plain = styled.span\`
  color: blue;
\`;

const Commented = styled.span\`
  color: purple;
\`;

const WithRef = styled.span\`
  color: green;
\`;

const Item = styled.span\`
  color: black;
  & + & {
    color: red;
  }
\`;

const Tone = styled.span<{ $tone?: "danger" }>\`
  color: \${(props) => (props.$tone === "danger" ? "red" : "blue")};
\`;

export function App() {
  const ref = React.useRef<HTMLSpanElement>(null);
  return (
    <>
      <Counter><Plain /> <span /> after</Counter>
      <Counter>Before {/* note */}<Commented /> after</Counter>
      <Counter>Before <WithRef ref={ref} /> after</Counter>
      <Counter>Before <Item /> <Item /> after</Counter>
      <Counter>Before <Tone $tone="danger" /> after</Counter>
      <ui.Counter>Before <Plain /> after</ui.Counter>
    </>
  );
}
`;

    const result = transformWithWarnings(
      { source, path: "custom-children-whitespace.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).not.toContain('{" "}');
    expect(result.code).toContain("ref={ref}");
    expect(result.code).toContain("itemAdjacentSibling");
    expect(result.code).toContain("<ui.Counter>Before <Plain /> after</ui.Counter>");
  });

  it("should preserve JSX whitespace in safe parents without splitting custom children", () => {
    const source = `
import * as React from "react";
import { Fragment as RF, Fragment as F } from "react";
import styled from "styled-components";
import { Counter as ImportedCounter } from "./lib/counter";

function Fragment(props: { children: React.ReactNode }) {
  return <section>{props.children}</section>;
}

const ReactInner = styled.span\`
  color: red;
\`;

const FragmentInner = styled.span\`
  color: orange;
\`;

const AliasFragmentInner = styled.span\`
  color: pink;
\`;

const LocalFragmentInner = styled.span\`
  color: cyan;
\`;

const OuterInner = styled.span\`
  color: green;
\`;

const OuterCustomInner = styled.span\`
  color: brown;
\`;

const Middle = styled.span\`
  color: gray;
\`;

const CustomInner = styled.span\`
  color: blue;
\`;

const Outer = styled.div\`
  padding: 4px;
\`;

const OuterCustom = styled(ImportedCounter)\`
  padding: 4px;
\`;

export const App = () => (
  <>
    <React.Fragment>Before <ReactInner /> after</React.Fragment>
    <RF>Before <FragmentInner /> after</RF>
    <F>Before <AliasFragmentInner /> after</F>
    <Fragment>Before <LocalFragmentInner /> after</Fragment>
    <Outer>Before <OuterInner /> after</Outer>
    <OuterCustom>Before <OuterCustomInner /> after</OuterCustom>
    <><span /> <Middle /> <span /></>
    <my-counter>Before <CustomInner /> after</my-counter>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "fragment-and-custom-whitespace.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('<React.Fragment>Before{" "}');
    expect(result.code).toContain('{" "}after</React.Fragment>');
    expect(result.code).toContain('<RF>Before{" "}');
    expect(result.code).toContain('{" "}after</RF>');
    expect(result.code).toContain('<F>Before{" "}');
    expect(result.code).toContain('{" "}after</F>');
    expect(result.code).toContain(
      "<Fragment>Before <span sx={styles.localFragmentInner} /> after</Fragment>",
    );
    expect(result.code).toContain('<div sx={styles.outer}>Before{" "}');
    expect(result.code).toContain('{" "}after</div>');
    expect(result.code).toContain(
      "<ImportedCounter {...stylex.props(styles.outerCustom)}>Before <span sx={styles.outerCustomInner} /> after</ImportedCounter>",
    );
    expect(result.code).toContain('<><span />{" "}<span sx={styles.middle} />{" "}<span /></>');
    expect(result.code).toContain(
      "<my-counter>Before <span sx={styles.customInner} /> after</my-counter>",
    );
  });

  it("preserves named React Fragment imports when module resolution is configured", () => {
    const source = `
import { Fragment as F } from "react";
import styled from "styled-components";

const Inner = styled.span\`
  color: red;
\`;

export const App = () => (
  <F>Before <Inner /> after</F>
);
`;

    const result = runTransformWithDiagnostics(
      source,
      {
        resolveModule: (_fromFile: string, specifier: string) =>
          specifier === "react" ? "/virtual/pnp/react/index.js" : undefined,
      },
      "fragment-resolver.tsx",
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('<F>Before{" "}');
    expect(result.code).toContain('{" "}after</F>');
  });

  it("should preserve non-media adjacent overrides when media adjacent rules are also present", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;

  & + & {
    color: red;
  }

  @media (min-width: 768px) {
    & + & {
      margin-top: 16px;
    }
  }
\`;

export const App = () => (
  <>
    <Thing>First</Thing>
    <Thing>Second</Thing>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("thingAdjacentSibling");
    expect(result.code).toContain('color: "red"');
    expect(result.code).toContain("marginTop: {");
    expect(result.code).toContain('"@media (min-width: 768px)": 16');
  });

  it("should ignore unrelated dynamic JSX subtrees when proving adjacent sibling callsites", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;

  & + & {
    color: red;
  }
\`;

export const App = ({ items }: { items: string[] }) => (
  <>
    <Thing>First</Thing>
    <Thing>Second</Thing>
    <section>{items.map((item) => <span key={item}>{item}</span>)}</section>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("thingAdjacentSibling");
    expect(result.code).toContain("[styles.thing, styles.thingAdjacentSibling]");
  });

  it("should bail on cross-component + sibling selectors because adjacent sibling is not lossless", () => {
    const source = `
import styled from "styled-components";

const Link = styled.a\`
  color: blue;
\`;

const Badge = styled.span\`
  color: gray;

  \${Link}:focus-visible + & {
    color: red;
  }
\`;

export const App = () => (
  <>
    <Link href="#">Link</Link>
    <Badge>Badge</Badge>
  </>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings).toEqual([
      expect.objectContaining({
        type: "Unsupported selector: adjacent sibling combinator",
      }),
    ]);
  });

  it("should transform & ~ & without emitting an adjacent-sibling warning", () => {
    const source = `
import styled from "styled-components";

const Thing = styled.div\`
  color: blue;
  & ~ & {
    color: red;
  }
\`;

export const App = () => <Thing />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain('[stylex.when.siblingBefore(":is(*)", ThingMarker)]');
  });

  it("should emit info warning when transient props are renamed on exported component", () => {
    const source = `
import styled from "styled-components";

export const Toggle = styled.div<{ $active?: boolean }>\`
  color: \${(props) => (props.$active ? "red" : "blue")};
\`;

export const App = () => <Toggle $active />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("active");
    expect(result.code).not.toContain("$active");
    const infoWarnings = result.warnings.filter(
      (w) =>
        w.severity === "info" &&
        w.type ===
          "Transient $-prefixed props renamed on exported component — update consumer call sites to use the new prop names",
    );
    expect(infoWarnings).toHaveLength(1);
    expect(infoWarnings[0]!.context).toMatchObject({
      componentName: "Toggle",
    });
  });

  it("should emit transientPropRenames for exported wrapper inheriting base renames", () => {
    const source = `
import styled from "styled-components";

export const Base = styled.div<{ $active?: boolean }>\`
  color: \${(props) => (props.$active ? "red" : "blue")};
\`;

export const Wrapper = styled(Base)\`
  font-weight: bold;
\`;

export const App = () => (
  <div>
    <Base $active />
    <Wrapper $active />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Both Base and Wrapper should have transientPropRenames for cross-file patching
    expect(result.transientPropRenames).toBeDefined();
    const renamedExports = result.transientPropRenames!.map((r) => r.exportName);
    expect(renamedExports).toContain("Base");
    expect(renamedExports).toContain("Wrapper");
    // Both should map $active → active
    const wrapperRenames = result.transientPropRenames!.find((r) => r.exportName === "Wrapper");
    expect(wrapperRenames?.renames).toEqual({ $active: "active" });
  });

  it("should strip $ prefix for non-exported component without emitting warning", () => {
    const source = `
import styled from "styled-components";

const Toggle = styled.div<{ $active?: boolean }>\`
  color: \${(props) => (props.$active ? "red" : "blue")};
\`;

export const App = () => <Toggle $active />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("active");
    expect(result.code).not.toContain("$active");
    const renameWarnings = result.warnings.filter(
      (w) =>
        w.type ===
        "Transient $-prefixed props renamed on exported component — update consumer call sites to use the new prop names",
    );
    expect(renameWarnings).toHaveLength(0);
  });

  it("should keep $disabled on styled.button to avoid HTML disabled collision", () => {
    const source = `
import styled from "styled-components";

const FancyButton = styled.button<{ $disabled?: boolean }>\`
  opacity: \${(props) => (props.$disabled ? 0.5 : 1)};
  cursor: \${(props) => (props.$disabled ? "not-allowed" : "pointer")};
\`;

export const App = () => (
  <div>
    <FancyButton $disabled>Disabled look</FancyButton>
    <FancyButton>Normal</FancyButton>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("$disabled");
    expect(result.code).not.toContain("disabled={disabled}");
  });

  it("should keep $-prefix when stripped name collides with call-site attribute", () => {
    const source = `
import styled from "styled-components";

const StyledInput = styled.input<{ $size?: string }>\`
  font-size: \${(props) => (props.$size === "lg" ? "18px" : "14px")};
\`;

export const App = () => (
  <div>
    <StyledInput size={5} $size="lg" />
    <StyledInput $size="sm" />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("$size");
  });

  it("should keep $-prefix when call sites use spread props", () => {
    const source = `
import styled from "styled-components";

const Toggle = styled.div<{ $active?: boolean }>\`
  color: \${(props) => (props.$active ? "red" : "blue")};
\`;

export const App = (props: { $active?: boolean }) => <Toggle {...props} />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // The wrapper's destructuring must keep the $-prefix because
    // spread call sites may pass $active which wouldn't match a renamed "active".
    expect(result.code).toContain("$active &&");
  });

  it("should keep $-prefix when stripped name collides with exported const binding", () => {
    const source = `
import styled from "styled-components";

export const $size = 42;

const Box = styled.div<{ $size?: string }>\`
  font-size: \${(props) => (props.$size === "lg" ? "18px" : "14px")};
\`;

export const App = () => <Box $size="lg">Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // The wrapper's destructuring must keep $size because renaming to "size"
    // would cause renameIdentifiersInAst to also rename the exported $size binding.
    expect(result.code).toContain("$size === ");
  });

  it("should keep $-prefix when a token binding appears in static style objects", () => {
    const source = `
import styled from "styled-components";
import { $colors as $glowShadow } from "./tokens.stylex";

const Glow = styled.div<{ $glowShadow: string }>\`
  border-color: \${$glowShadow.dark};
  box-shadow: 0 0 \${({ $glowShadow }) => $glowShadow};
\`;

export const App = () => <Glow $glowShadow="rgba(0, 0, 0, 0.35)">Glow</Glow>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("borderColor: $colors.dark");
    expect(result.code).not.toContain("borderColor: glowShadow.dark");
    expect(result.code).toContain("$glowShadow: string");
    expect(result.code).toContain('<Glow $glowShadow="rgba(0, 0, 0, 0.35)">');
  });

  it("should Omit+remap $-prefixed props for non-exported styled(Component) wrappers", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

interface BaseProps {
  $isOpen: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

function Base(props: BaseProps) {
  const { $isOpen, className, style, children } = props;
  return <div className={className} style={style}>{children}</div>;
}

const Wrapper = styled(Base)\`
  transform: rotate(\${(props) => (props.$isOpen ? "90deg" : "0deg")});
\`;

export const App = () => (
  <div>
    <Wrapper $isOpen />
    <Wrapper $isOpen={false} />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // The wrapper should rename $isOpen to isOpen
    expect(result.code).toContain("isOpen");
    // The Omit should include "$isOpen" since the base component has it in its type
    expect(result.code).toContain('"$isOpen"');
    // The mapped type should remap $isOpen to isOpen
    expect(result.code).toContain('"$isOpen" as "isOpen"');
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

  it("should not emit TypeScript satisfies syntax for raw CSS variable inline styles in plain JS", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  width: var(--raw-width);
  color: red;
\`;

export function App() {
  return <Box>Hi</Box>;
}
`;
    const out = applyTransform(
      transform,
      { adapter: fixtureAdapter },
      { source, path: "raw-var.js" },
      { parser: "babel" },
    );

    expect(out).toContain('const boxInlineStyle = {\n  width: "var(--raw-width)",\n};');
    expect(out).not.toContain("satisfies React.CSSProperties");
    expect(out).not.toContain("React.CSSProperties");
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-dynamicTransitionSpeed.input.tsx"),
      },
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

  it("should call the adapter for helper calls nested in arithmetic interpolations", () => {
    const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${8 - runtimeValue()}px;
\`;
`;
    const resolveCalls: CallResolveContext[] = [];

    const adapterWithoutRuntimeResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        resolveCalls.push(ctx);
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-nestedArithmeticNoResolution.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutRuntimeResolution },
    );

    expect(resolveCalls).toHaveLength(1);
    expect(resolveCalls[0]).toMatchObject({
      calleeImportedName: "runtimeValue",
      cssProperty: "padding-top",
      args: [],
    });
    expect(resolveCalls[0]?.calleeSource.value).toMatch(/helpers$/);
    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(
      "Adapter resolveCall returned undefined for helper call",
    );
  });

  it.each([
    {
      name: "member helper arithmetic expression",
      source: `
import styled from "styled-components";
import { helpers } from "./helpers";

export const Box = styled.div\`
  padding-top: \${8 - helpers.runtimeValue()}px;
\`;
`,
      expectedMemberPath: ["runtimeValue"],
    },
    {
      name: "conditional expression",
      source: `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${runtimeValue() ? 8 : 4}px;
\`;
`,
    },
    {
      name: "unary expression",
      source: `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${-runtimeValue()}px;
\`;
`,
    },
    {
      name: "nested template literal",
      source: `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${\`calc(\${runtimeValue()}px + 1px)\`};
\`;
`,
    },
    {
      name: "multi-slot background image",
      source: `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  background-image: linear-gradient(\${runtimeValue()}, \${runtimeValue()});
\`;
`,
    },
    {
      name: "arrow function dynamic value",
      source: `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div<{ $size: number }>\`
  width: \${(props) => runtimeValue(props.$size, 1) + 4}px;
\`;
`,
      expectWarning: false,
    },
  ])(
    "should call the adapter for helper calls nested in $name",
    ({ name, source, expectedMemberPath, expectWarning = true }) => {
      const resolveCalls: CallResolveContext[] = [];

      const adapterWithoutRuntimeResolution = {
        externalInterface() {
          return { styles: false, as: false, ref: false };
        },
        resolveValue() {
          return undefined;
        },
        resolveCall(ctx: CallResolveContext) {
          resolveCalls.push(ctx);
          return undefined;
        },
        resolveSelector() {
          return undefined;
        },
        styleMerger: null,
        useSxProp: false,
        usePhysicalProperties: true,
      } satisfies Adapter;

      const result = transformWithWarnings(
        {
          source,
          path: join(testCasesDir, `helper-nested-${name.replaceAll(" ", "-")}.input.tsx`),
        },
        { jscodeshift: j, j, stats: () => {}, report: () => {} },
        { adapter: adapterWithoutRuntimeResolution },
      );

      expect(resolveCalls.length).toBeGreaterThan(0);
      expect(resolveCalls[0]).toMatchObject({
        calleeImportedName: expectedMemberPath ? "helpers" : "runtimeValue",
      });
      if (expectedMemberPath) {
        expect(resolveCalls[0]?.calleeMemberPath).toEqual(expectedMemberPath);
      }
      expect(result.code).toBeNull();
      if (expectWarning) {
        expect(result.warnings.map((w) => w.type)).toEqual(
          expect.arrayContaining([
            expect.stringMatching(
              /Adapter resolveCall returned undefined for helper call|Unsupported interpolation: call expression/,
            ),
          ]),
        );
      }
    },
  );

  it("should fold static unit suffixes into calc expressions for resolved helper arithmetic", () => {
    const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${8 - runtimeValue()}px;
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$spacing.runtimeValue",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$spacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedArithmeticUnit.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("`calc(8px - ${$spacing.runtimeValue})`");
    expect(code).not.toContain(")px");
  });

  it("should preserve CSS length token semantics for resolved helper arithmetic patterns", () => {
    const source = `
import styled from "styled-components";
import { color, runtimeValue } from "./helpers";

const LOCAL_NUMERIC_CONSTANT = 20;

export const Box = styled.div\`
  margin-right: \${1 + runtimeValue()}px;
  margin-left: \${LOCAL_NUMERIC_CONSTANT - runtimeValue()}px;
  margin-top: -\${6 + runtimeValue()}px;
  padding: \${8 - runtimeValue()}px 12px;
  width: \${runtimeValue() * 2}px;
  height: \${runtimeValue()}px;
  top: -\${runtimeValue()}px;
  border: \${runtimeValue()}px solid \${color("bgBorderThin")};
  background-size: calc(100% + \${runtimeValue() * 2}px) calc(100% + \${runtimeValue() * 2}px);
  mask: radial-gradient(circle, #000 8px, #fff \${runtimeValue() + 8}px);
\`;
`;

    const adapterWithLengthTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$size.thinPixel",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$size" }],
              },
            ],
          };
        }
        if (ctx.calleeImportedName === "color") {
          return {
            usage: "create" as const,
            expr: "$colors.bgBorderThin",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: false,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedLengthTokenArithmetic.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithLengthTokenResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain('import { $size, $colors } from "./tokens.stylex";');
    expect(code).toContain("marginRight: `calc(1px + ${$size.thinPixel})`");
    expect(code).toContain("marginLeft: `calc(20px - ${$size.thinPixel})`");
    expect(code).toContain("marginTop: `calc(-6px - ${$size.thinPixel})`");
    expect(code).toContain("paddingBlock: `calc(8px - ${$size.thinPixel})`");
    expect(code).toContain("paddingInline: 12");
    expect(code).toContain("width: `calc(${$size.thinPixel} * 2)`");
    expect(code).toContain("height: $size.thinPixel");
    expect(code).toContain("top: `calc(-1 * ${$size.thinPixel})`");
    expect(code).toContain("borderWidth: $size.thinPixel");
    expect(code).toContain('borderStyle: "solid"');
    expect(code).toContain("borderColor: $colors.bgBorderThin");
    expect(code).toContain(
      "backgroundSize: `calc(100% + calc(${$size.thinPixel} * 2)) calc(100% + calc(${$size.thinPixel} * 2))`",
    );
    expect(code).toContain(
      "mask: `radial-gradient(circle, #000 8px, #fff calc(${$size.thinPixel} + 8px))`",
    );
    expect(code).not.toContain("${$size.thinPixel}px");
    expect(code).not.toContain("1 + $size.thinPixel");
    expect(code).not.toContain("LOCAL_NUMERIC_CONSTANT - $size.thinPixel");
  });

  it("should bail instead of emitting calc for resolved helper arithmetic with string operands", () => {
    const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  padding-top: \${runtimeValue() + "2px"};
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$spacing.runtimeValue",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$spacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedArithmeticStringOperand.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    expect(result.code ?? "").not.toContain("calc(");
  });

  it("preserves px templates when the interpolation prop can be a string", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div<{ $size: number | string }>\`
  width: \${(props) => props.$size}px;
\`;
`;

    const result = transformWithWarnings(
      { source, path: "string-or-number-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("width: `${width}px`");
  });

  it("does not use unrelated numeric bindings for string-capable style function params", () => {
    const source = `
import styled from "styled-components";

function helper() {
  const width = 1;
  return width;
}

export const Box = styled.div<{ $size: number | string }>\`
  width: \${(props) => props.$size}px;
\`;
`;

    const result = transformWithWarnings(
      { source, path: "string-or-number-shadowed-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("width: `${width}px`");
  });

  it("preserves px templates on unitless StyleX properties", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div<{ $opacity: number; $z: number }>\`
  opacity: \${(props) => props.$opacity}px;
  z-index: \${(props) => props.$z}px;
\`;
`;

    const result = transformWithWarnings(
      { source, path: "unitless-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("opacity: `${opacity}px`");
    expect(result.code ?? "").toContain("zIndex: `${zIndex}px`");
  });

  it("preserves observed fallback px templates when the prop can be a string", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ size: number | string }>\`
  width: \${(props) => props.size}px;
\`;

export const App = () => <Box size={8}>Observed</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "observed-string-or-number-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("width: `${size}px`");
  });

  it("does not omit px for mutable top-level numeric bindings", () => {
    const source = `
import styled from "styled-components";

let WIDTH = 12;
WIDTH = Math.random() > 0.5 ? "12" : WIDTH;

export const Box = styled.div\`
  width: \${WIDTH}px;
\`;
`;

    const result = transformWithWarnings(
      { source, path: "mutable-width-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("width: `${WIDTH}px`");
  });

  it("preserves px templates in pseudo-elements when the interpolation prop can be a string", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div<{ $size: number | string }>\`
  &::before {
    content: "";
    width: \${(props) => props.$size}px;
  }
\`;
`;

    const result = transformWithWarnings(
      { source, path: "string-or-number-pseudo-px.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain("width: `${size}px`");
  });

  it.each([
    {
      name: "nested conditional arithmetic",
      css: "padding-top: ${cond ? 8 - runtimeValue() : 4}px;",
      expected: "cond ? `calc(8px - ${$spacing.runtimeValue})` : 4",
      forbidden: "8 - $spacing.runtimeValue",
    },
    {
      name: "multiplication scalar",
      css: "padding-top: ${2 * runtimeValue()}px;",
      expected: "`calc(2 * ${$spacing.runtimeValue})`",
      forbidden: "2px *",
    },
    {
      name: "conditional resolved branch",
      css: "padding-top: ${cond ? runtimeValue() : 4}px;",
      expected: "cond ? $spacing.runtimeValue : 4",
      forbidden: "}px",
    },
  ])(
    "should preserve units for resolved helper arithmetic in $name",
    ({ css, expected, forbidden }) => {
      const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

const cond = true;

export const Box = styled.div\`
  ${css}
\`;
`;

      const adapterWithTokenResolution = {
        externalInterface() {
          return { styles: false, as: false, ref: false };
        },
        resolveValue() {
          return undefined;
        },
        resolveCall(ctx: CallResolveContext) {
          if (ctx.calleeImportedName === "runtimeValue") {
            return {
              usage: "create" as const,
              expr: "$spacing.runtimeValue",
              imports: [
                {
                  from: { kind: "specifier" as const, value: "./tokens.stylex" },
                  names: [{ imported: "$spacing" }],
                },
              ],
            };
          }
          return undefined;
        },
        resolveSelector() {
          return undefined;
        },
        styleMerger: null,
        useSxProp: false,
        usePhysicalProperties: true,
      } satisfies Adapter;

      const result = transformWithWarnings(
        {
          source,
          path: join(testCasesDir, "helper-resolvedArithmeticNestedUnit.input.tsx"),
        },
        { jscodeshift: j, j, stats: () => {}, report: () => {} },
        { adapter: adapterWithTokenResolution },
      );

      expect(result.code).not.toBeNull();
      const code = result.code ?? "";
      expect(code).toContain(expected);
      expect(code).not.toContain(forbidden);
    },
  );

  it("should preserve resolved helper arithmetic inside CSS functions", () => {
    const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

export const Box = styled.div\`
  transform: translateX(\${8 - runtimeValue()}px);
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$spacing.runtimeValue",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$spacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedArithmeticWrapped.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain(
      "transform: `translateX(calc(8px - ${$spacing.runtimeValue}))`",
    );
  });

  it.each([
    {
      name: "mutable arithmetic operand",
      declarations: "let base = 8;",
      css: "padding-top: ${base - runtimeValue()}px;",
    },
    {
      name: "function-valued constant operand",
      declarations: "const base = () => 8;",
      css: "padding-top: ${base - runtimeValue()}px;",
    },
    {
      name: "nested template literal unit adjacency",
      declarations: "",
      css: "padding-top: ${`calc(${runtimeValue()}px + 1px)`};",
    },
    {
      name: "unary plus",
      declarations: "",
      css: "padding-top: ${+runtimeValue()}px;",
    },
    {
      name: "conditional nonliteral branch",
      declarations: "const size = 8;",
      css: "padding-top: ${cond ? size : runtimeValue()}px;",
    },
    {
      name: "logical nonliteral branch",
      declarations: "const size = 8;",
      css: "padding-top: ${size || runtimeValue()}px;",
    },
    {
      name: "helper predicate",
      declarations: "",
      css: "padding-top: ${runtimeValue() ? 8 : 4}px;",
    },
  ])("should bail for unsafe resolved helper unit arithmetic in $name", ({ declarations, css }) => {
    const source = `
import styled from "styled-components";
import { runtimeValue } from "./helpers";

const cond = true;
${declarations}

export const Box = styled.div\`
  ${css}
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$spacing.runtimeValue",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$spacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedArithmeticUnsafeUnit.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(
      "Unsupported interpolation: call expression",
    );
  });

  it("should preserve resolved helper slots with adjacent units in multi-slot backgrounds", () => {
    const source = `
import styled from "styled-components";
import { other, runtimeValue } from "./helpers";

export const Box = styled.div\`
  background-image: linear-gradient(\${runtimeValue()}px, \${other()});
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        return {
          usage: "create" as const,
          expr:
            ctx.calleeImportedName === "runtimeValue" ? "$spacing.runtimeValue" : "$spacing.other",
          imports: [
            {
              from: { kind: "specifier" as const, value: "./tokens.stylex" },
              names: [{ imported: "$spacing" }],
            },
          ],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-backgroundAdjacentUnit.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    expect(result.code).not.toBeNull();
    expect(result.code ?? "").toContain(
      "backgroundImage: `linear-gradient(${$spacing.runtimeValue}, ${$spacing.other})`",
    );
    expect(result.code ?? "").not.toContain("}px");
  });

  it("should preserve adjacent units when a resolved helper yields a unitless literal", () => {
    const source = `
import styled from "styled-components";
import { space, color } from "./helpers";

export const Box = styled.div\`
  mask: radial-gradient(circle, #000 8px, #fff \${space()}px);
  width: calc(100% - \${space()}rem);
  padding: \${space()}rem 12px;
  margin: \${space()}px 4px;
  border: \${space()}px solid \${color()};
  top: \${space()}px;
  bottom: -\${space()}px;
\`;
`;

    // The helper resolves to a bare unitless literal (not a unit-bearing token),
    // so the adjacent unit suffix must be preserved rather than folded away.
    const adapterWithLiteralResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "space") {
          return { usage: "create" as const, expr: "'8'", imports: [] };
        }
        if (ctx.calleeImportedName === "color") {
          return { usage: "create" as const, expr: "'#abc'", imports: [] };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: false,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-resolvedUnitlessLiteralAdjacentUnit.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithLiteralResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("radial-gradient(circle, #000 8px, #fff 8px)");
    expect(code).toContain("calc(100% - 8rem)");
    // The unit must not be dropped, leaving a bare value next to the closing paren.
    expect(code).not.toContain("#fff 8)");
    expect(code).not.toContain("100% - 8)");
    // Directional shorthand expansion must keep the authored unit on the slot
    // entry (a bare numeric would silently default to px in StyleX, losing rem).
    expect(code).toContain('paddingBlock: "8rem"');
    expect(code).toContain("paddingInline: 12");
    expect(code).toContain("marginBlock: 8");
    expect(code).toContain("marginInline: 4");
    // Border width must keep its authored unit: with the unit preserved it
    // becomes numeric `8` (= 8px in StyleX), never the unitless string "8".
    expect(code).toContain("borderWidth: 8,");
    expect(code).not.toContain('borderWidth: "8"');
    expect(code).toContain('borderStyle: "solid"');
    expect(code).toContain('borderColor: "#abc"');
    // Single-slot values must keep the authored unit, including when negated.
    expect(code).toContain("top: 8,");
    expect(code).toContain("bottom: -8,");
    expect(code).not.toContain("calc(-1");
  });

  it("should not treat non-unit trailing text after a resolved helper as a CSS unit", () => {
    const source = `
import styled from "styled-components";
import { asset } from "./helpers";

export const Box = styled.div\`
  mask-image: url(\${asset()}icons/logo.svg);
\`;
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "asset") {
          return {
            usage: "create" as const,
            expr: "$assets.base",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$assets" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: false,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-nonUnitSuffixText.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    // "icons" is not a CSS unit, so it must never be consumed as a unit suffix:
    // the full URL text must be preserved, not corrupted to ".../logo.svg".
    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("url(${$assets.base}icons/logo.svg)");
    expect(code).not.toContain("$assets.base}/logo.svg");
  });

  it.each([
    {
      name: "function parameter",
      signature: "export function App({ gap }: { gap: number })",
      localBinding: "",
    },
    {
      name: "nested function declaration",
      signature: "export function App()",
      localBinding: "  function gap() {}\n",
    },
  ])("should not fold a top-level const shadowed by a $name", ({ signature, localBinding }) => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { runtimeValue } from "./helpers";

const gap = 8;

${signature} {
${localBinding}  const Box = styled.div\`
    margin-left: \${gap - runtimeValue()}px;
  \`;
  return <Box />;
}
`;

    const adapterWithTokenResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "runtimeValue") {
          return {
            usage: "create" as const,
            expr: "$spacing.runtimeValue",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$spacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: false,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-shadowedConstArithmetic.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithTokenResolution },
    );

    // `gap` here is the function parameter, not the top-level `const gap = 8`,
    // so the arithmetic must not be folded using the top-level value.
    expect(result.code ?? "").not.toContain("calc(8px");
  });

  it.each([
    {
      name: "static direct helper arg",
      css: 'background-color: ${(props) => color("bgBase")};',
    },
    {
      name: "static curried helper key",
      css: 'background-color: ${(props) => color("bgBase")(props)};',
    },
    {
      name: "multi-argument helper",
      css: 'padding-top: ${(props) => spacing(props.size, "px")};',
    },
  ])("should preserve dynamic helper calls with $name", ({ css }) => {
    const source = `
import styled from "styled-components";
import { color, spacing } from "./lib/helpers";

export const Box = styled.div<{ size: number }>\`
  ${css}
\`;
`;

    const adapterWithHelperResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "color") {
          return {
            usage: "create" as const,
            expr: "$colors.bgBase",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        if (ctx.calleeImportedName === "spacing") {
          return {
            usage: "create" as const,
            expr: "getSpacing",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./spacing" },
                names: [{ imported: "getSpacing" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-dynamicStaticArgPreserve.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithHelperResolution },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((w) => w.type)).not.toContain(
      "Unsupported interpolation: call expression",
    );
  });

  it("should preserve member helper calls with dynamic arguments", () => {
    const source = `
import styled from "styled-components";
import { helpers } from "./lib/helpers";

export const Box = styled.div<{ tone: string }>\`
  background-color: \${(props) => helpers.color(props.tone)};
\`;
`;

    const adapterWithMemberResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "helpers" && ctx.calleeMemberPath?.join(".") === "color") {
          return {
            usage: "create" as const,
            dynamicArgUsage: "memberAccess" as const,
            expr: "$colors",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-memberDynamicArgPreserve.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithMemberResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("helpers.color(");
    expect(code).not.toContain("backgroundColor: $colors");
  });

  it("should not split dynamic helper theme branches into static theme variants", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div<{ $dark: string; $light: string }>\`
  background-color: \${(props) =>
    props.theme.isDark ? color(props.$dark)(props) : color(props.$light)(props)};
\`;

export const GradientBox = styled.div<{ $dark: string; $light: string }>\`
  background: \${(props) =>
    props.theme.isDark
      ? \`linear-gradient(\${color(props.$dark)(props)}, transparent)\`
      : \`linear-gradient(transparent, \${color(props.$light)(props)})\`};
\`;

export const CalcBox = styled.div<{ $dark: string }>\`
  width: \${(props) => (props.theme.isDark ? color(props.$dark)(props) * 2 : 4)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanDynamicArg.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("theme.isDark");
    expect(code).toContain("color(props.dark)");
    expect(code).toContain("color(props.light)");
    expect(code).toContain("linear-gradient");
    expect(code).toContain("color(props.dark)({");
    expect(code).toContain("gradientBoxBackgroundImage");
    expect(code).not.toContain("backgroundColor: $colors");
    expect(code).not.toContain("gradientBoxBackgroundColor");
    expect(code).not.toContain("linear-gradient(${$colors");
    expect(code).not.toContain("calc($colors");
  });

  it("should reset earlier background images for runtime background shorthand helper branches", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div<{ $dark: string; $light: string }>\`
  background: url(/old.png);
  background: \${(props) =>
    props.theme.isDark ? color(props.$dark)(props) : color(props.$light)(props)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRuntimeBackgroundReset.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).not.toContain('backgroundImage: "url(/old.png)"');
    expect(code).toContain("backgroundColor,");
    expect(code).toContain('backgroundImage: "none"');
    expect(code).toContain("theme.isDark");
    expect(code).toContain("color(props.dark)");
    expect(code).toContain("color(props.light)");
  });

  it("should not statically resolve curried helper branches with non-current outer args", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

const otherTheme = { color: { bgBase: "purple" } };

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark ? color("bgBase")({ theme: otherTheme }) : "red"};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanUnsafeCurriedOuterArg.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    const code = result.code ?? "";
    expect(code).not.toContain("backgroundColor: $colors.bgBase");
    if (result.code) {
      expect(code).toContain("otherTheme");
      expect(code).toContain('color("bgBase")');
    }
  });

  it("should preserve adapter runtime overrides in theme boolean branches", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark
      ? ColorConverter.cssWithAlpha(props.theme.color.bgBase, 0.5)
      : "red"};
\`;
`;

    const adapterWithRuntimeFallback = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "theme" && ctx.path === "color.bgBase") {
          return {
            expr: "$colors.bgBase",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (
          ctx.calleeImportedName === "ColorConverter" &&
          ctx.calleeMemberPath?.[0] === "cssWithAlpha"
        ) {
          return {
            usage: "create" as const,
            expr: "`color-mix(in srgb, ${$colors.bgBase} 50%, transparent)`",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
            preserveRuntimeCall: true,
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRuntimeOverride.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRuntimeFallback },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("color-mix(in srgb");
    expect(code).toContain("ColorConverter.cssWithAlpha");
    expect(code).toContain("theme.isDark");
    expect(code).toContain("styles.boxColor(");
    const themeStyleIndex = code.indexOf("theme.isDark ? styles.boxDark : styles.boxLight");
    const runtimeStyleIndex = code.indexOf("styles.boxColor(");
    expect(themeStyleIndex).toBeGreaterThanOrEqual(0);
    expect(runtimeStyleIndex).toBeGreaterThan(themeStyleIndex);
  });

  it("should suppress preserved runtime overrides when a later base declaration wins", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark
      ? ColorConverter.cssWithAlpha(props.theme.color.bgBase, 0.5)
      : "red"};
  background: white;
\`;
`;

    const adapterWithRuntimeFallback = {
      ...fixtureAdapter,
      resolveCall(ctx: CallResolveContext) {
        if (
          ctx.calleeImportedName === "ColorConverter" &&
          ctx.calleeMemberPath?.[0] === "cssWithAlpha"
        ) {
          return {
            usage: "create" as const,
            expr: "`color-mix(in srgb, ${$colors.bgBase} 50%, transparent)`",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
            preserveRuntimeCall: true,
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRuntimeLaterBaseOverride.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRuntimeFallback },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain('backgroundColor: "white"');
    expect(code).not.toContain("ColorConverter.cssWithAlpha");
    expect(code).not.toContain("styles.boxBackgroundColor(");
    expect(code).not.toContain("theme.isDark");
  });

  it("should bail when a later helper mixin could override preserved runtime background", () => {
    const source = `
import styled from "styled-components";
import { color, gradient } from "./lib/helpers";

export const Box = styled.div<{ $dark: string; $light: string }>\`
  background: \${(props) =>
    props.theme.isDark ? color(props.$dark)(props) : color(props.$light)(props)};
  \${gradient()};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRuntimeLaterMixin.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail on inline fallback when a resolved theme branch preserves a runtime override", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark
      ? ColorConverter.cssWithAlpha(props.theme.color.bgBase, 0.5)
      : props.theme.baseTheme?.color.bgBase};
\`;
`;

    const adapterWithRuntimeFallback = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "theme" && ctx.path === "color.bgBase") {
          return {
            expr: "$colors.bgBase",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (
          ctx.calleeImportedName === "ColorConverter" &&
          ctx.calleeMemberPath?.[0] === "cssWithAlpha"
        ) {
          return {
            usage: "create" as const,
            expr: "`color-mix(in srgb, ${$colors.bgBase} 50%, transparent)`",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
            preserveRuntimeCall: true,
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRuntimeInlineFallback.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRuntimeFallback },
    );

    expect(result.code).toBeNull();
  });

  it("should bail on mixed background branches with adapter runtime overrides", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark
      ? ColorConverter.cssWithAlpha(props.theme.color.bgBase, 0.5)
      : "red"};
\`;
`;

    const adapterWithRuntimeGradientFallback = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "theme" && ctx.path === "color.bgBase") {
          return {
            expr: "$colors.bgBase",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (
          ctx.calleeImportedName === "ColorConverter" &&
          ctx.calleeMemberPath?.[0] === "cssWithAlpha"
        ) {
          return {
            usage: "create" as const,
            expr: "`linear-gradient(red, transparent)`",
            imports: [],
            preserveRuntimeCall: true,
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanMixedBackgroundRuntime.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRuntimeGradientFallback },
    );

    expect(result.code).toBeNull();
  });

  it("should bail on mixed dynamic background template and helper branches", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div<{ $dark: string; $light: string }>\`
  background: \${(props) =>
    props.theme.isDark
      ? \`linear-gradient(\${color(props.$dark)(props)}, transparent)\`
      : color(props.$light)(props)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanMixedDynamicBackground.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail instead of emitting an unconditional class for omitted theme branches", () => {
    for (const [caseName, emptyBranch] of [
      ["undefined", "undefined"],
      ["emptyString", '""'],
      ["emptyTemplate", "``"],
    ]) {
      const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) => (props.theme.isDark ? color("labelBase")(props) : ${emptyBranch})};
\`;
`;

      const result = transformWithWarnings(
        {
          source,
          path: join(testCasesDir, `helper-themeBooleanOmittedBranch-${caseName}.input.tsx`),
        },
        { jscodeshift: j, j, stats: () => {}, report: () => {} },
        { adapter: fixtureAdapter },
      );

      expect(result.code, caseName).toBeNull();
    }
  });

  it("should let later base declarations override helper-backed theme branches", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark ? color("bgSub")(props) : color("bgBase")(props)};
  background: white;
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanLaterBaseOverride.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain('backgroundColor: "white"');
    expect(code).not.toContain("theme.isDark");
    expect(code).not.toContain("useTheme");
    expect(code).not.toContain("boxIsDark");
  });

  it("should bail when helper-backed theme branches target an unsupported shorthand", () => {
    const source = `
import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

export const Box = styled.div\`
  padding: \${(props) => (props.theme.isDark ? thinPixel() : "4px")};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanUnsupportedShorthand.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when literal theme branches target an unsupported shorthand", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div\`
  margin: \${(props) => (props.theme.isDark ? "8px 16px" : "4px")};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanLiteralShorthand.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should clear theme background images when a later background shorthand wins", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark ? "linear-gradient(red, blue)" : "url(/light.png)"};
  background: white;
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanLaterBackgroundShorthand.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain('backgroundColor: "white"');
    expect(code).not.toContain("backgroundImage");
    expect(code).not.toContain("theme.isDark");
    expect(code).not.toContain("useTheme");
  });

  it("should reset earlier background images from helper-backed theme color shorthands", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  background: url(/old.png);
  background: \${(props) =>
    props.theme.isDark ? color("bgBase")(props) : color("bgSub")(props)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanBackgroundColorReset.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("backgroundColor: $colors.bgBase");
    expect(code).toContain("backgroundColor: $colors.bgSub");
    expect(code).toContain('backgroundImage: "none"');
  });

  it("should bail when a later resolved style helper can override source-ordered theme buckets", () => {
    const source = `
import styled from "styled-components";
import { color, colorMixin } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
  \${colorMixin()};
\`;
`;

    const adapterWithColorMixin = {
      ...fixtureAdapter,
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName === "colorMixin") {
          return {
            usage: "props" as const,
            expr: "mixins.color",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./mixins.stylex" },
                names: [{ imported: "mixins" }],
              },
            ],
            cssText: "color: green;",
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanResolvedMixinOverride.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithColorMixin },
    );

    expect(result.code).toBeNull();
  });

  it("should preserve important helper-backed theme branch values", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)} !important;
  color: green;
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanImportant.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("theme.isDark ? styles.boxDark : styles.boxLight");
    expect(code).toMatch(/\$\{\$colors\.labelBase\} !important/);
    expect(code).toMatch(/\$\{\$colors\.labelMuted\} !important/);
    expect(code).toContain('color: "green"');
  });

  it("should keep earlier important values when reusing theme buckets", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)} !important;
  color: \${(props) =>
    props.theme.isDark ? color("bgSub")(props) : color("bgBase")(props)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanImportantReuse.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toMatch(/\$\{\$colors\.labelBase\} !important/);
    expect(code).toMatch(/\$\{\$colors\.labelMuted\} !important/);
    expect(code).not.toContain("color: $colors.bgSub");
    expect(code).not.toContain("color: $colors.bgBase");
  });

  it("should clear theme background images when a later resolved background helper wins", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  background: \${(props) =>
    props.theme.isDark ? "linear-gradient(red, blue)" : "url(/light.png)"};
  background: \${(props) => color("bgBase")(props)};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanLaterResolvedBackground.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("backgroundColor: $colors.bgBase");
    expect(code).not.toContain("backgroundImage");
    expect(code).not.toContain("theme.isDark");
    expect(code).not.toContain("useTheme");
  });

  it("should classify full background values wrapped around resolved helpers", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  background: linear-gradient(\${(props) => color("bgSub")(props)}, transparent);
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-backgroundWrappedResolvedValue.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("backgroundImage");
    expect(code).toContain("linear-gradient");
    expect(code).not.toContain("backgroundColor");
  });

  it("should preserve theme hook ordering in intrinsic wrappers", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

const Box = styled.div<{ active: boolean }>\`
  color: \${(props) => (props.active ? "green" : "yellow")};
  color: \${(props) =>
    props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
\`;

export const App = () => <Box active />;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanIntrinsicOrder.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    const activeStyleMatch = code.match(
      /active\s*\?\s*styles\.box[A-Za-z0-9_]*(?:\s*:\s*styles\.box[A-Za-z0-9_]*)?|styles\.box[A-Za-z0-9_]*\(active/,
    );
    const activeStyleIndex = activeStyleMatch?.index ?? -1;
    const themeStyleIndex = code.indexOf("theme.isDark ? styles.boxDark : styles.boxLight");
    if (activeStyleIndex >= 0) {
      expect(themeStyleIndex).toBeGreaterThan(activeStyleIndex);
    }
  });

  it("should preserve theme hook styles in polymorphic intrinsic wrappers", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  color: \${(props) =>
    props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
\`;

export const App = () => <Box as="section">Themed</Box>;
`;

    const adapterWithAsSupport = {
      ...fixtureAdapter,
      externalInterface() {
        return { styles: false, as: true, ref: false };
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanPolymorphicIntrinsic.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithAsSupport },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("const theme = useTheme();");
    expect(code).toContain("theme.isDark ? styles.boxDark : styles.boxLight");
    expect(code).toContain("as?: C");
  });

  it("should pass inline theme fallbacks through polymorphic intrinsic wrappers", () => {
    const source = `
import styled from "styled-components";

function runtimeColor() {
  return "crimson";
}

export const Box = styled.div\`
  color: \${(props) => (props.theme.isDark ? runtimeColor() : props.theme.color.labelMuted)};
\`;

export const App = () => <Box as="section">Themed</Box>;
`;

    const adapterWithAsSupport = {
      ...fixtureAdapter,
      externalInterface() {
        return { styles: false, as: true, ref: false };
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanPolymorphicInlineFallback.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithAsSupport },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("const theme = useTheme();");
    expect(code).toContain("color: theme.isDark ? runtimeColor() : undefined");
    expect(code).toContain("style={{");
    expect(code).toContain("as?: C");
  });

  it("should keep repeated same-theme declarations at their latest source order", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div<{ active: boolean }>\`
  color: \${(props) => (props.theme.isDark ? "red" : "blue")};
  color: \${(props) => (props.active ? "green" : "yellow")};
  color: \${(props) => (props.theme.isDark ? "black" : "white")};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanRepeatedSourceOrder.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    const variantStyleMatch = code.match(
      /active\s*\?\s*styles\.box[A-Za-z0-9_]*(?:\s*:\s*styles\.box[A-Za-z0-9_]*)?|styles\.box[A-Za-z0-9_]*\(active/,
    );
    const variantStyleIndex = variantStyleMatch?.index ?? -1;
    const themeStyleMatches = [
      ...code.matchAll(
        /theme\.isDark\s*\?\s*styles\.box[A-Za-z0-9_]*\s*:\s*styles\.box[A-Za-z0-9_]*/g,
      ),
    ];
    const latestThemeStyleMatch = themeStyleMatches[themeStyleMatches.length - 1];
    const themeStyleIndex = latestThemeStyleMatch?.index ?? -1;
    expect(themeStyleMatches.length).toBeGreaterThanOrEqual(2);
    if (variantStyleIndex >= 0) {
      expect(themeStyleIndex).toBeGreaterThan(variantStyleIndex);
    }
    expect(code).toContain('color: "black"');
    expect(code).toContain('color: "white"');
  });

  it("should not move earlier same-theme properties when later theme properties are added", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div<{ active: boolean }>\`
  color: \${(props) => (props.theme.isDark ? "red" : "blue")};
  color: \${(props) => (props.active ? "green" : "yellow")};
  background: \${(props) => (props.theme.isDark ? "black" : "white")};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanSplitPropertyOrder.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    const variantStyleMatch = code.match(
      /active\s*\?\s*styles\.box[A-Za-z0-9_]*(?:\s*:\s*styles\.box[A-Za-z0-9_]*)?|styles\.box[A-Za-z0-9_]*\(active/,
    );
    const variantStyleIndex = variantStyleMatch?.index ?? -1;
    const themeStyleMatches = [
      ...code.matchAll(
        /theme\.isDark\s*\?\s*styles\.box[A-Za-z0-9_]*\s*:\s*styles\.box[A-Za-z0-9_]*/g,
      ),
    ];
    const firstThemeStyleMatch = themeStyleMatches[0];
    const latestThemeStyleMatch = themeStyleMatches[themeStyleMatches.length - 1];
    const firstThemeStyleIndex = firstThemeStyleMatch?.index ?? -1;
    const latestThemeStyleIndex = latestThemeStyleMatch?.index ?? -1;
    expect(themeStyleMatches.length).toBeGreaterThanOrEqual(2);
    if (variantStyleIndex >= 0) {
      expect(firstThemeStyleIndex).toBeLessThan(variantStyleIndex);
      expect(latestThemeStyleIndex).toBeGreaterThan(variantStyleIndex);
    }
    expect(code).toContain('backgroundColor: "black"');
    expect(code).toContain('backgroundColor: "white"');
  });

  it("should emit later same-theme branches after a base declaration clears one side", () => {
    const source = `
import styled from "styled-components";

export const Box = styled.div\`
  color: \${(props) => (props.theme.isDark ? "red" : "blue !important")};
  color: green;
  color: \${(props) => (props.theme.isDark ? "black" : "white !important")};
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanClearedSideReuse.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("theme.isDark ? styles.boxDark : styles.boxLight");
    expect(code).not.toContain("undefined");
    expect(code).toMatch(/boxDark:\s*\{\s*color: "black"/);
    expect(code).toMatch(/boxLight:\s*\{\s*color: "white !important"/);
  });

  it("should bail instead of hoisting helper-backed theme branches out of nested selectors", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  &:hover {
    color: \${(props) =>
      props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
  }
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanNestedSelector.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail instead of hoisting helper-backed theme branches out of attribute selectors", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Input = styled.input\`
  &[readonly] {
    color: \${(props) =>
      props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
  }
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanAttributeSelector.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail instead of hoisting helper-backed theme branches out of computed media selectors", () => {
    const source = `
import styled from "styled-components";
import { color, screenSize } from "./lib/helpers";

export const Box = styled.div\`
  \${screenSize.phone} {
    color: \${(props) =>
      props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
  }
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanComputedMedia.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail instead of hoisting helper-backed theme branches out of ancestor attributes", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers";

export const Box = styled.div\`
  [data-active] & {
    color: \${(props) =>
      props.theme.isDark ? color("labelBase")(props) : color("labelMuted")(props)};
  }
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanAncestorAttribute.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should preserve stylex imported values in optional theme branch probing", () => {
    const source = `
import styled from "styled-components";
import { $colors } from "./tokens.stylex";

export const Box = styled.div\`
  color: \${(props) => (props.theme.isDark ? $colors.bgSub : $colors.bgBase)};
\`;
`;

    const adapterWithoutImportedValueResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "importedValue") {
          throw new Error("Imported values should use .stylex passthrough");
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
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-themeBooleanStylexImport.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutImportedValueResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("$colors.bgSub");
    expect(code).toContain("$colors.bgBase");
    expect(code).toContain("theme.isDark");
  });

  it("should use call expression when adapter returns a function-like resolvedExpr for dynamic prop arg", () => {
    const source = `
import styled from "styled-components";
import { computeBoxShadow } from "./lib/helpers.ts";

const Box = styled.div<{ level: string }>\`
  box-shadow: \${(props) => computeBoxShadow(props.level)};
  padding: 8px;
\`;

export const App = () => <Box level="high">Hello</Box>;
`;

    const adapterWithCallableResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: { calleeImportedName: string; args: Array<{ kind: string }> }) {
        if (ctx.calleeImportedName === "computeBoxShadow") {
          // Return a callable expression — should be emitted as getShadow(level), not getShadow[level]
          return {
            usage: "create" as const,
            expr: "getShadow",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./shadow-utils" },
                names: [{ imported: "getShadow" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-callPropArgResolved.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCallableResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // The adapter returned a callable expr; consumer should emit getShadow(boxShadow), not getShadow[boxShadow]
    expect(code).toContain("getShadow(");
    expect(code).not.toContain("getShadow[");
    // Import should be remapped
    expect(code).toContain("./shadow-utils");
    expect(code).not.toContain("computeBoxShadow");
  });

  it("should preserve distinct resolved helper bindings for the same dynamic prop", () => {
    const source = `
import styled from "styled-components";
import { shadow } from "./lib/helpers.ts";

const Box = styled.div<{ tone?: string }>\`
  box-shadow: \${(props) => \`\${shadow(props.tone ?? "light")} inset \${shadow(props.tone ?? "dark")}\`};
\`;

export const App = () => <Box tone="muted">Hello</Box>;
`;

    const adapterWithShadowResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: { calleeImportedName: string }) {
        if (ctx.calleeImportedName === "shadow") {
          return {
            usage: "create" as const,
            expr: "getShadow",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./shadow-utils" },
                names: [{ imported: "getShadow" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "helper-distinctResolvedBindings.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithShadowResolution },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain('getShadow(tone ?? "light")');
    expect(code).toContain('getShadow(tone ?? "dark")');
    expect(code).toContain("boxShadow: `${shadowTone} inset ${shadowTone2}`");
  });

  it("should not bail when adapter returns undefined for optional prop-arg helper resolution", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers.ts";

const Box = styled.div<{ tone: string }>\`
  background-color: \${(props) => color(props.tone)};
  padding: 8px;
\`;

export const App = () => <Box tone="muted">Hello</Box>;
`;

    // Adapter that does NOT handle the "color" helper — returns undefined.
    // The optional prop-arg resolution should gracefully fall back,
    // NOT trigger the global bail flag.
    const adapterWithNoColorResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-propArgNoBail.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithNoColorResolution },
    );

    // Should NOT bail — the prop-arg pattern should fall back to preserving the original call
    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // Original helper call should be preserved since the adapter didn't remap it
    expect(code).toContain("color(");
  });

  it("should bail when a defaulted curried helper call cannot be resolved", () => {
    const source = `
import styled from "styled-components";
import { color } from "./lib/helpers.ts";

const Box = styled.div<{ $color?: string }>\`
  background-color: \${(props) => color(props.$color ?? "labelFaint")(props)};
  padding: 8px;
\`;

export const App = () => <Box>Hello</Box>;
`;

    const adapterWithNoColorResolution = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-defaultedCurriedNoResolution.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithNoColorResolution },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(
      "Adapter resolveCall returned undefined for helper call",
    );
  });

  it("should remove resolved helper imports even when generated prop bindings share the name", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/color-helper";
import type { ColorToken } from "./tokens.stylex";

const Box = styled.div<{ $color?: ColorToken }>\`
  background-color: \${(props) => color(props.$color ?? "labelFaint")(props)};
  padding: 8px;
\`;

export const App = () => <Box $color="accent">Accent</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-resolvedImportShadow.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).not.toContain('import { color } from "./lib/color-helper";');
    expect(code).not.toContain("color(");
    expect(code).toContain('$colors[color ?? "labelFaint"]');
  });

  it("should keep static helper resolution when preserveRuntimeCall is not set", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Toggle = styled.div\`
  background-color: \${({ theme }) => ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)};
  padding: 8px 16px;
\`;

export const App = () => <Toggle>Toggle</Toggle>;
`;

    const adapterWithStaticColorMix = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind !== "theme") {
          return undefined;
        }
        if (ctx.path === "color.bgBase") {
          return {
            expr: "$colors.bgBase",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./tokens.stylex" },
                names: [{ imported: "$colors" }],
              },
            ],
          };
        }
        return undefined;
      },
      resolveCall(ctx: {
        calleeImportedName: string;
        calleeMemberPath?: string[];
        args: Array<{ kind: string; value?: unknown }>;
      }) {
        if (
          ctx.calleeImportedName !== "ColorConverter" ||
          ctx.calleeMemberPath?.[0] !== "cssWithAlpha"
        ) {
          return undefined;
        }
        const alphaArg = ctx.args[1];
        const alpha =
          alphaArg?.kind === "literal" && typeof alphaArg.value === "number" ? alphaArg.value : 1;
        return {
          usage: "create" as const,
          expr: `\`color-mix(in srgb, \${$colors.bgBase} ${alpha * 100}%, transparent)\``,
          imports: [
            {
              from: { kind: "specifier" as const, value: "./tokens.stylex" },
              names: [{ imported: "$colors" }],
            },
          ],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "helper-static-colormix.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithStaticColorMix },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("color-mix(in srgb");
    expect(code).toContain("$colors.bgBase");
    expect(code).not.toContain("useTheme");
    expect(code).not.toContain("ColorConverter.cssWithAlpha(");
    expect(code).not.toContain("toggleBackgroundColor");
  });

  it("should classify preserved background runtime overrides from resolved helper text", () => {
    const source = `
import styled from "styled-components";
import { imageHelper } from "./lib/helpers";

const Box = styled.div\`
  background: \${(props) => imageHelper("hero")};
  padding: 8px;
\`;

export const App = () => <Box>Box</Box>;
`;

    const adapterWithRuntimeBackgroundImage = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: CallResolveContext) {
        if (ctx.calleeImportedName !== "imageHelper") {
          return undefined;
        }
        return {
          usage: "create" as const,
          expr: '`url("/static/hero.png")`',
          imports: [],
          preserveRuntimeCall: true,
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "runtime-call-background-image.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRuntimeBackgroundImage },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("backgroundImage");
    expect(code).toContain('stylex.props(styles.box(imageHelper("hero")))');
    expect(code).toContain('backgroundColor: "transparent"');
  });

  it("should preserve static suffix in runtime call override (P1 fix)", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Box = styled.div\`
  transform: \${({ theme }) => ColorConverter.cssWithAlpha(theme.color.primary, 0.5)} translateX(8px);
\`;

export const App = () => <Box>Box</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "runtime-call-suffix.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // The static suffix " translateX(8px)" should be preserved in the runtime call
    expect(code).toContain("translateX(8px)");
    expect(code).toContain("boxTransform");
    expect(code).toContain("ColorConverter.cssWithAlpha");
  });

  it("should preserve !important in runtime call override (P1 fix)", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Box = styled.div\`
  color: \${({ theme }) => ColorConverter.cssWithAlpha(theme.color.primary, 0.5)} !important;
\`;

export const App = () => <Box>Box</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "runtime-call-important.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // The !important should be preserved in the runtime call
    expect(code).toContain("!important");
    expect(code).toContain("ColorConverter.cssWithAlpha");
  });

  it("should allow later runtime call overrides to win over earlier ones (P2 fix)", () => {
    const source = `
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Box = styled.div\`
  color: \${({ theme }) => ColorConverter.cssWithAlpha(theme.color.primary, 0.3)};
  color: \${({ theme }) => ColorConverter.cssWithAlpha(theme.color.secondary, 0.5)};
\`;

export const App = () => <Box>Box</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "runtime-call-override.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // Only the second color declaration should be in the output (secondary, 0.5)
    expect(code).toContain("secondary");
    expect(code).toContain("0.5");
    // The first declaration should NOT be present (primary, 0.3 should be overridden)
    expect(code).not.toMatch(/primary.*0\.3/);
    // Only one boxColor style function call should be present
    const colorFnMatches = code.match(/styles\.boxColor\(/g);
    expect(colorFnMatches?.length).toBe(1);
  });
});

describe("resolveThemeCall bail on undefined", () => {
  it("should bail when resolveThemeCall returns undefined for an unknown theme method", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 16px;
  background-color: \${(props) => props.theme.unknownMethod(props.theme.color.bgBorderSolid)};
\`;

export const App = () => <Box>test</Box>;
`;

    const result = runTransformWithDiagnostics(source, {}, "theme-call-bail.tsx");

    // The transform should bail (return unchanged code) because the adapter
    // returns undefined for the unknown theme method.
    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
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
      return { styles: true, as: false, ref: false } as const;
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
    useSxProp: false,
    usePhysicalProperties: true,
  };
  const noExternalMergerAdapter = {
    externalInterface() {
      return { styles: false, as: false, ref: false };
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
    useSxProp: false,
    usePhysicalProperties: true,
  };
  const absolutePathMergerAdapter = {
    externalInterface() {
      return { styles: true, as: false, ref: false } as const;
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
      importSource: {
        kind: "absolutePath" as const,
        value: pathResolve(__dirname, "fixtures", "stylexProps.ts"),
      },
    },
    useSxProp: false,
    usePhysicalProperties: true,
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

  it("should use merger when static className attrs are present", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button.attrs({
  className: 'static-class',
})\`
  color: blue;
\`;

export const App = () => <Button className="external">Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylexProps");
    expect(result.code).not.toMatch(/const\s+sx\s*=\s*stylex\.props/);
    expect(result.code).toContain("static-class");
  });

  it("should use merger when bridge className is present", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button className="external">Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: mergerAdapter,
        crossFileInfo: {
          selectorUsages: [],
          bridgeComponentNames: new Set(["Button"]),
        },
      },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylexProps");
    expect(result.code).not.toMatch(/const\s+sx\s*=\s*stylex\.props/);
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

  it("should import merger from absolutePath source when merger call is emitted", async () => {
    const source = `
import styled from 'styled-components';

export const Button = styled.button\`
  color: blue;
\`;

export const App = () => <Button>Click</Button>;
`;
    const testPath = pathResolve(__dirname, "fixtures", "components", "test.tsx");

    const result = transformWithWarnings(
      { source, path: testPath },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: absolutePathMergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylexProps(");
    expect(result.code).toContain('import { stylexProps } from "../stylexProps.ts";');
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

  it("should use configured merger for single-use intrinsic inline className/style", async () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: blue;
\`;

export const App = () => <Box className="external" style={{ left: 1 }}>Click</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylexProps(");
    expect(result.code).not.toContain("mergedSx(");
  });

  it("should not promote non-identifier inline style keys", async () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: blue;
\`;

export const App = () => {
  const bg = "red";
  return <Box style={{ "background-color": bg }}>Click</Box>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    // Promotion would create a dynamic style function with invalid identifier syntax.
    expect(result.code).toContain("stylexProps(");
    expect(result.code).toContain('"background-color"');
    expect(result.code).not.toContain("(background-color:");
  });

  it("should use number | string for promoted length-like style params with unknown type", async () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: blue;
\`;

export const App = () => {
  const left = "10px";
  return <Box style={{ left }}>Click</Box>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("(left: number | string) => ({");
    expect(result.code).not.toContain("(left: number) => ({");
  });

  it("should use string type for promoted grid property params (StyleX types grid props as string)", async () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: blue;
\`;

export const App = ({ row }: { row: number }) => {
  return <Box style={{ gridRow: row }}>Click</Box>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("(gridRow: string) => ({");
    expect(result.code).not.toContain("number | string");
    expect(result.code).not.toContain("gridRow: number");
    // Call site must coerce numeric arg to string
    expect(result.code).toContain("String(row)");
  });

  it("should coerce static numeric gridRow values to strings", async () => {
    const source = `
import styled from 'styled-components';

const Box = styled.div\`
  color: blue;
\`;

export const App = () => {
  return <Box style={{ gridRow: 1 }}>Click</Box>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: mergerAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('gridRow: "1"');
    expect(result.code).not.toContain("gridRow: 1");
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

  it("should use verbose inline fallback when no merger is configured", async () => {
    const adapterWithoutMerger = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: true, as: false, ref: false } as const;
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

const Box = styled.div\`
  color: blue;
\`;

export const App = () => <Box className="external" style={{ left: 1 }}>Click</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutMerger },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylex.props(styles.box)");
    expect(result.code).toContain('.filter(Boolean).join(" ")');
    expect(result.code).not.toContain("stylexProps(");
    expect(result.code).not.toContain("mergedSx(");
  });

  it("should use verbose pattern when no merger is configured", async () => {
    const adapterWithoutMerger = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: true, as: false, ref: false } as const;
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
    // Should use the verbose _sx variable pattern (renamed from sx to avoid
    // shadowing the destructured sx prop)
    expect(result.code).toMatch(/const\s+_sx\s*=\s*stylex\.props/);
    // Should have the verbose className merging
    expect(result.code).toContain(".filter(Boolean).join");
    // Should have style spread
    expect(result.code).toContain("..._sx.style");
  });

  it("should include sx in polymorphic shouldForwardProp wrapper type", async () => {
    const adapterWithSxAndAs = {
      styleMerger: {
        functionName: "mergedSx",
        importSource: { kind: "specifier" as const, value: "./lib/mergedSx" },
      },
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: true, as: true, ref: true } as const;
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

interface BoxProps {
  $color?: string;
}

export const Box = styled.div.withConfig({
  shouldForwardProp: (prop) => !prop.startsWith('$'),
})<BoxProps>\`
  color: \${(props) => props.$color ?? 'black'};
\`;

export const App = () => <Box $color="red">Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithSxAndAs },
    );

    expect(result.code).not.toBeNull();
    // The polymorphic type should include sx alongside as
    expect(result.code).toContain("sx?: stylex.StyleXStyles");
    expect(result.code).toContain("as?: C");
  });

  it("should include ref in type when externalInterface returns ref: true", async () => {
    const adapterWithRef = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: false, as: false, ref: true } as const;
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
export const Box = styled.div\`
  color: red;
\`;
export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRef },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('React.ComponentProps<"div">');
  });

  it("should forward ref through props spread when wrapper supports external refs", async () => {
    const adapterWithRef = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: false, as: false, ref: true } as const;
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
import * as React from "react";
import styled from 'styled-components';
export const Box = styled.div\`
  color: red;
\`;
export const App = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  return <Box ref={ref}>Hello</Box>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRef },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toMatch(/const\s*\{\s*children,\s*\.\.\.rest\s*\}\s*=\s*props;/);
    expect(result.code).toMatch(
      /<div\s+\{\.\.\.props\}\s+\{\.\.\.stylex\.props\(styles\.box\)\}\s*\/>/,
    );
    expect(result.code).not.toMatch(/<div[^>]*\bref=\{ref\}/);
  });

  it("should forward ref through props spread for component wrappers", async () => {
    const adapterWithRef = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: false, as: false, ref: true } as const;
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
import * as React from "react";
import styled from "styled-components";

function Base(props: React.ComponentProps<"div">) {
  return <div {...props} />;
}

export const Wrapped = styled(Base)\`
  color: red;
\`;

export const App = () => {
  const ref = React.useRef<HTMLDivElement>(null);
  return <Wrapped ref={ref}>Hello</Wrapped>;
};
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithRef },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(
      /<Base\s+\{\.\.\.props\}\s+\{\.\.\.stylex\.props\(styles\.wrapped\)\}\s*\/>/,
    );
    expect(result.code).not.toMatch(/<Base[^>]*\bref=\{ref\}/);
  });

  it("should not include ref in type when externalInterface returns ref: false", async () => {
    const adapterWithoutRef = {
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
      externalInterface() {
        return { styles: false, as: false, ref: false } as const;
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

const Box = styled.div\`
  color: red;
\`;

export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutRef },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("ref?: React.Ref");
  });
});

describe("conditional value handling", () => {
  it("emits a positive-only variant when alternate is `false` (omit-declaration sentinel)", () => {
    // In styled-components, falsy interpolations like `false` mean "omit this declaration".
    // We model this as a single positive variant bucket — equivalent to `$disabled && "not-allowed"`.
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

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('cursor: "not-allowed"');
    expect(result.code).not.toContain('cursor: "false"');
    expect(result.code).not.toContain("cursor: false");
  });

  it("does not unconditionally apply the alternate when consequent is `undefined`", () => {
    // `prop ? undefined : value` must NOT be lowered to a single `!prop`
    // variant via splitVariantsResolved* — that path treats `!`-prefixed
    // `when` strings as the unconditional default and would silently drop
    // the gate. Falling back to a dynamic style function is the safe choice.
    const source = `
import styled from "styled-components";

const Button = styled.button<{ $disabled?: boolean }>\`
  cursor: \${(p) => (p.$disabled ? undefined : "pointer")};
\`;

export const App = () => <Button>Click</Button>;
`;

    const result = transformWithWarnings(
      { source, path: "negative-only-variant.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Guard against the regression where the value bleeds into an unconditional
    // base style rule (which would set cursor: "pointer" for ALL <Button> uses,
    // including when $disabled is true).
    expect(result.code).not.toMatch(/cursor:\s*"pointer"\s*[,}]/);
  });

  it("negates observed guarded variants when the populated branch is the alternate", () => {
    const source = `
import styled from "styled-components";

export const Badge = styled.div<{ active?: boolean; color: string }>\`
  color: \${(props) => props.active ? "" : props.color};
\`;

export const App = () => (
  <div>
    <Badge color="blue">Blue</Badge>
    <Badge color="green">Green</Badge>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "inverse-guarded-observed-variant.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // With simple guard recognition, variants are grouped into a dimension
    expect(result.code).toContain("!active && badgeColorVariants[color]");
    expect(result.code).toContain("!active && styles.badgeColor(color)");
    // Should NOT have positive guard since the ternary's true branch is the static value
    expect(result.code).not.toMatch(/(^|[^!])active && badgeColorVariants/);
  });

  it("keeps a runtime fallback for simple guarded observed scalar variants", () => {
    const source = `
import styled from "styled-components";

export const Badge = styled.div<{ active?: boolean; color: string }>\`
  color: \${(props) => props.active ? props.color : ""};
\`;

export const App = () => (
  <div>
    <Badge active color="blue">Blue</Badge>
    <Badge active color="green">Green</Badge>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "simple-guarded-observed-variant.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // With simple guard recognition, variants are grouped into a dimension
    // The ternary uses the dimension lookup for non-boolean condition
    expect(result.code).toContain("active ? badgeColorVariants[color] : undefined");
    expect(result.code).toContain("active && styles.badgeColor(color)");
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
        return { styles: false, as: false, ref: false } as const;
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false } as const;
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
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterThatResolves },
    );

    // Should succeed because adapter resolved the call
    expect(result.code).not.toBeNull();
  });

  it("should bail when adapter returns the same helper imported via a parent-relative specifier", () => {
    const source = `
import styled from "styled-components";
import { getPrimaryStyles } from "../external-helpers";

const Button = styled.button\`
  padding: 8px 16px;
  \${getPrimaryStyles()}
\`;

export const App = () => <Button>Click me</Button>;
`;

    const adapterThatReturnsUnchangedHelper = {
      externalInterface() {
        return { styles: false, as: false, ref: false } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "getPrimaryStyles()",
          imports: [
            {
              from: { kind: "specifier" as const, value: "../external-helpers" },
              names: [{ imported: "getPrimaryStyles" }],
            },
          ],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "/workspace/src/components/imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterThatReturnsUnchangedHelper },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((warning) => warning.type)).toContain(
      "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
    );
  });

  it("should bail when adapter returns the same helper imported through a directory index", () => {
    const source = `
import styled from "styled-components";
import { getPrimaryStyles } from "../external-helpers";

const Button = styled.button\`
  padding: 8px 16px;
  \${getPrimaryStyles()}
\`;

export const App = () => <Button>Click me</Button>;
`;

    const adapterThatReturnsUnchangedHelper = {
      externalInterface() {
        return { styles: false, as: false, ref: false } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "getPrimaryStyles()",
          imports: [
            {
              from: { kind: "specifier" as const, value: "../external-helpers" },
              names: [{ imported: "getPrimaryStyles" }],
            },
          ],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "/workspace/src/components/imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: adapterThatReturnsUnchangedHelper,
        resolveModule(fromFile, specifier) {
          if (
            fromFile === "/workspace/src/components/imported-helper-call.tsx" &&
            specifier === "../external-helpers"
          ) {
            return "/workspace/src/external-helpers/index.ts";
          }
          return undefined;
        },
      },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((warning) => warning.type)).toContain(
      "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
    );
  });

  it("should not treat different parent-relative helper imports with the same basename as the same source", () => {
    const source = `
import styled from "styled-components";
import { getPrimaryStyles } from "../external-helpers";

const Button = styled.button\`
  padding: 8px 16px;
  \${getPrimaryStyles()}
\`;

export const App = () => <Button>Click me</Button>;
`;

    const adapterThatReturnsDifferentHelper = {
      externalInterface() {
        return { styles: false, as: false, ref: false } as const;
      },
      resolveValue() {
        return undefined;
      },
      resolveCall() {
        return {
          usage: "props" as const,
          expr: "getPrimaryStyles()",
          imports: [
            {
              from: { kind: "specifier" as const, value: "../../shared/external-helpers" },
              names: [{ imported: "getPrimaryStyles" }],
            },
          ],
        };
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "/workspace/src/components/imported-helper-call.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterThatReturnsDifferentHelper },
    );

    expect(result.code).not.toBeNull();
    expect(result.warnings.map((warning) => warning.type)).not.toContain(
      "Adapter resolved an imported helper call as StyleX styles without replacing the RuleSet helper",
    );
  });
});

describe("conditional logical OR/AND mixed operators", () => {
  it("should bail when || wraps && to avoid ambiguous condition serialization", () => {
    // ($a && $b) || $c would serialize as "$a && $b || $c", which
    // parseVariantWhenToAst would reparse as $a && ($b || $c) — wrong truth table
    const source = `
import styled, { css } from "styled-components";
const Box = styled.div<{ $a?: boolean; $b?: boolean; $c?: boolean }>\`
  width: 100px;
  \${({ $a, $b, $c }) =>
    (($a && $b) || $c) &&
    css\`
      background-color: red;
    \`}
\`;
export const App = () => <Box />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });

  it("should transform pure || conditions correctly", () => {
    const source = `
import styled, { css } from "styled-components";
const Dot = styled.div<{ $active?: boolean; $completed?: boolean }>\`
  background-color: white;
  \${({ $active, $completed }) =>
    ($active || $completed) &&
    css\`
      background-color: blue;
    \`}
\`;
export const App = () => <Dot />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("active || completed");
    expect(result.code).not.toContain("$active");
    expect(result.code).toContain("dotActiveOrCompleted");
  });

  it("should transform negated || conditions correctly", () => {
    const source = `
import styled, { css } from "styled-components";
const Step = styled.div<{ $active?: boolean; $completed?: boolean }>\`
  background-color: blue;
  \${({ $active, $completed }) =>
    !($active || $completed) &&
    css\`
      background-color: gray;
    \`}
\`;
export const App = () => <Step />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("!(active || completed)");
    expect(result.code).not.toContain("$active");
    expect(result.code).toContain("stepNotActiveOrCompleted");
  });

  it("should transform && wrapping || on the right correctly", () => {
    const source = `
import styled, { css } from "styled-components";
const Badge = styled.span<{ $visible?: boolean; $primary?: boolean; $accent?: boolean }>\`
  background-color: gray;
  \${({ $visible, $primary, $accent }) =>
    $visible &&
    ($primary || $accent) &&
    css\`
      background-color: blue;
    \`}
\`;
export const App = () => <Badge />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("primary || accent");
    expect(result.code).not.toContain("$primary");
    expect(result.code).toContain("badgeVisiblePrimaryOrAccent");
  });

  it("should bail when && chain contains negated && group: $a && !($b && $c)", () => {
    // "!($b && $c)" inside a larger && chain would be mis-tokenized by
    // parseVariantWhenToAst's naive split("&&")
    const source = `
import styled, { css } from "styled-components";
const Box = styled.div<{ $a?: boolean; $b?: boolean; $c?: boolean }>\`
  width: 100px;
  \${({ $a, $b, $c }) =>
    $a &&
    !($b && $c) &&
    css\`
      background-color: red;
    \`}
\`;
export const App = () => <Box />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
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
        return { styles: false, as: false, ref: false };
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
              from: {
                kind: "specifier" as const,
                value: "./lib/helpers.stylex",
              },
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
      useSxProp: false,
      usePhysicalProperties: true,
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

  it("should warn with cssText hint when imported StyleX value inside pseudo omits cssText", () => {
    const source = `
import styled from "styled-components";
import { focusOutline } from "./lib/helpers";

const Button = styled.button\`
  &:focus-visible {
    \${focusOutline}
  }
\`;

export const App = () => <Button>Hello</Button>;
`;

    const adapterWithoutCssText = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return {
          usage: "props" as const,
          expr: "helpers.focusOutline",
          imports: [],
        };
      },
      resolveCall() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test-imported-value-no-csstext.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutCssText },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]!.type).toBe(
      "Adapter resolved imported StyleX value under nested selectors/at-rules but did not provide cssText for property expansion — add cssText to resolveValue result to enable pseudo-wrapping",
    );
    expect(result.warnings[0]!.context).toMatchObject({
      selector: "&:focus-visible",
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
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

  it("should lower destructured-param ternary template literals via the css-helper handler", () => {
    // Regression test: tryHandlePropertyTernaryTemplateLiteral relies on
    // getArrowFnParamBindings, which supports object-pattern parameters. The
    // shared `findArrowSlotExpr` helper must not reject those upstream.
    // Without this, destructured-param ternaries with adapter-resolvable
    // helper calls inside the template branches fall through and bail.
    // The identifier-param shape and the destructured-param shape must produce
    // the same lowered output.
    const identSource = `
import styled from "styled-components";
import { color } from "./lib/helpers";

const Box = styled.div<{ $faded: boolean }>\`
  background: \${(props) =>
    props.$faded
      ? \`linear-gradient(to bottom, \${color("bgSub")(props)} 70%, transparent 100%)\`
      : \`linear-gradient(to bottom, \${color("bgSub")(props)} 70%, \${color("bgSub")(props)} 100%)\`};
\`;

export const App = () => <Box $faded />;
`;

    const destructuredSource = `
import styled from "styled-components";
import { color } from "./lib/helpers";

const Box = styled.div<{ $faded: boolean }>\`
  background: \${({ $faded }) =>
    $faded
      ? \`linear-gradient(to bottom, \${color("bgSub")()} 70%, transparent 100%)\`
      : \`linear-gradient(to bottom, \${color("bgSub")()} 70%, \${color("bgSub")()} 100%)\`};
\`;

export const App = () => <Box $faded />;
`;

    const identResult = transformWithWarnings(
      { source: identSource, path: "ternary-template-ident.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    const destrResult = transformWithWarnings(
      { source: destructuredSource, path: "ternary-template-destr.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(identResult.code).not.toBeNull();
    expect(destrResult.code).not.toBeNull();
    // Both branches must reach the css-helper variant lowering — base + variant
    // entries with backgroundImage strings interpolated through `$colors.bgSub`.
    for (const code of [identResult.code, destrResult.code] as string[]) {
      expect(code).toContain("$colors.bgSub");
      expect(code).toMatch(/backgroundImage:.*70%, transparent/);
      expect(code).toMatch(/backgroundImage:.*70%, \$\{\$colors\.bgSub\} 100%/);
    }
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

describe("double .attrs() chain bails safely", () => {
  it("should leave file unchanged when styled has multiple .attrs() calls", () => {
    const source = `
import styled from "styled-components";

const Input = styled.input.attrs({ type: "text" }).attrs({ autoComplete: "off" })\`
  padding: 8px;
\`;

export const App = () => <Input />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });

  it("should leave file unchanged when styled(tag).withConfig().attrs().attrs() is used", () => {
    const source = `
import styled from "styled-components";

const Input = styled("input")
  .withConfig({ shouldForwardProp: p => p !== "size" })
  .attrs({ type: "text" })
  .attrs({ autoComplete: "off" })\`
  padding: 8px;
\`;

export const App = () => <Input />;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });
});

describe("attrs defaultAttrs nullish coalescing", () => {
  it("preserves callback prop reads as dynamic attrs instead of static expressions", () => {
    const source = `
import styled from "styled-components";

function Icon(props: { size?: number; className?: string }) {
  return <svg width={props.size} height={props.size} className={props.className} />;
}

const StyledIcon = styled(Icon).attrs((p) => ({
  size: p.size,
}))\`
  position: relative;
\`;

export const App = () => <StyledIcon size={14} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size={size}");
    expect(result.code).not.toContain("p.size");
  });

  it("merges expression-valued className attrs with generated and caller classes", () => {
    const source = `
import styled from "styled-components";

const attrsClassName = "attrs-class";

const Box = styled.div.attrs({
  className: attrsClassName,
})\`
  color: red;
\`;

export const App = () => <Box className="caller">Box</Box>;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('[attrsClassName, "caller"].filter(Boolean).join(" ")');
    expect(result.code).not.toContain("className={attrsClassName}");
  });

  it("space-joins merged attrs className arrays in the no-merger fallback", () => {
    const source = `
import styled from "styled-components";

const attrsClassName = "attrs-class";

const Box = styled.div.attrs({
  className: attrsClassName,
})\`
  color: red;
\`;

export const App = () => <Box className="caller">Box</Box>;
`;
    const adapterWithoutMerger = {
      ...fixtureAdapter,
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = runTransformWithDiagnostics(source, { adapter: adapterWithoutMerger });

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('[attrsClassName, "caller"].filter(Boolean).join(" ")');
    expect(result.code).not.toContain('[sx.className, [attrsClassName, "caller"]]');
  });

  it("merges expression-valued style attrs before caller styles", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const attrsStyle = { opacity: 0.8 } satisfies React.CSSProperties;
const callerStyle = { marginTop: 4 } satisfies React.CSSProperties;

const Box = styled.div.attrs({
  style: attrsStyle,
})\`
  color: red;
\`;

export const App = () => <Box style={callerStyle}>Box</Box>;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("...attrsStyle");
    expect(result.code).toContain("...callerStyle");
    expect(result.code).not.toContain("style={attrsStyle}");
  });

  it("emits expression-valued static attrs in minimal wrappers", () => {
    const source = `
import styled from "styled-components";

const moduleId = "scroll-region";

const Box = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
  id: moduleId,
}))\`
  overflow: auto;
\`;

export const App = () => <Box />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("id={moduleId}");
  });

  it("uses expression-valued as attrs as render targets", () => {
    const source = `
import styled from "styled-components";

const Components = {
  Button: "button" as const,
};

const Box = styled.div.attrs({
  as: Components.Button,
})\`
  color: red;
\`;

export const App = () => <Box type="button">Box</Box>;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("<Components.Button");
    expect(result.code).not.toContain("as={Components.Button}");
  });

  it("builds nested JSX member names for expression-valued as attrs", () => {
    const source = `
import styled from "styled-components";

const Components = {
  UI: {
    Button: "button" as const,
  },
};

const Box = styled.div.attrs({
  as: Components.UI.Button,
})\`
  color: red;
\`;

export const App = () => <Box type="button">Box</Box>;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("<Components.UI.Button");
    expect(result.code).not.toContain("UI.Button={");
  });

  it("uses original prop names for aliased callback attrs", () => {
    const source = `
import styled from "styled-components";

function Icon(props: { size?: number; className?: string }) {
  return <svg width={props.size} height={props.size} className={props.className} />;
}

const StyledIcon = styled(Icon).attrs(({ size: iconSize }) => ({
  size: iconSize,
}))\`
  position: relative;
\`;

export const App = () => <StyledIcon size={14} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size={size}");
    expect(result.code).not.toContain("iconSize");
  });

  it("preserves destructured callback defaults in dynamic attrs", () => {
    const source = `
import styled from "styled-components";

function Icon(props: { size?: number; className?: string }) {
  return <svg width={props.size} height={props.size} className={props.className} />;
}

const StyledIcon = styled(Icon).attrs(({ size = 14 }) => ({
  size,
}))\`
  position: relative;
\`;

export const App = () => <StyledIcon />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size === undefined ? 14 : size");
    expect(result.code).not.toContain("size ?? 14");
  });

  it("emits dynamic attr defaults when the source prop is absent in promoted inline rewrites", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs(({ size = 14 }) => ({
  size,
}))\`
  color: red;
\`;

export const App = () => <Box style={{ marginTop: 4 }} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size === undefined ? 14 : size");
  });

  it("preserves boolean destructured callback defaults in dynamic attrs", () => {
    const source = `
import styled from "styled-components";

const Box = styled.button.attrs(({ disabled = true }) => ({
  disabled,
}))\`
  color: red;
\`;

export const App = () => <Box />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("disabled === undefined ? true : disabled");
  });

  it("does not treat callback-local attrs variables as static attrs", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs((props) => {
  const resolved = props.id;
  return { id: resolved };
})\`
  color: red;
\`;

export const App = () => <Box id="box" />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).toBeNull();
  });

  it("treats callback function declarations as local attrs bindings", () => {
    const source = `
import styled from "styled-components";

const Box = styled.button.attrs(() => {
  function handleClick() {}
  return { onClick: handleClick };
})\`
  color: red;
\`;

export const App = () => <Box />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).toBeNull();
  });

  it("tracks rest bindings in attrs callback parameters", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs(({ ...p }) => ({
  id: p.id,
}))\`
  color: red;
\`;

export const App = () => <Box id="box" />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('id="box"');
    expect(result.code).not.toContain("p.id");
  });

  it("does not treat partial object rest as the full props object", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs(({ id, ...rest }) => ({
  "data-id": rest.id,
}))\`
  color: red;
\`;

export const App = () => <Box id="box" />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).toBeNull();
  });

  it("unwraps defaulted object-pattern attrs parameters", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs(({ size } = {}) => ({
  size,
}))\`
  color: red;
\`;

export const App = () => <Box size={14} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size={size}");
    expect(result.code).not.toContain("size={size}\n       size={size}");
  });

  it("bails for attrs callbacks that alias string-literal prop names", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs(({ "aria-label": ariaLabel }) => ({
  title: ariaLabel,
}))\`
  color: red;
\`;

export const App = () => <Box aria-label="Box" />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).toBeNull();
  });

  it("keeps module-scope props objects as static attrs in object-form attrs", () => {
    const source = `
import styled from "styled-components";

const props = { id: "module-id" };

const Box = styled.div.attrs({
  id: props.id,
})\`
  color: red;
\`;

export const App = () => <Box />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("id={props.id}");
    expect(result.code).not.toContain("id={id}");
  });

  it("passes attrs style as the merger style argument without shifting arity", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const attrsStyle = { opacity: 0.8 } satisfies React.CSSProperties;

const Box = styled.div.attrs({
  style: attrsStyle,
})\`
  color: red;
\`;

export const App = () => <Box>Box</Box>;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("mergedSx(styles.box, undefined, attrsStyle)");
    expect(result.code).not.toContain("mergedSx(styles.box, undefined, undefined, attrsStyle)");
  });

  it("emits intrinsic dynamic attrs after rest spreads so attrs override target props", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs((props) => ({
  tabIndex: props.tabIndex ?? 0,
  "data-size": props.size,
}))\`
  overflow: auto;
\`;

export const App = () => <Box size={1} data-size={2} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/\{\.\.\.rest\}\s+data-size=\{size\}/);
  });

  it("places shared dynamic attrs after rest spreads so attrs override target props", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div
  .withConfig({ shouldForwardProp: (prop) => prop !== "size" })
  .attrs((props: { size?: number }) => ({
    "data-size": props.size,
  }))\`
  color: red;
\`;

export const App = () => <Box size={1} data-size={2} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(/\{\.\.\.rest\}\s+data-size=\{size\}/);
  });

  it("lets child dynamic attrs override inherited dynamic attrs", () => {
    const source = `
import styled from "styled-components";

function Icon(props: { size?: number; className?: string }) {
  return <svg width={props.size} height={props.size} className={props.className} />;
}

const BaseIcon = styled(Icon).attrs((props) => ({
  size: props.size,
}))\`
  position: relative;
\`;

const ChildIcon = styled(BaseIcon).attrs((props) => ({
  size: props.iconSize,
}))<{ iconSize?: number }>\`
  left: -3px;
\`;

export const App = () => <ChildIcon iconSize={14} />;
`;

    const result = runTransformWithDiagnostics(source);

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("size={iconSize}");
    expect(result.code).not.toContain("size={size}\n       size={iconSize}");
  });

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

  it("should preserve numeric-looking string defaults in destructured attrs props", () => {
    // Regression test: defaults like "01" must stay strings when emitted as
    // destructuring defaults, otherwise strict comparisons and prop types can change.
    const source = `
import styled from "styled-components";

const Box = styled.div.attrs((props) => ({
  role: props.role ?? "01",
}))<{ role?: string }>\`
  color: \${(props) => props.role === "01" ? "red" : "blue"};
\`;

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: "attrs-string-default.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('role = "01"');
    expect(result.code).not.toContain("role = 1");
  });
});

describe("attrs runtime semantics with usage:props mixins", () => {
  it("keeps wrapper for transient conditional attrs combined with usage:props mixins", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

const Box = styled.div.attrs((props: { $smallFlag?: boolean }) => ({
  size: props.$smallFlag ? 5 : undefined,
}))\`
  \${scrollFadeMaskStyles(18, "both")}
\`;

export function App() {
  const smallFlag = Math.random() > 0.5;
  return <Box $smallFlag={smallFlag}>x</Box>;
}
`;

    const result = transformWithWarnings(
      { source, path: "attrs-runtime-conditional-usage-props.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("function Box(");
    expect(code).toMatch(/size=\{\$smallFlag \? 5 : undefined\}/);
    expect(code).not.toContain("size={5}");
  });

  it("keeps wrapper for transient inverted attrs combined with usage:props mixins", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";
import { scrollFadeMaskStyles } from "./lib/helpers";

const Box = styled.div.attrs((props: { $collapsedFlag?: boolean }) => ({
  "data-open": props.$collapsedFlag !== true,
}))\`
  \${scrollFadeMaskStyles(18, "both")}
\`;

export function App() {
  const collapsedFlag = Math.random() > 0.5;
  return <Box $collapsedFlag={collapsedFlag}>x</Box>;
}
`;

    const result = transformWithWarnings(
      { source, path: "attrs-runtime-inverted-usage-props.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("function Box(");
    expect(code).toMatch(/data-open=\{\$collapsedFlag !== true\}/);
    expect(code).not.toContain("data-open={true}");
  });
});

describe("theme boolean conditionals", () => {
  it("should use adapter-configured theme hook import and function name", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  opacity: \${(props) => props.theme.isDark ? 1 : 0.8};
\`;

export const App = () => <Box>Hello</Box>;
`;

    const adapterWithCustomThemeHook = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
      themeHook: {
        functionName: "useDesignTheme",
        importSource: {
          kind: "specifier" as const,
          value: "@company/theme-hooks",
        },
      },
    } as Adapter;

    const result = transformWithWarnings(
      { source, path: "theme-custom-hook.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithCustomThemeHook },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('import { useDesignTheme } from "@company/theme-hooks";');
    expect(result.code).toContain("const theme = useDesignTheme();");
    expect(result.code).not.toContain('import { useTheme } from "styled-components";');
  });

  it("should support absolutePath importSource for adapter-configured theme hook", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  opacity: \${(props) => props.theme.isDark ? 1 : 0.8};
\`;

export const App = () => <Box>Hello</Box>;
`;

    const inputPath = pathResolve(__dirname, "fixtures", "components", "theme-custom-hook-abs.tsx");
    const adapterWithAbsoluteThemeHook = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
      themeHook: {
        functionName: "useDesignTheme",
        importSource: {
          kind: "absolutePath" as const,
          value: pathResolve(__dirname, "fixtures", "theme-hooks.ts"),
        },
      },
    } as Adapter;

    const result = transformWithWarnings(
      { source, path: inputPath },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithAbsoluteThemeHook },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('import { useDesignTheme } from "../theme-hooks.ts";');
    expect(result.code).toContain("const theme = useDesignTheme();");
  });

  it("should alias configured hook import when local useTheme binding is occupied by another module", () => {
    const source = `
import styled from "styled-components";
import { useTheme } from "@company/app-theme";

const Box = styled.div\`
  opacity: \${(props) => props.theme.isDark ? 1 : 0.8};
\`;

export const App = () => {
  const appTheme = useTheme();
  return <Box>{appTheme.name}</Box>;
};
`;

    const adapterWithAliasedThemeHookImport = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
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
      useSxProp: false,
      usePhysicalProperties: true,
      themeHook: {
        functionName: "useTheme",
        importSource: {
          kind: "specifier" as const,
          value: "@company/theme-hooks",
        },
      },
    } as Adapter;

    const result = transformWithWarnings(
      { source, path: "theme-hook-alias-existing.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithAliasedThemeHookImport },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain(
      'import { useTheme as useStyledTheme } from "@company/theme-hooks";',
    );
    expect(result.code).toContain('import { useTheme } from "@company/app-theme";');
    expect(result.code).toContain("const theme = useStyledTheme();");
    expect(result.code).toContain("const appTheme = useTheme();");
    const outputRoot = j(result.code ?? "");
    let useThemeLocalBindingCount = 0;
    let useStyledThemeLocalBindingCount = 0;
    outputRoot.find(j.ImportDeclaration).forEach((importPath: any) => {
      for (const specifier of (importPath.node.specifiers ?? []) as any[]) {
        if (specifier.type !== "ImportSpecifier") {
          continue;
        }
        const localName = specifier.local?.name ?? specifier.imported?.name;
        if (localName === "useTheme") {
          useThemeLocalBindingCount++;
        }
        if (localName === "useStyledTheme") {
          useStyledThemeLocalBindingCount++;
        }
      }
    });
    expect(useThemeLocalBindingCount).toBe(1);
    expect(useStyledThemeLocalBindingCount).toBe(1);
  });

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

      function Box({ children }: { children?: React.ReactNode }) {
        const theme = useTheme();
        return <div sx={theme.isDark ? styles.boxDark : styles.boxLight}>{children}</div>;
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

      function Box({ children }: { children?: React.ReactNode }) {
        const theme = useTheme();

        return (
          <div
            sx={theme.isHighContrast ? styles.boxHighContrast : styles.boxNotHighContrast}>{children}</div>
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

      function Box({ children }: { children?: React.ReactNode }) {
        const theme = useTheme();

        return (
          <div
            sx={[
              theme.isDark ? styles.boxDark : styles.boxLight,
              theme.isHighContrast ? styles.boxHighContrast : styles.boxNotHighContrast,
            ]}>{children}</div>
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

  it("should handle complex conditions combining theme boolean with prop access as inline style", () => {
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

    // Now handled via inline style with useTheme() hook
    expect(result.code).not.toBeNull();
    expect(result.warnings).toEqual([]);
    expect(result.code).toContain("useTheme");
    expect(result.code).toContain("theme.isDark");
  });

  it("should bail when destructured sibling props would be out of scope in useTheme wrapper", () => {
    // When the arrow function destructures both theme and other props like `enabled`,
    // the inline style fallback must NOT accept the expression because `enabled`
    // would reference an undefined variable in the generated wrapper (only `theme`
    // is available via useTheme()).
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  background-color: \${({ theme, enabled }) =>
    theme.isDark
      ? (enabled ? theme.baseTheme?.color.bgSub : theme.baseTheme?.color.bgBase)
      : theme.color.bgFocus};
\`;

export const App = () => <Box enabled>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-destructured-sibling.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail rather than produce output referencing `enabled` out of scope
    expect(result.code).toBeNull();
  });

  it("should bail when inline style fallback is inside pseudo/media context", () => {
    // The inline style fallback writes to base styleObj/inlineStyleProps,
    // which don't preserve pseudo/media selectors. Must bail to avoid
    // silently losing the :hover/:focus/@media condition.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  &:hover {
    color: \${(p) =>
      p.theme.isDark ? p.theme.baseTheme?.color.bgSub : p.theme.color.bgFocus};
  }
\`;

export const App = () => <Box>Hover me</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-pseudo-inline-fallback.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when inline style fallback targets a CSS shorthand property", () => {
    // When cssProp is a shorthand like `padding`, cssDeclarationToStylexDeclarations
    // expands it to longhands (paddingTop, paddingRight, etc.). The inline style would
    // assign the same opaque expression to each longhand, which is wrong for
    // multi-value shorthand tokens like "6px 12px".
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: \${(p) =>
    p.theme.isDark ? p.theme.baseTheme?.color.bgSub : "8px"};
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-shorthand-inline-fallback.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when a later declaration would override an inline theme fallback", () => {
    const source = `
import styled from "styled-components";

function runtimeColor() {
  return "crimson";
}

const Box = styled.div\`
  color: \${(p) => (p.theme.isDark ? runtimeColor() : p.theme.color.bgBase)};
  color: green;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-inline-fallback-later-override.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when a later dynamic declaration would override an inline theme fallback", () => {
    const source = `
import styled from "styled-components";

function runtimeColor() {
  return "crimson";
}

const Box = styled.div\`
  color: \${(p) => (p.theme.isDark ? runtimeColor() : p.theme.color.bgBase)};
  color: \${(p) => (p.$active ? "green" : "blue")};
\`;

export const App = () => <Box $active>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-inline-fallback-later-dynamic-override.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when a later background shorthand would reset an inline theme fallback", () => {
    const source = `
import styled from "styled-components";

function runtimeImage() {
  return "url(hero.png)";
}

const Box = styled.div\`
  background-image: \${(p) => (p.theme.isDark ? runtimeImage() : "none")};
  background: white;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-inline-fallback-later-background-reset.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when destructured sibling has aliased binding with default value", () => {
    // ({ theme, enabled: isEnabled = false }) => ... should track `isEnabled`
    // (the actual binding), not `enabled` (the key name).
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  background-color: \${({ theme, enabled: isEnabled = false }) =>
    theme.isDark
      ? (isEnabled ? theme.baseTheme?.color.bgSub : theme.baseTheme?.color.bgBase)
      : theme.color.bgFocus};
\`;

export const App = () => <Box enabled>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-aliased-destructured.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should bail when both theme boolean branches are unresolvable", () => {
    // When resolveValueOptional returns undefined for both branches of a
    // theme.isDark ternary, the codemod must bail rather than fall through
    // to generic handlers that would emit the arrow function as a string.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: \${(p) =>
    p.theme.isDark ? p.theme.baseTheme?.color.bgSub : p.theme.baseTheme?.color.bgBase};
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-both-unresolved.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
  });

  it("should not reject sibling binding when name collides with theme property path segment", () => {
    // collectIdentifiers picks up member property names like `color` from
    // `theme.color.bgFocus`. A destructured sibling named `color` must not
    // cause a false positive rejection — only actual free variable references
    // should be checked.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  background-color: \${({ theme, color }) =>
    theme.isDark ? theme.baseTheme?.color.bgSub : theme.color.bgFocus};
\`;

export const App = () => <Box color="red">Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-color-sibling.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // The `color` destructured param is never referenced in the expression
    // (only theme.color is used), so the transform should succeed
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("useTheme");
  });

  it("should bail on theme access inside pseudo/media context (module-scoped style fn)", () => {
    // Theme-rewritten expressions can't be placed in module-scoped stylex.create functions.
    // The `theme` variable from useTheme() is only available in the wrapper component body.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  &:hover {
    color: \${(props) => props.theme.isDark && props.$isActive ? "red" : "blue"};
  }
\`;

export const App = () => <Box $isActive>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-pseudo-scope.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail because theme access in pseudo/media context would put
    // the expression in a module-scoped stylex.create() style function
    expect(result.code).toBeNull();
  });

  it("should bail on theme access in shouldForwardProp context (module-scoped style fn)", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  width: \${(props) => props.theme.size * 2}px;
\`.withConfig({ shouldForwardProp: (p) => p !== "size" });

export const App = () => <Box>Hello</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "theme-sfp-scope.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail because theme access in shouldForwardProp context would put
    // the expression in a module-scoped stylex.create() style function
    expect(result.code).toBeNull();
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

describe("attribute selector handling", () => {
  it("should bail on [readonly] for non-input elements like textarea", () => {
    // Regression: [readonly] attribute selector was recognized by parseAttributeSelectorInternal
    // for ALL elements, but the attrWrapper pattern only supports <input>. For non-input
    // elements, the readonly styles fell through unconditionally into the base style object.
    const source = `
import styled from "styled-components";

const TextArea = styled.textarea\`
  padding: 8px;
  font-size: 14px;

  &[readonly] {
    background: #fafafa;
    border-style: dashed;
  }
\`;

export const App = () => <TextArea />;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    // Should bail — [readonly] on textarea is an unsupported attribute selector
    expect(result.code).toBeNull();
  });

  it("should handle [readonly] correctly on input elements as JS prop conditional", () => {
    // [readonly] on <input> should produce a separate style object applied via readOnly prop,
    // NOT a :read-only pseudo-class (which matches too broadly: disabled, checkbox, radio).
    const source = `
import styled from "styled-components";

const Input = styled.input\`
  padding: 8px;

  &[readonly] {
    background: #fafafa;
  }
\`;

export const App = () => <Input readOnly value="test" />;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // Should use JS conditional, not :read-only pseudo-class
    expect(result.code).toContain("readOnly && styles.inputReadonly");
    expect(result.code).not.toContain(":read-only");
  });

  it("should normalize shorthand/longhand conflicts in readonly style objects", () => {
    // Regression: readonlyKey was missing from collectComponentStyleKeys, so shorthand
    // declarations in [readonly] blocks were not expanded when conflicting with base longhands.
    const source = `
import styled from "styled-components";

const Input = styled.input\`
  padding: 8px 12px;

  &[readonly] {
    padding: 0;
    background: #fafafa;
  }
\`;

export const App = () => <Input readOnly value="test" />;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // The fixture adapter uses logical longhands for 2-value shorthands.
    // The readonly block has padding: 0 which should be expanded to match.
    expect(result.code).toContain("paddingBlock");
    expect(result.code).toContain("paddingInline");
    // The readonly style should NOT have the shorthand "padding" since it conflicts
    // with the base's logical longhands.
    const readonlyMatch = result.code!.match(/inputReadonly:\s*\{([^}]+)\}/);
    expect(readonlyMatch).toBeTruthy();
    const readonlyBlock = readonlyMatch![1]!;
    // Should have expanded longhands, not shorthand
    expect(readonlyBlock).not.toMatch(/\bpadding\b(?!Block|Inline)/);
    expect(readonlyBlock).toContain("paddingBlock");
    expect(readonlyBlock).toContain("paddingInline");
  });
});

describe("shorthand/longhand normalization edge cases", () => {
  it("should let later box shorthands reset earlier side longhands", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding-top: 8px;
  padding: 4px;
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("paddingTop: 4");
    expect(result.code).toContain("paddingRight: 4");
    expect(result.code).toContain("paddingBottom: 4");
    expect(result.code).toContain("paddingLeft: 4");
  });

  it("should expand variant borderRadius when the base expands to corner longhands", () => {
    // StyleX gives corner longhands (priority 4000) precedence over the
    // borderRadius shorthand (priority 2000) regardless of application order.
    // When the base styles expand a multi-value border-radius into corner
    // longhands, a variant's single-value borderRadius must be expanded too,
    // or the variant could never override the base.
    const source = `
import styled from "styled-components";

const Box = styled.div<{ rounded?: boolean }>\`
  border-radius: \${(props) => (props.rounded ? "4px" : "16px 0")};
  color: red;
\`;

export const App = () => (
  <>
    <Box rounded>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxRounded = result.code.match(/boxRounded:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxRounded).toBeTruthy();
    expect(boxRounded).not.toMatch(/borderRadius:/);
    expect(boxRounded).toMatch(/borderTopLeftRadius: (?:"4px"|4)/);
    expect(boxRounded).toMatch(/borderTopRightRadius: (?:"4px"|4)/);
    expect(boxRounded).toMatch(/borderBottomRightRadius: (?:"4px"|4)/);
    expect(boxRounded).toMatch(/borderBottomLeftRadius: (?:"4px"|4)/);
  });

  it("should let later conditional css shorthands reset earlier base longhands", () => {
    // The conditional block appears after `padding-top: 10px` in source, so an
    // active element's `padding: 8px` resets the top to 8px. The variant
    // expansion must include paddingTop here — the base late-side suppression
    // only applies to variants whose shorthand precedes the base longhand.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  padding: 4px;
  padding-top: 10px;
  \${(p) => p.$active && css\`padding: 8px;\`}
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/paddingTop: 8/);
    expect(boxActive).toMatch(/paddingRight: 8/);
    expect(boxActive).toMatch(/paddingBottom: 8/);
    expect(boxActive).toMatch(/paddingLeft: 8/);
  });

  it("should keep redeclared base longhands winning over earlier conditional css shorthands", () => {
    // padding-top exists before the conditional block but is redeclared after
    // it — the later 10px declaration wins for active elements too, so the
    // variant expansion must not emit paddingTop.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  padding-top: 5px;
  \${(p) => p.$active && css\`padding: 8px;\`}
  padding-top: 10px;
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    expect(result.code).toMatch(/paddingTop: 10/);
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).not.toMatch(/paddingTop/);
    expect(boxActive).toMatch(/paddingRight: 8/);
    expect(boxActive).toMatch(/paddingBottom: 8/);
    expect(boxActive).toMatch(/paddingLeft: 8/);
  });

  it("should keep later base corner overrides winning over conditional border-radius", () => {
    // border-top-left-radius: 10px appears after the conditional block, so it
    // wins for active elements too — the variant's borderRadius expansion must
    // not emit borderTopLeftRadius.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  border-radius: 4px;
  \${(p) => p.$active && css\`border-radius: 8px;\`}
  border-top-left-radius: 10px;
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    expect(result.code).toMatch(/borderTopLeftRadius: 10/);
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).not.toMatch(/borderTopLeftRadius/);
    expect(boxActive).toMatch(/borderTopRightRadius: 8/);
    expect(boxActive).toMatch(/borderBottomRightRadius: 8/);
    expect(boxActive).toMatch(/borderBottomLeftRadius: 8/);
  });

  it("should merge only later base pseudo longhands into variant shorthand expansion", () => {
    // The :active entry appears before the variant block, so the variant's
    // shorthand resets it. The :hover entry is added after the variant block,
    // so the variant's expanded paddingTop must preserve it.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  &:active {
    padding-top: 5px;
  }
  \${(p) => p.$active && css\`padding: 8px;\`}
  &:hover {
    padding-top: 10px;
  }
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/paddingTop: \{/);
    expect(boxActive).toMatch(/default: 8/);
    expect(boxActive).not.toMatch(/":active": 5/);
    expect(boxActive).toMatch(/":hover": 10/);
    expect(boxActive).toMatch(/paddingRight: 8/);
    expect(boxActive).toMatch(/paddingBottom: 8/);
    expect(boxActive).toMatch(/paddingLeft: 8/);
  });

  it("should not merge earlier base pseudo longhands into variant shorthand expansion", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  &:hover {
    padding-top: 10px;
  }
  \${(p) => p.$active && css\`padding: 8px;\`}
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/paddingTop: 8/);
    expect(boxActive).not.toMatch(/":hover": 10/);
    expect(boxActive).toMatch(/paddingRight: 8/);
  });

  it("should merge media-only base longhands into variant shorthand expansion", () => {
    // The media padding-top is redeclared into the same condition map after
    // the variant block. The variant's expanded paddingTop must keep the media
    // entry — a flat paddingTop would drop it in stylex.props() since both
    // styles target the same property.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  @media (max-width: 600px) {
    padding-top: 5px;
  }
  \${(p) => p.$active && css\`padding: 8px;\`}
  @media (max-width: 600px) {
    padding-top: 10px;
  }
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/paddingTop: \{/);
    expect(boxActive).toMatch(/default: 8/);
    expect(boxActive).toMatch(/"@media \(max-width: 600px\)": 10/);
    expect(boxActive).toMatch(/paddingRight: 8/);
  });

  it("should merge overlapping later conditional base sides into variant shorthand expansion", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  \${(p) => p.$active && css\`padding: 8px;\`}
  &:hover {
    padding-top: 10px;
  }
  @media (max-width: 600px) {
    padding-block: 12px;
  }
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/paddingTop: \{/);
    expect(boxActive).toMatch(/default: 8/);
    expect(boxActive).toMatch(/":hover": 10/);
    expect(boxActive).toMatch(/"@media \(max-width: 600px\)": 12/);
    expect(boxActive).toMatch(/paddingBottom: \{/);
    expect(boxActive).toMatch(/paddingRight: 8/);
  });

  it("should merge media-only base corners into variant border-radius expansion", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  border-radius: 4px;
  \${(p) => p.$active && css\`border-radius: 8px;\`}
  @media (max-width: 600px) {
    border-top-left-radius: 10px;
  }
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/borderTopLeftRadius: \{/);
    expect(boxActive).toMatch(/default: 8/);
    expect(boxActive).toMatch(/"@media \(max-width: 600px\)": 10/);
    expect(boxActive).toMatch(/borderTopRightRadius: 8/);
  });

  it("should not merge earlier media-only base corners into variant border-radius expansion", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  border-radius: 4px;
  @media (max-width: 600px) {
    border-top-left-radius: 10px;
  }
  \${(p) => p.$active && css\`border-radius: 8px;\`}
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).toMatch(/borderTopLeftRadius: 8/);
    expect(boxActive).not.toMatch(/"@media \(max-width: 600px\)": 10/);
    expect(boxActive).toMatch(/borderTopRightRadius: 8/);
  });

  it("should keep later base longhands winning over earlier conditional css shorthands", () => {
    // Here `padding-top: 10px` appears after the conditional block, so it wins
    // for the top side even when $active — the variant must not emit paddingTop.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  padding: 4px;
  \${(p) => p.$active && css\`padding: 8px;\`}
  padding-top: 10px;
\`;

export const App = () => (
  <>
    <Box $active>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxActive = result.code.match(/boxActive:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxActive).toBeTruthy();
    expect(boxActive).not.toMatch(/paddingTop/);
    expect(boxActive).toMatch(/paddingRight: 8/);
    expect(boxActive).toMatch(/paddingBottom: 8/);
    expect(boxActive).toMatch(/paddingLeft: 8/);
  });

  it("should expand variant padding shorthands when the base carries side longhands", () => {
    // StyleX side longhands (4000) always beat the padding shorthand (1000),
    // so a variant keeping `padding` could never override base side longhands.
    // The variant expands to sides — except sides whose base longhand was
    // declared after the shorthand (padding-top here), which must keep winning.
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: \${(props) => (props.big ? "8px" : "4px")};
  padding-top: 2px;
\`;

export const App = () => (
  <>
    <Box big>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxBig = result.code.match(/boxBig:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxBig).toBeTruthy();
    expect(boxBig).not.toMatch(/\bpadding:/);
    expect(boxBig).toMatch(/paddingRight: 8/);
    expect(boxBig).toMatch(/paddingBottom: 8/);
    expect(boxBig).toMatch(/paddingLeft: 8/);
    // padding-top: 2px is declared after the shorthand, so it wins for both
    // variants and the big variant must not re-introduce a paddingTop.
    expect(boxBig).not.toMatch(/paddingTop/);
    expect(result.code).toMatch(/paddingTop: 2/);
  });

  it("should expand variant padding to all sides when a longhand precedes the shorthand", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding-top: 2px;
  padding: \${(props) => (props.big ? "8px" : "4px")};
\`;

export const App = () => (
  <>
    <Box big>a</Box>
    <Box>b</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const boxBig = result.code.match(/boxBig:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(boxBig).toBeTruthy();
    expect(boxBig).toMatch(/paddingTop: 8/);
    expect(boxBig).toMatch(/paddingRight: 8/);
    expect(boxBig).toMatch(/paddingBottom: 8/);
    expect(boxBig).toMatch(/paddingLeft: 8/);
  });

  it("should expand multi-value border-radius inside media query maps", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  border-radius: 8px;
  @media (max-width: 600px) {
    border-radius: 4px 0;
  }
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    // The media override expands to corner longhands; the base single value
    // must expand too so it stays overridable (corner longhands always beat
    // the borderRadius shorthand in StyleX, regardless of application order),
    // and the base value must fill each corner map's default slot.
    expect(result.code).not.toMatch(/borderRadius:/);
    expect(result.code).toMatch(/borderTopLeftRadius: \{/);
    expect(result.code).toMatch(/borderTopRightRadius: \{/);
    expect(result.code).toMatch(/default: (?:"8px"|8)/);
    expect(result.code).not.toMatch(/default: null/);
    expect(result.code).toMatch(/"@media \(max-width: 600px\)": (?:"4px"|4)/);
    expect(result.code).toMatch(/"@media \(max-width: 600px\)": (?:"0"|0)/);
  });

  it("should preserve border radius shorthand and corner source order", () => {
    const source = `
import styled from "styled-components";

const LaterCorner = styled.div\`
  border-radius: 8px 4px;
  border-top-left-radius: 2px;
\`;

const LaterShorthand = styled.div\`
  border-top-left-radius: 2px;
  border-radius: 8px 4px;
\`;

export const App = () => (
  <>
    <LaterCorner>corner</LaterCorner>
    <LaterShorthand>shorthand</LaterShorthand>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const laterCorner = result.code.match(/laterCorner:\s*\{([\s\S]*?)\n  \}/)?.[1];
    const laterShorthand = result.code.match(/laterShorthand:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(laterCorner).toBeTruthy();
    expect(laterShorthand).toBeTruthy();
    expect(laterCorner).toMatch(/borderTopLeftRadius: 2/);
    expect(laterCorner).toMatch(/borderTopRightRadius: (?:"4px"|4)/);
    expect(laterCorner).toMatch(/borderBottomRightRadius: (?:"8px"|8)/);
    expect(laterCorner).toMatch(/borderBottomLeftRadius: (?:"4px"|4)/);
    expect(laterShorthand).toMatch(/borderTopLeftRadius: (?:"8px"|8)/);
  });

  it("should preserve shorthand defaults for conditional side overrides", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 4px;
  &:hover {
    padding-top: 8px;
  }
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const box = result.code.match(/box:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(box).toBeTruthy();
    expect(box).toMatch(/paddingTop: \{/);
    expect(box).toMatch(/default: 4/);
    expect(box).toMatch(/":hover": 8/);
  });

  it("should merge conditional shorthand and longhand side maps", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 4px;
  &:hover {
    padding: 8px;
  }
  &:active {
    padding-top: 2px;
  }
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const box = result.code.match(/box:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(box).toBeTruthy();
    expect(box).toMatch(/paddingTop: \{/);
    expect(box).toMatch(/default: 4/);
    expect(box).toMatch(/":hover": 8/);
    expect(box).toMatch(/":active": 2/);
    expect(box).not.toMatch(/default: \{/);
  });

  it("should keep late side overrides local to their own variant bucket", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ active?: boolean; disabled?: boolean }>\`
  padding: 4px;
  \${(p) =>
    p.active &&
    css\`
      padding: 8px;
      padding-top: 10px;
    \`}
  \${(p) =>
    p.disabled &&
    css\`
      padding: 12px;
    \`}
\`;

export const App = () => (
  <>
    <Box>base</Box>
    <Box active>active</Box>
    <Box disabled>disabled</Box>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const disabled = result.code.match(/boxDisabled:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(disabled).toBeTruthy();
    expect(disabled).toMatch(/paddingTop: 12/);
    expect(disabled).toMatch(/paddingRight: 12/);
    expect(disabled).toMatch(/paddingBottom: 12/);
    expect(disabled).toMatch(/paddingLeft: 12/);
  });

  it("should preserve radius defaults for conditional corner overrides", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  border-radius: 8px 4px;
  &:hover {
    border-top-left-radius: 2px;
  }
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    const box = result.code.match(/box:\s*\{([\s\S]*?)\n  \}/)?.[1];
    expect(box).toBeTruthy();
    expect(box).toMatch(/borderTopLeftRadius: \{/);
    expect(box).toMatch(/default: (?:"8px"|8)/);
    expect(box).toMatch(/":hover": (?:"2px"|2)/);
  });

  it("should preserve prior conditional radius entries when a later corner map is merged", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  border-radius: 8px;
  &:hover {
    border-radius: 4px;
  }
  &:active {
    border-top-left-radius: 2px;
  }
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    if (!result.code) {
      throw new Error("Expected transform output");
    }
    expect(result.code).toMatch(/borderTopLeftRadius: \{/);
    expect(result.code).toMatch(/default: (?:"8px"|8)/);
    expect(result.code).toMatch(/":hover": (?:"4px"|4)/);
    expect(result.code).toMatch(/":active": (?:"2px"|2)/);
  });

  it("should expand 2-value physical conflict to 4 physical longhands, not logical", () => {
    // Regression: splitDirectionalProperty returns logical Block/Inline for 2-value shorthands
    // even when alwaysExpand is true, but when there's a physical conflict (e.g., marginBottom),
    // we need physical longhands (marginTop/Right/Bottom/Left).
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $wide?: boolean }>\`
  margin-bottom: 8px;
  \${(p) => p.$wide ? "" : "margin: 8px 16px;"}
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: { ...fixtureAdapter, usePhysicalProperties: false } },
    );
    expect(result.code).not.toBeNull();
    // The base has marginBottom (physical). The conditional has margin: 8px 16px (2-value).
    // The expansion should produce 4 physical longhands, not logical Block/Inline.
    expect(result.code).toContain("marginTop");
    expect(result.code).toContain("marginRight");
    expect(result.code).toContain("marginBottom");
    expect(result.code).toContain("marginLeft");
    // Should NOT contain logical longhands (which is what splitDirectionalProperty
    // returns for 2-value shorthands)
    expect(result.code).not.toContain("marginBlock");
    expect(result.code).not.toContain("marginInline");
  });

  it("should split multi-value shorthands before directional assignment", () => {
    // Regression: shorthand expansion must split values before assigning each
    // direction, instead of copying the entire "8px 12px" value to every output.
    const source = `
import styled from "styled-components";

const Input = styled.input\`
  padding-block: 4px;
  \${(p) => p.readOnly ? "" : "padding: 8px 12px;"}
\`;

export const App = () => <Input />;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // The base has padding-block. The conditional has padding: 8px 12px.
    expect(result.code).toContain("paddingBlock: 8");
    expect(result.code).toContain("paddingInline: 12");
    // Should NOT have the unsplit value
    expect(result.code).not.toContain('"8px 12px"');
  });

  it("should expand 3-value shorthand to physical longhands even with logical conflict", () => {
    // Logical properties can only express block/inline (2 values).
    // A 3-value shorthand (top/LR/bottom) must fall back to physical longhands.
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $compact?: boolean }>\`
  padding-block: 4px;
  \${(p) => p.$compact && "padding: 4px 8px 12px;"}
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // 3-value shorthand cannot use logical expansion, must use physical
    expect(result.code).toContain("paddingTop");
    expect(result.code).toContain("paddingRight");
    expect(result.code).toContain("paddingBottom");
    expect(result.code).toContain("paddingLeft");
    // The 3-value pattern: top=4px, left/right=8px, bottom=12px
    // Values may be emitted as numbers when unit-less or parseable
    expect(result.code).toMatch(/paddingTop:\s*(4|"4px")/);
    expect(result.code).toMatch(/paddingRight:\s*(8|"8px")/);
    expect(result.code).toMatch(/paddingBottom:\s*(12|"12px")/);
    expect(result.code).toMatch(/paddingLeft:\s*(8|"8px")/);
  });

  it("should handle 4-value shorthand expansion correctly", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $custom?: boolean }>\`
  padding-block: 2px;
  \${(p) => p.$custom && "padding: 1px 2px 3px 4px;"}
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // 4-value shorthand maps to: top=1px, right=2px, bottom=3px, left=4px
    expect(result.code).toContain("paddingTop");
    expect(result.code).toContain("paddingRight");
    expect(result.code).toContain("paddingBottom");
    expect(result.code).toContain("paddingLeft");
  });

  it("should tokenize calc() values correctly without splitting on spaces", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $fluid?: boolean }>\`
  padding-bottom: 4px;
  \${(p) => p.$fluid && "padding: calc(100% - 20px) 8px;"}
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // Should treat "calc(100% - 20px)" as a single value, not split on spaces
    expect(result.code).toContain("calc(100% - 20px)");
    // Should expand to 4 physical longhands (physical conflict from paddingBottom)
    expect(result.code).toContain("paddingTop");
    expect(result.code).toContain("paddingBottom");
  });
});

describe("sx propagation from forwarded className", () => {
  it("uses rest sx without removing it from destructured wrapper rest props", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  children?: React.ReactNode;
};

function Wrapper({ className, ...rest }: WrapperProps) {
  return <Box {...rest} className={className} />;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("function Wrapper({ className, ...rest }: WrapperProps)");
    expect(output).toContain("<Box sx={rest.sx} {...rest} className={className} />");
    expect(output).not.toContain("...rest, sx");
  });

  it("preserves sx in rest props forwarded to unrelated components", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  children?: React.ReactNode;
};

function Other(props: WrapperProps) {
  return <div {...props} />;
}

function Wrapper({ className, ...rest }: WrapperProps) {
  return (
    <>
      <Box className={className}>converted</Box>
      <Other {...rest} />
    </>
  );
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("function Wrapper({ className, ...rest }: WrapperProps)");
    expect(output).toContain("<Box className={className} sx={rest.sx}>converted</Box>");
    expect(output).toContain("<Other {...rest} />");
    expect(output).not.toMatch(/function Wrapper\(\{\s*className,\s*sx,\s*\.\.\.rest/);
  });

  it("does not infer sx pass-through from shadowed className bindings", () => {
    const source = `
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  items: { className?: string; label: string }[];
};

function Wrapper({ className, items }: WrapperProps) {
  return (
    <>
      {items.map(({ className, label }) => (
        <Box key={label} className={className}>{label}</Box>
      ))}
      <Box className={className}>outer</Box>
    </>
  );
}

const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper items={[{ label: "inner", className: "item" }]} />;
`;
    const output = runTransform(source);

    expect(output).toContain("<Box className={className} sx={sx}>outer</Box>");
    expect(output).toContain("<Box key={label} className={className}>");
    expect(output.match(/sx=\{sx\}/g)).toHaveLength(1);
  });

  it("does not infer sx pass-through to shadowed component bindings", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

type WrapperProps = {
  className?: string;
};

function Wrapper({ className }: WrapperProps) {
  const Box = (props: { className?: string; children?: React.ReactNode }) => (
    <span className={props.className}>{props.children}</span>
  );
  return <Box className={className}>local</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper />;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n};");
    expect(output).toContain("<Box className={className}>local</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>local</Box>");
  });

  it("does not infer sx pass-through to shadowed class component bindings", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

type WrapperProps = {
  className?: string;
};

function Wrapper({ className }: WrapperProps) {
  class Box extends React.Component<{ className?: string; children?: React.ReactNode }> {
    render() {
      return <span className={this.props.className}>{this.props.children}</span>;
    }
  }
  return <Box className={className}>local</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper />;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n};");
    expect(output).toContain("<Box className={className}>local</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>local</Box>");
  });

  it("does not mutate an outer props alias shadowed by a type parameter", () => {
    const source = `
import styled from "styled-components";

type WrapperProps = {
  className?: string;
};

function Wrapper<WrapperProps extends { className?: string }>({ className }: WrapperProps) {
  return <Box className={className}>generic</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper />;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n};");
    expect(output).toContain("<Box className={className}>generic</Box>");
    expect(output).toContain(
      "function Wrapper<WrapperProps extends { className?: string }>({ className }: WrapperProps)",
    );
    expect(output).not.toContain("<Box className={className} sx={sx}>generic</Box>");
  });

  it("inserts sx before JSX spreads so spread-provided sx can still win", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  childProps?: React.ComponentProps<typeof Box>;
};

function Wrapper({ className, childProps }: WrapperProps) {
  return <Box {...childProps} className={className}>spread</Box>;
}

const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper />;
`;
    const output = runTransform(source);

    expect(output).toContain("sx?: stylex.StyleXStyles;");
    expect(output).toContain("<Box sx={sx} {...childProps} className={className}>spread</Box>");
  });

  it("propagates sx through component props aliases that already include sx", () => {
    const source = `
import styled from "styled-components";
import * as React from "react";

type WrapperProps = React.ComponentProps<typeof Box>;

function Wrapper({ className }: WrapperProps) {
  return <Box className={className}>alias</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = React.ComponentProps<typeof Box>;");
    expect(output).toMatch(/function Wrapper\(\{\s*className,\s*sx,?\s*\}: WrapperProps\)/);
    expect(output).toContain("<Box className={className} sx={sx}>alias</Box>");
  });

  it("does not propagate destructured wrapper sx when it is not StyleX typed", () => {
    const source = `
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  sx?: number;
};

function Wrapper({ className, sx }: WrapperProps) {
  return <Box className={className}>{sx}</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper sx={1}>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n  sx?: number;\n};");
    expect(output).toContain("function Wrapper({ className, sx }: WrapperProps)");
    expect(output).toContain("<Box className={className}>{sx}</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>");
  });

  it("propagates destructured wrapper sx when bare StyleXStyles is imported from StyleX", () => {
    const source = `
import styled from "styled-components";
import type { StyleXStyles } from "@stylexjs/stylex";

type WrapperProps = {
  className?: string;
  sx?: StyleXStyles;
};

function Wrapper({ className, sx }: WrapperProps) {
  return <Box className={className}>wrapped</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain('import type { StyleXStyles } from "@stylexjs/stylex";');
    expect(output).toContain("<Box className={className} sx={sx}>wrapped</Box>");
  });

  it("does not propagate destructured wrapper sx when bare StyleXStyles is locally aliased", () => {
    const source = `
import styled from "styled-components";

type StyleXStyles = number;

type WrapperProps = {
  className?: string;
  sx?: StyleXStyles;
};

function Wrapper({ className, sx }: WrapperProps) {
  return <Box className={className}>{sx}</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper sx={1}>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("type StyleXStyles = number;");
    expect(output).toContain("<Box className={className}>{sx}</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>");
  });

  it("does not propagate object wrapper sx when it is not StyleX typed", () => {
    const source = `
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  sx?: number;
};

function Wrapper(props: WrapperProps) {
  return <Box className={props.className}>{props.sx}</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper sx={1}>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n  sx?: number;\n};");
    expect(output).toContain("function Wrapper(props: WrapperProps)");
    expect(output).toContain("<Box className={props.className}>{props.sx}</Box>");
    expect(output).not.toContain("<Box className={props.className} sx={props.sx}>");
  });

  it("passes static member component paths to sx-aware wrapped component detection", () => {
    const source = `
import styled from "styled-components";
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

import { Select } from "./select";

const StyledOption = styled(Select.Option)\`
  color: red;
\`;

export const App = () => <StyledOption value="home">Home</StyledOption>;
`;
    const output = runTransform(source, {
      adapter: {
        ...fixtureAdapter,
        wrappedComponentInterface(ctx) {
          if (ctx.localName === "Select.Option" && ctx.memberPath?.join(".") === "Option") {
            return { acceptsSx: true };
          }
          return fixtureAdapter.wrappedComponentInterface?.(ctx);
        },
      },
    });

    expect(output).toContain('<Select.Option value="home" sx={styles.option}>');
    expect(output).not.toContain("stylex.props(styles.option)");
  });

  it("does not treat component props aliases with non-StyleX sx overrides as sx-aware", () => {
    const source = `
import styled from "styled-components";
import * as React from "react";

type WrapperProps = React.ComponentProps<typeof Box> & {
  sx?: number;
};

function Wrapper({ className, sx }: WrapperProps) {
  return <Box className={className}>{sx}</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper sx={1}>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain(
      "type WrapperProps = React.ComponentProps<typeof Box> & {\n  sx?: number;\n};",
    );
    expect(output).toContain("function Wrapper({ className, sx }: WrapperProps)");
    expect(output).toContain("<Box className={className}>{sx}</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>");
  });

  it("does not treat local ComponentProps-prefixed helpers as sx-aware React utilities", () => {
    const source = `
import styled from "styled-components";
import * as React from "react";

type ComponentPropsSubset<T extends React.ElementType> = Pick<React.ComponentProps<T>, "className">;
type WrapperProps = ComponentPropsSubset<typeof Box>;

function Wrapper({ className }: WrapperProps) {
  return <Box className={className}>alias</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper>wrapped</Wrapper>;
`;
    const output = runTransform(source);

    expect(output).toContain(
      'type ComponentPropsSubset<T extends React.ElementType> = Pick<React.ComponentProps<T>, "className">;',
    );
    expect(output).toContain("type WrapperProps = ComponentPropsSubset<typeof Box>;");
    expect(output).toContain("function Wrapper({ className }: WrapperProps)");
    expect(output).toContain("<Box className={className}>alias</Box>");
    expect(output).not.toMatch(/type WrapperProps = ComponentPropsSubset<typeof Box> & \{/);
    expect(output).not.toMatch(/function Wrapper\(\{\s*className,\s*sx/);
    expect(output).not.toContain("<Box className={className} sx={sx}>alias</Box>");
  });

  it("does not shadow captured sx identifiers when adding sx destructuring", () => {
    const source = `
import styled from "styled-components";

const sx = "captured";

type WrapperProps = {
  className?: string;
};

function Wrapper({ className }: WrapperProps) {
  return <Box className={className}>{sx}</Box>;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Wrapper />;
`;
    const output = runTransform(source);

    expect(output).toContain('const sx = "captured";');
    expect(output).toMatch(/function Wrapper\(\{\s*className,\s*sx: sxProp,?\s*\}: WrapperProps\)/);
    expect(output).toContain("<Box className={className} sx={sxProp}>{sx}</Box>");
    expect(output).not.toContain("<Box className={className} sx={sx}>{sx}</Box>");
  });

  it("adds sx to the wrapper props type from the matching lexical scope", () => {
    const source = `
import styled from "styled-components";

type WrapperProps = {
  className?: string;
  label?: string;
};

function Parent() {
  type WrapperProps = {
    className?: string;
    count: number;
  };

  function Wrapper({ className, count }: WrapperProps) {
    return <Box className={className}>{count}</Box>;
  }

  return <Wrapper count={1} />;
}

export const Box = styled.div\`
  color: red;
\`;

export const App = () => <Parent />;
`;
    const output = runTransform(source);

    expect(output).toContain("type WrapperProps = {\n  className?: string;\n  label?: string;\n};");
    expect(output).toContain(
      "type WrapperProps = {\n    className?: string;\n    sx?: stylex.StyleXStyles;\n    count: number;\n  };",
    );
    expect(output).toMatch(/function Wrapper\(\{\s*className,\s*count,\s*sx,\s*\}: WrapperProps\)/);
    expect(output).toContain("<Box className={className} sx={sx}>{count}</Box>");
  });
});

describe("component value usage", () => {
  it("keeps elementType props on the narrow style-only wrapper contract", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

const InnerContainer = styled.div\`
  position: relative;
  background-color: red;
\`;

function List(props: {
  innerElementType: React.ComponentType<React.PropsWithChildren<{ style?: React.CSSProperties }>>;
  children: () => React.ReactNode;
}) {
  const Inner = props.innerElementType;
  return <Inner style={{ height: 20 }}>{props.children()}</Inner>;
}

export const App = () => (
  <List innerElementType={InnerContainer}>
    {() => <div>Row</div>}
  </List>
);
`;
    const output = runTransform(source);

    expect(output).toContain("props: React.PropsWithChildren<{");
    expect(output).toContain("style?: React.CSSProperties");
    expect(output).toContain("ref?: React.Ref<HTMLDivElement>");
    expect(output).not.toContain("sx?: stylex.StyleXStyles");
    expect(output).not.toContain("className, children, style, sx");
  });

  it("uses virtual-list value wrappers for elementType props by name", () => {
    const source = `
import * as React from "react";
import styled from "styled-components";

function LocalList(props: { innerElementType?: React.ElementType; children: React.ReactNode }) {
  const Inner = props.innerElementType ?? "div";
  return <Inner>{props.children}</Inner>;
}

const InnerContainer = styled.div\`
  position: relative;
  background-color: red;
\`;

export const App = () => (
  <LocalList innerElementType={InnerContainer}>
    Row
  </LocalList>
);
`;
    const output = runTransform(source);

    expect(output).toContain("style?: React.CSSProperties");
    expect(output).toContain("ref?: React.Ref<HTMLDivElement>");
    expect(output).not.toContain("className");
    expect(output).not.toContain("sx?: stylex.StyleXStyles");
    expect(output).toContain("{...mergedSx(styles.innerContainer, undefined, style)}");
  });
});

describe("usePhysicalProperties adapter option", () => {
  it("should require usePhysicalProperties to be explicit", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 4px 8px;
\`;

export const App = () => <Box>test</Box>;
`;
    const adapter: Record<string, unknown> = { ...fixtureAdapter };
    delete adapter.usePhysicalProperties;
    expect(() =>
      transformWithWarnings(
        { source, path: "test.tsx" },
        { jscodeshift: j, j, stats: () => {}, report: () => {} },
        { adapter: adapter as unknown as Adapter },
      ),
    ).toThrow(/usePhysicalProperties must be explicitly set/);
  });

  it("should expand 2-value padding to physical properties when usePhysicalProperties is true", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 4px 8px;
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: { ...fixtureAdapter, usePhysicalProperties: true } },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("paddingTop");
    expect(result.code).toContain("paddingRight");
    expect(result.code).toContain("paddingBottom");
    expect(result.code).toContain("paddingLeft");
    expect(result.code).not.toContain("paddingBlock");
    expect(result.code).not.toContain("paddingInline");
  });

  it("should preserve same-branch physical defaults when expanding logical pseudo maps", () => {
    const source = `
import styled, { css } from "styled-components";

const Box = styled.span<{ $active?: boolean }>\`
  padding: 4px 8px;

  \${(props) =>
    props.$active &&
    css\`
      &:hover {
        padding-inline: 2px;
      }

      padding-right: 3px;
    \`}
\`;

export const App = () => <Box $active>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: { ...fixtureAdapter, usePhysicalProperties: true } },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("paddingRight: {");
    expect(result.code).toContain("default: 3");
    expect(result.code).toContain('":hover": 2');
  });

  it("should expand later logical axis overrides to physical sides when mixed with physical styles", () => {
    // The axis shorthand (paddingInline, priority 2000) can never beat a side
    // longhand (paddingRight, priority 4000) in StyleX, so the $b variant gets
    // expanded to physical sides. Each variant keeps only its own values: with
    // $a and $b, the default comes from $a's paddingRight and the hover value
    // from $b's expanded sides; with $b alone there is no phantom default.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.span<{ $a?: boolean; $b?: boolean }>\`
  \${(props) =>
    props.$a &&
    css\`
      padding-right: 8px;
    \`}

  \${(props) =>
    props.$b &&
    css\`
      &:hover {
        padding-inline: 2px;
      }
    \`}
\`;

export const App = () => <Box $a $b>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: { ...fixtureAdapter, usePhysicalProperties: true } },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("paddingRight: 8");
    expect(result.code).toContain("paddingRight: {");
    expect(result.code).toContain("paddingLeft: {");
    expect(result.code).not.toContain("paddingInline");
    expect(result.code).toContain('":hover": 2');
  });

  it("should expand 2-value padding to logical properties when usePhysicalProperties is false", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  padding: 4px 8px;
\`;

export const App = () => <Box>test</Box>;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: { ...fixtureAdapter, usePhysicalProperties: false } },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("paddingBlock");
    expect(result.code).toContain("paddingInline");
    expect(result.code).not.toContain("paddingTop");
    expect(result.code).not.toContain("paddingRight");
  });
});

describe("forwardedAs prop handling", () => {
  it("should preserve forwardedAs on wrapper callsites for styled(styled.tag) chains", () => {
    // In styled-components wrapper chains, `forwardedAs` does not behave like a direct `as`
    // replacement. Preserve `forwardedAs` at the wrapper callsite so the rendered output
    // stays aligned with the source behavior.
    const source = `
import styled from "styled-components";

const Button = styled.button\`
  color: white;
  background: blue;
\`;

const ButtonWrapper = styled(Button)\`
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
\`;

export const App = () => (
  <div>
    <Button forwardedAs="a" href="#">Direct forwardedAs</Button>
    <ButtonWrapper forwardedAs="a" href="#">Link</ButtonWrapper>
    <ButtonWrapper as="section" forwardedAs="a" href="#">Both</ButtonWrapper>
  </div>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    // Keep forwardedAs at the wrapper callsite (no blanket conversion to `as`).
    expect(result.code).toContain('forwardedAs="a"');
    expect(result.code).not.toContain('<ButtonWrapper as="a"');
    // forwardedAs should lower to `as={forwardedAs}` at the rendered intrinsic layer.
    expect(result.code).toContain("as={forwardedAs}");
    // Direct forwardedAs should remain a callsite prop (not become element polymorphism).
    expect(result.code).toContain('<Button forwardedAs="a" href="#">');
    // `as` and `forwardedAs` can co-exist on wrapper callsites.
    expect(result.code).toContain('<ButtonWrapper as="section" forwardedAs="a" href="#">');
  });

  it("should lower forwardedAs for styled(Component) and keep attrs(as) as a fallback", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

const Base = ({ as: Component = "button", ...rest }: BaseProps) => {
  return <Component {...rest} />;
};

const Wrapper = styled(Base).attrs({ as: "span" })\`
  color: red;
\`;

export const App = () => (
  <>
    <Wrapper forwardedAs="a" href="#">
      Link
    </Wrapper>
    <Wrapper href="#">Fallback Link</Wrapper>
    <Wrapper as="section" href="#">Attrs Wins</Wrapper>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('forwardedAs?: BaseProps["as"]');
    expect(result.code).toContain('as={forwardedAs ?? "span"}');
    expect(result.code).not.toContain('as="span"');
  });

  it("should lower static attrs(forwardedAs) for styled(Component) as an as fallback", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

const Base = ({ as: Component = "button", ...rest }: BaseProps) => {
  return <Component {...rest} />;
};

const Wrapper = styled(Base).attrs({ forwardedAs: "span" })\`
  color: red;
\`;

export const App = () => (
  <>
    <Wrapper forwardedAs="a" href="#">
      Link
    </Wrapper>
    <Wrapper href="#">Fallback Link</Wrapper>
  </>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('forwardedAs?: BaseProps["as"]');
    expect(result.code).toContain('as={forwardedAs ?? "span"}');
    expect(result.code).not.toContain('forwardedAs="span"');
  });

  it("should lower static attrs(forwardedAs) for styled(Component) without callsite forwardedAs", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

const Base = ({ as: Component = "button", ...rest }: BaseProps) => {
  return <Component {...rest} />;
};

const Wrapper = styled(Base).attrs({ forwardedAs: "span" })\`
  color: red;
\`;

export const App = () => (
  <Wrapper href="#">Fallback Link</Wrapper>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('as="span"');
    expect(result.code).not.toContain('forwardedAs="span"');
  });

  it("should lower forwardedAs through styled(Component) when wrapped base is polymorphic", () => {
    const source = `
import styled from "styled-components";

const Base = styled.button\`
  color: red;
\`;

const Outer = styled(Base)\`
  background: blue;
\`;

export const App = () => (
  <div>
    <Base as="section">Base polymorphic</Base>
    <Outer forwardedAs="a" href="#">
      Outer forwardedAs
    </Outer>
  </div>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('<Outer forwardedAs="a" href="#">');
    expect(result.code).toContain("forwardedAs?: React.ElementType");
    expect(result.code).toContain("as={forwardedAs}");
  });

  it("should not infer rendered as support from erased generic type arguments", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

type LinkOnlyProps = Omit<BaseProps, "as">;

const Base = ({ as: Component = "button", ...rest }: BaseProps) => {
  return <Component {...rest} />;
};

const LinkOnly = (props: LinkOnlyProps) => {
  return <Base {...props} />;
};

const Wrapper = styled(LinkOnly)\`
  color: red;
\`;

export const App = () => (
  <Wrapper forwardedAs="a" href="#">
    Link
  </Wrapper>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("forwardedAs?: React.ElementType");
    expect(result.code).toContain("as={forwardedAs}");
    expect(result.code).not.toContain('LinkOnlyProps["as"]');
    expect(result.code).not.toContain("rest.as");
  });

  it("should preserve generic props arguments when typing forwardedAs", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps<C extends React.ElementType> = {
  as?: C;
  href?: string;
  children?: React.ReactNode;
};

const Base = (props: BaseProps<"button">) => {
  const { as: Component = "button", ...rest } = props;
  return <Component {...rest} />;
};

const Wrapper = styled(Base)\`
  color: red;
\`;

export const App = () => (
  <Wrapper forwardedAs="button">
    Button
  </Wrapper>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('forwardedAs?: BaseProps<"button">["as"]');
    expect(result.code).not.toContain('forwardedAs?: BaseProps["as"]');
  });

  it("should preserve intersected base props when typing forwardedAs from one member", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type AsProps = {
  as?: React.ElementType;
  children?: React.ReactNode;
};

type LabelProps = {
  label: string;
};

const Base = (props: AsProps & LabelProps) => {
  const { as: Component = "button", label, ...rest } = props;
  return <Component {...rest}>{label}</Component>;
};

const Wrapper = styled(Base)\`
  color: red;
\`;

export const App = () => (
  <Wrapper forwardedAs="a" label="Link label">
    Link
  </Wrapper>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain(
      'type WrapperProps = AsProps & LabelProps & { forwardedAs?: AsProps["as"] }',
    );
    expect(result.code).not.toContain(
      'type WrapperProps = AsProps & { forwardedAs?: AsProps["as"] }',
    );
  });

  it("should preserve component wrapper polymorphism from props type", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type BaseProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

type WrapperProps = BaseProps & {
  tone?: "info" | "warning";
};

const Base = ({ as: Component = "button", ...rest }: BaseProps) => {
  return <Component {...rest} />;
};

const Wrapper = styled(Base)<WrapperProps>\`
  color: red;
\`;

export const App = (props: WrapperProps) => (
  <Wrapper {...props}>Polymorphic spread</Wrapper>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("as: Component = Base");
    expect(result.code).toContain("<Component");
  });

  it("should propagate forwardedAs through multi-level styled(Component) wrapper chains", () => {
    const source = `
import React from "react";
import styled from "styled-components";

type LeafProps = {
  as?: React.ElementType;
  href?: string;
  children?: React.ReactNode;
};

const Leaf = ({ as: Component = "button", ...rest }: LeafProps) => {
  return <Component {...rest} />;
};

const Base = styled(Leaf)\`
  color: red;
\`;

const Mid = styled(Base)\`
  background: blue;
\`;

const Outer = styled(Mid)\`
  border: 1px solid black;
\`;

export const App = () => (
  <div>
    <Base as="section">Base polymorphic</Base>
    <Outer forwardedAs="a" href="#">
      Outer forwardedAs
    </Outer>
  </div>
);
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).not.toBeNull();
    expect(result.code).toContain('<Outer forwardedAs="a" href="#">');
    expect(result.code).toContain("function Base");
    expect(result.code).toContain("as={forwardedAs ?? rest.as}");
  });
});

describe("self attribute selector handling", () => {
  it("should bail on bare attribute selector without & (descendant targeting)", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  opacity: 0;
  [data-visible="true"] {
    opacity: 1;
  }
\`;

export const App = () => <Box />;
`;
    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    expect(result.code).toBeNull();
  });
});

describe("non-literal fallback in theme access", () => {
  it("should bail when theme access has a non-literal fallback like props.fallbackColor", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: \${(props) => props.theme.color.labelBase ?? props.fallbackColor};
\`;

export const App = () => <Box fallbackColor="red" />;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should bail (not silently drop the fallback)
    expect(result.code).toBeNull();
  });
});

describe("grouped reverse selectors with different components", () => {
  it("should bail when comma-grouped reverse selector references different components", () => {
    const source = `
import styled from "styled-components";

const Link = styled.a\`
  color: blue;
\`;

const Button = styled.button\`
  color: green;
\`;

const Icon = styled.span\`
  opacity: 0.5;

  \${Link}:focus &, \${Button}:active & {
    opacity: 1;
  }
\`;

export const App = () => (
  <div>
    <Link><Icon>link icon</Icon></Link>
    <Button><Icon>button icon</Icon></Button>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // The `Icon` decl carries the grouped reverse selector across different
    // components and cannot be transformed. With per-decl skips the other
    // decls may convert, but `Icon` must remain as styled-components and the
    // grouped-reverse-selector warning must be emitted.
    expect(result.warnings.some((w) => w.type.includes("grouped reverse selector"))).toBe(true);
    if (result.code !== null) {
      expect(result.code).toMatch(/const\s+Icon\s*=\s*styled\.span`/);
    }
  });
});

describe("comma-separated pseudo-element handling", () => {
  it("should not leak properties between pseudo-elements in css helper blocks", () => {
    // P1 regression: When a css helper has individual pseudo-element rules BEFORE a
    // comma-separated rule, the Object.assign approach was copying stale state from
    // earlier rules to subsequent pseudo-element targets.
    const source = `
import styled, { css } from "styled-components";

const Box = styled.div<{ $decorated?: boolean }>\`
  width: 48px;
  height: 16px;

  \${(props) =>
    props.$decorated &&
    css\`
      &:before {
        top: -8px;
      }
      &:before,
      &:after {
        content: "";
        position: absolute;
      }
      &:after {
        bottom: -8px;
      }
    \`}
\`;

export const App = () => (
  <div>
    <Box>Normal</Box>
    <Box $decorated>Decorated</Box>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // ::after should NOT have "top" — that was only set on ::before
    expect(result.code).not.toMatch(/"::after":\s*\{[^}]*top/);
    // ::before SHOULD have "top"
    expect(result.code).toMatch(/"::before":\s*\{[^}]*top/);
  });

  it("should produce order-independent results for comma-separated pseudo-elements", () => {
    // P2 regression: &:before, &:after should produce the same result as &:after, &:before
    const source1 = `
import styled from "styled-components";

const Box1 = styled.div\`
  &:before,
  &:after {
    content: "";
    position: absolute;
  }
\`;

export const App = () => <Box1>Test</Box1>;
`;

    const source2 = `
import styled from "styled-components";

const Box1 = styled.div\`
  &:after,
  &:before {
    content: "";
    position: absolute;
  }
\`;

export const App = () => <Box1>Test</Box1>;
`;

    const result1 = transformWithWarnings(
      { source: source1, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );
    const result2 = transformWithWarnings(
      { source: source2, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result1.code).not.toBeNull();
    expect(result2.code).not.toBeNull();
    // Both should produce identical output (same ::before and ::after blocks)
    expect(result1.code).toBe(result2.code);
  });
});

describe("two-slot border interpolation ordering", () => {
  it("should correctly assign slots when width and color are in reverse CSS position", () => {
    // Regression test: CSS border shorthand allows any order for width/style/color,
    // so the codemod must classify resolved values rather than assuming positional roles.
    const source = `
import React from "react";
import styled from "styled-components";
import { borderColor, borderWidth } from "./lib/helpers";

const Container = styled.div\`
  border: \${borderColor()} solid \${borderWidth()};
\`;

export function App() {
  return <Container>Hello</Container>;
}
`;

    const adapterWithLiteralResolves: Adapter = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveCall(ctx) {
        if (ctx.calleeImportedName === "borderWidth") {
          return { expr: '"0.5px"', imports: [] };
        }
        if (ctx.calleeImportedName === "borderColor") {
          return { expr: '"red"', imports: [] };
        }
        return undefined;
      },
      resolveValue() {
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    };

    const result = transformWithWarnings(
      { source, path: "border-order-test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithLiteralResolves },
    );

    expect(result.code).not.toBeNull();
    // The classification should detect that "red" is NOT a length and "0.5px" IS a length,
    // and swap the assignments correctly
    expect(result.code).toContain("borderWidth: 0.5");
    expect(result.code).toContain('borderStyle: "solid"');
    expect(result.code).toContain('borderColor: "red"');
    // Should NOT have the reversed (wrong) assignment
    expect(result.code).not.toContain('borderWidth: "red"');
    expect(result.code).not.toContain('borderColor: "0.5px"');
  });

  it("preserves inline JSX props args left out of mixinOrder", () => {
    const source = `
import styled from "styled-components";
import { borderStyles, themedBorder } from "./lib/helpers";

type Color = "labelBase" | "labelMuted";

const Box = styled.div<{ active?: boolean; color: Color }>\`
  border: \${borderStyles()};
  border-color: \${(props) => (props.active ? "red" : "blue")};
  border: \${themedBorder("labelMuted")};
  color: \${(props) => props.theme.color[props.color]};
  padding: 4px;
\`;

export const App = () => (
  <Box active color="labelBase">
    Label
  </Box>
);
`;

    const adapter: Adapter = {
      ...fixtureAdapter,
      useSxProp: false,
      usePhysicalProperties: true,
      resolveCall(ctx) {
        if (ctx.calleeImportedName === "borderStyles") {
          return {
            usage: "props",
            expr: "borderMixins.default",
            imports: [
              {
                from: { kind: "specifier", value: "./lib/borderMixins.stylex" },
                names: [{ imported: "borderMixins" }],
              },
            ],
          };
        }
        return fixtureAdapter.resolveCall?.(ctx);
      },
    };

    const result = transformWithWarnings(
      { source, path: "inline-leftover-props-args.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toMatch(
      /stylex\.props\([\s\S]*borderMixins\.default[\s\S]*\$colorMixins\.color/,
    );
    expect(result.code).toMatch(/stylex\.props\([\s\S]*styles\.boxActive[\s\S]*styles\.boxBorder/);
  });
});

describe("conditional border helper with complex color", () => {
  it("should bail rather than emit mangled CSS when border color contains spaces", () => {
    const source = `
import styled from "styled-components";
import { thinBorder } from "./lib/helpers";

const Box = styled.div<{ $bordered?: boolean }>\`
  padding: 8px;
  border: \${(props) => (props.$bordered ? thinBorder("rgb(0 0 0 / 0.5)") : "none")};
\`;

export const App = () => <Box $bordered>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "border-complex-color.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    if (result.code) {
      // If the transform succeeds, it must NOT contain a mangled color
      // where numeric channels from rgb() are misclassified as border width
      expect(result.code).not.toContain('borderWidth: "0"');
      expect(result.code).not.toContain('borderColor: "rgb(0 0 / 0.5)"');
    }
    // Either bail (code is null) or produce correct output — both acceptable
  });
});

describe("inline base resolver variant coexistence", () => {
  it("should preserve resolver JSX variants when template variants are also present", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)<{ size: "sm" | "lg" }>\`
  color: black;
  \${(props) => props.size === "sm" && "color: red;"}
  \${(props) => props.size === "lg" && "color: blue;"}
\`;

export function App() {
  return (
    <>
      <Container size="sm" gap={8}>
        Small
      </Container>
      <Container size="lg" gap={16}>
        Large
      </Container>
    </>
  );
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-templateAndJsxVariants.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("containerGapVariants");
    // Numeric variant keys are emitted as number literals (not strings)
    // so `keyof typeof` yields number types matching JSX `gap={8}`.
    expect(code).toMatch(/\b8:\s*\{/);
    expect(code).toMatch(/\b16:\s*\{/);
    expect(code).toContain("color");
  });

  it("should preserve non-canonical numeric-like variant keys as strings", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)\`
  padding: 4px;
\`;

export function App() {
  return (
    <>
      <Container gap="08">A</Container>
      <Container gap="16">B</Container>
    </>
  );
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-nonCanonicalNumericKeys.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // "08" must NOT be converted to numeric key 8, since String(Number("08")) !== "08".
    // The key must remain the string "08" so lookups like variants["08"] work.
    expect(code).toMatch(/"08":\s*\{/);
    // "16" is canonical (String(Number("16")) === "16") so it can be a numeric key
    expect(code).toMatch(/\b16:\s*\{/);
  });

  it("should not apply variant style for falsy string literal props", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)\`
  padding: 4px;
\`;

export function App() {
  return (
    <>
      <Container align="">Empty</Container>
      <Container align="center">Center</Container>
    </>
  );
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-falsyStringLiteral.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // The empty-string call site should NOT get the align variant style applied.
    // An empty string is falsy, so the truthy-guard condition should not trigger.
    expect(code).not.toMatch(/align="".*styles\.container.*Align/s);
    // The "center" call site SHOULD get the align variant applied
    expect(code).toContain("containerAlignVariants");
  });
});

describe("consumed props typing for exported intrinsic wrappers", () => {
  it("includes consumed inline-base variant props for exported wrappers with explicit props", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Header = styled(Flex)<{ isCompact?: boolean }>\`
  padding: \${(props) => (props.isCompact ? "4px" : "16px")};
  background-color: #f0f5ff;
\`;

export function App() {
  return (
    <>
      <Header justify="center" gap={12} isCompact>
        Header
      </Header>
      <Header justify="flex-start" gap={8}>
        Header 2
      </Header>
    </>
  );
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-exportedExplicitConsumedProps.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("type HeaderProps =");
    expect(code).toMatch(/isCompact\?: boolean\b/);
    expect(code).toMatch(/gap\?: keyof typeof [A-Za-z0-9_]+GapVariants\b/);
    expect(code).toMatch(/justify\?: keyof typeof [A-Za-z0-9_]+JustifyVariants\b/);
  });

  it("includes consumed inline-base variant props for exported shouldForwardProp wrappers", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Header = styled(Flex).withConfig({
  shouldForwardProp: (prop) => prop !== "isCompact",
})<{ isCompact?: boolean }>\`
  padding: \${(props) => (props.isCompact ? "4px" : "16px")};
  background-color: #f0f5ff;
\`;

export function App() {
  return (
    <>
      <Header justify="center" gap={12} isCompact>
        Header
      </Header>
      <Header justify="flex-start" gap={8}>
        Header 2
      </Header>
    </>
  );
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-sfpExportedExplicitConsumedProps.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("type HeaderProps =");
    expect(code).toMatch(/isCompact\?: boolean\b/);
    expect(code).toMatch(/gap\?: keyof typeof [A-Za-z0-9_]+GapVariants\b/);
    expect(code).toMatch(/justify\?: keyof typeof [A-Za-z0-9_]+JustifyVariants\b/);
  });
});

describe("inline base resolver safety guards", () => {
  it("should bail via cascade detection when inline resolution has no local JSX callsites", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Container = styled(Flex)\`
  padding: 4px;
\`;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-noLocalCallsites.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(CASCADE_CONFLICT_WARNING);
  });

  it("should bail via cascade detection when attrs source cannot be statically resolved", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const sharedAttrs = { gap: 8 };

const Container = styled(Flex).attrs(sharedAttrs)\`
  padding: 4px;
\`;

export function App() {
  return <Container>Unknown attrs source</Container>;
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-unknownAttrsSource.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(CASCADE_CONFLICT_WARNING);
  });

  it("should bail via cascade detection when JSX `as` changes the resolved tag", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)\`
  padding: 4px;
\`;

export function App() {
  return (
    <Container as="span" gap={8}>
      As span
    </Container>
  );
}
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "inlineBase-asProp.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toBeNull();
    expect(result.warnings.map((w) => w.type)).toContain(CASCADE_CONFLICT_WARNING);
  });

  it("should keep template variants when a prop also drives inline base variants", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)\`
  \${(props) => props.gap && "margin-top: 2px;"}
\`;

export function App() {
  return <Container gap={8}>Overlap</Container>;
}
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "inlineBase-overlapTemplateAndInline.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    // Single-key consumed prop emits as conditional style, not a variant object
    expect(code).toContain("styles.containerGap8");
    // Template expression also produces a conditional style for gap
    expect(code).toContain("styles.containerGap");
  });

  it("should bail via cascade detection when resolveBaseComponent returns malformed consumedProps", () => {
    const source = `
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)\`
  padding: 4px;
\`;

export function App() {
  return <Container gap={8}>Malformed</Container>;
}
`;

    type BaseComponentResult = NonNullable<
      ReturnType<NonNullable<Adapter["resolveBaseComponent"]>>
    >;

    const malformedAdapter: Adapter = {
      ...fixtureAdapter,
      resolveBaseComponent(ctx) {
        const resolved = fixtureAdapter.resolveBaseComponent?.(ctx);
        if (!resolved) {
          return resolved;
        }
        return {
          tagName: resolved.tagName,
          sx: resolved.sx,
          ...("mixins" in resolved ? { mixins: resolved.mixins } : {}),
        } as unknown as BaseComponentResult;
      },
    };

    let result: ReturnType<typeof transformWithWarnings> | undefined;
    expect(() => {
      result = transformWithWarnings(
        {
          source,
          path: join(testCasesDir, "inlineBase-malformedResolverResult.input.tsx"),
        },
        { jscodeshift: j, j, stats: () => {}, report: () => {} },
        { adapter: malformedAdapter },
      );
    }).not.toThrow();

    expect(result?.code).toBeNull();
    expect(result?.warnings.map((w) => w.type)).toContain(CASCADE_CONFLICT_WARNING);
  });
});

describe("local helper function with helper-local variables", () => {
  it("should bail when derived expression references helper-local variables", () => {
    const source = `
import styled from "styled-components";

type Size = "small" | "medium" | "large";

const sizeMap: Record<Size, number> = {
  small: 20,
  medium: 24,
  large: 32,
};

function helperWithLocal(size: Size) {
  const scale = 2;
  const px = sizeMap[size] * scale;
  return \`width: \${px}px;\`;
}

const Box = styled.div<{ size: Size }>\`
  display: flex;
  \${(props) => helperWithLocal(props.size)}
\`;

export const App = () => (
  <div>
    <Box size="small">S</Box>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-localVariable.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // The codemod should bail because `scale` is a helper-local variable
    // that would not be in scope at the call site
    expect(result.code).toBeNull();
  });
});

describe("local helper function with direct param interpolation", () => {
  it("should handle direct param usage without a unit suffix", () => {
    const source = `
import styled from "styled-components";

function opacityHelper(value: number) {
  return \`opacity: \${value};\`;
}

const Box = styled.div<{ opacity: number }>\`
  display: flex;
  \${(props) => opacityHelper(props.opacity)}
\`;

export const App = () => (
  <div>
    <Box opacity={0.5}>Faded</Box>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "helper-directParam.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should NOT bail — opacity: ${value} is a direct param reference (no unit needed)
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("opacity");
  });
});

describe("event handler annotation typing", () => {
  it("does not annotate event handlers on non-polymorphic intrinsic components", () => {
    const source = `
import React from "react";
import styled from "styled-components";

export const Select = styled.select\`
  padding: 4px;
\`;

export const Input = styled.input\`
  padding: 4px;
\`;

export const App = () => (
  <div>
    <Select onChange={(e) => console.log(e.target.value)} />
    <Input onChange={(e) => console.log(e.target.value)} />
  </div>
);
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "event-handler-annotation.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Non-polymorphic components: TypeScript infers event types, no annotation needed
    expect(result.code).not.toContain("React.ChangeEvent");
    expect(result.code).toContain("(e) => console.log(e.target.value)");
  });

  it("does not add type annotations on non-polymorphic components", () => {
    const source = `
import React from "react";
import styled from "styled-components";

export const Overlay = styled.div\`
  position: fixed;
\`;

export const App = () => (
  <Overlay onKeyDown={e => e.stopPropagation()} onClick={e => console.log(e)} />
);
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "event-handler-annotation-parens.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Non-polymorphic: no type annotations added
    expect(result.code).not.toContain("React.KeyboardEvent");
    expect(result.code).not.toContain("React.MouseEvent");
    expect(result.code).toContain("e => e.stopPropagation()");
    expect(result.code).toContain("e => console.log(e)");
  });

  it("does not annotate event handlers on polymorphic components (base tag may be wrong)", () => {
    const source = `
import React from "react";
import styled from "styled-components";

export const Box = styled.div\`
  padding: 4px;
\`;

export const App = () => (
  <div>
    <Box as="input" onChange={(e) => console.log(e.target.value)} />
    <Box onClick={(e) => console.log(e)} />
  </div>
);
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "event-handler-polymorphic.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      {
        adapter: {
          ...fixtureAdapter,
          externalInterface: () => ({ styles: true, as: true, ref: false }),
        },
      },
    );

    expect(result.code).not.toBeNull();
    // Polymorphic: base tag is div but as="input" changes the element type,
    // so annotating with HTMLDivElement would be wrong
    expect(result.code).not.toContain("React.ChangeEvent");
    expect(result.code).not.toContain("React.MouseEvent");
  });
});

describe("transient prop rename with duplicate attrs", () => {
  it("blocks rename when same $-prop appears both before and after spread", () => {
    const source = `
import React from "react";
import styled from "styled-components";

const Fader = styled.div<{ $open: boolean }>\`
  opacity: \${(props) => (props.$open ? 1 : 0)};
\`;

function Consumer(props: { children: React.ReactNode }) {
  const { children, ...rest } = props;
  return (
    <Fader $open={!!children} {...rest} $open={true}>
      {children}
    </Fader>
  );
}

export const App = () => <Consumer>Test</Consumer>;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "transient-duplicate-spread.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // $open appears both before and after the spread — renaming would produce
    // duplicate "open" attributes, so the $ prefix must be preserved.
    // Verify $open is NOT renamed: prop type, destructuring, and JSX all keep "$open"
    expect(result.code).toContain("$open");
    expect(result.code).not.toMatch(/[^$]\bopen\b\s*[?:=,)]/); // no bare "open" prop (without $)
  });
});

describe("backgroundImage URL preservation", () => {
  it("should not modify URL/data URI values that happen to contain gradient-like text", () => {
    // This URL contains unencoded gradient-like text (linear-gradient() as comment/text)
    // that matches the gradient regex but should NOT trigger whitespace normalization
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  background-image: url("icon-linear-gradient(test).svg");
\`;

export const App = () => <Box>URL Background</Box>;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "backgroundImage-urlPreservation.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // The URL should be preserved exactly as-is, not modified by gradient normalization
    expect(result.code).toContain("icon-linear-gradient(test).svg");
  });

  it("should not corrupt whitespace in data URIs with embedded gradient-like text", () => {
    // A data URI with content that happens to match gradient patterns should not be modified
    // The space after "linear-gradient(" should be preserved, not collapsed
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  background-image: url("data:text/plain,linear-gradient(  test  )");
\`;

export const App = () => <Box>Data URI Background</Box>;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "backgroundImage-dataUriPreservation.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // The whitespace inside the URL payload should be preserved exactly
    // If the bug exists, it would collapse "  test  " to " test "
    expect(result.code).toContain("linear-gradient(  test  )");
  });

  it("should still normalize actual gradient values with whitespace", () => {
    const source = `
import styled from "styled-components";

// prettier-ignore
const Box = styled.div\`
  background-image: linear-gradient(
    to right,
    red,
    blue
  );
\`;

export const App = () => <Box>Gradient Background</Box>;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "backgroundImage-gradientNormalize.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    // Multiline gradient should be normalized to single line
    expect(result.code).toContain("linear-gradient(to right, red, blue)");
    // Should not contain newlines in the gradient
    expect(result.code).not.toMatch(/linear-gradient\([^)]*\n[^)]*\)/);
    // prettier-ignore should not be transferred to the output
    expect(result.code).not.toContain("prettier-ignore");
  });
});

describe("prettier-ignore comment removal", () => {
  it("should omit // prettier-ignore from leading comments on styled declaration", () => {
    const source = `
import styled from "styled-components";

// prettier-ignore
const Box = styled.div\`
  color: red;
  padding: 8px;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "prettierIgnore-leading.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("prettier-ignore");
    expect(result.code).toContain("color:");
  });

  it("should omit // prettier-ignore from inside template literal", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: red;
  // prettier-ignore
  padding: 8px;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "prettierIgnore-inline.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("prettier-ignore");
    expect(result.code).toContain("color:");
    expect(result.code).toContain("padding:");
  });

  it("should omit /* prettier-ignore */ block comment from inside template literal", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  color: red;
  /* prettier-ignore */
  padding: 8px;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "prettierIgnore-block.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("prettier-ignore");
    expect(result.code).toContain("color:");
    expect(result.code).toContain("padding:");
  });

  it("should preserve non-prettier-ignore comments while omitting prettier-ignore", () => {
    const source = `
import styled from "styled-components";

// Component description
// prettier-ignore
const Box = styled.div\`
  color: red;
\`;

export const App = () => <Box>Test</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "prettierIgnore-mixed.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).not.toContain("prettier-ignore");
    expect(result.code).toContain("Component description");
  });

  it("should attach standalone // comments to expanded shorthand declarations", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.div\`
  width: 20px !important;
  height: 20px !important;

  // aligns due to empty space around the icon
  margin: 0 -1px;
\`;

export const App = () => <Icon />;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "comment-shorthand.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain(`height: "20px !important",
    // aligns due to empty space around the icon
    marginBlock: 0,
    marginInline: -1,`);
    expect(result.code).not.toContain(`// aligns due to empty space around the icon
    height: "20px !important",`);
  });
});

describe("stylex.keyframes placement", () => {
  it("places module-level stylex.keyframes immediately above stylex.create", () => {
    const source = `
import styled, { keyframes } from "styled-components";

const rotate = keyframes\`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
\`;

const Box = styled.div\`
  animation: \${rotate} 2s linear infinite;
  padding: 1rem;
\`;

export function Helper() {
  return null;
}

export const App = () => <Box sx>spin</Box>;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toMatch(
      /export function Helper[\s\S]*export const App[\s\S]*const rotate = stylex\.keyframes\([\s\S]*?\);\s*\nconst styles = stylex\.create\(/,
    );
    expect(code.indexOf("stylex.keyframes(")).toBeLessThan(code.indexOf("stylex.create("));
  });

  it("does not relocate stylex.keyframes past intervening top-level references", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const names = [fade];

const rotate = keyframes\`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
\`;

const Box = styled.div\`
  animation: \${rotate} 2s linear infinite;
  padding: 1rem;
\`;

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-tdz.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const fade = stylex.keyframes")).toBeLessThan(
      code.indexOf("const names = [fade]"),
    );
    expect(code).toMatch(
      /const rotate = stylex\.keyframes\([\s\S]*?\);\s*\nconst styles = stylex\.create\(/,
    );
  });

  it("does not relocate keyframes past surviving declarators in a shared const", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled, { keyframes } from "styled-components";

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const Box = styled.div\`
  animation: \${fade} 1s linear;
\`, names = [fade];

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-shared-const.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const fade = stylex.keyframes")).toBeLessThan(
      code.indexOf("names = [fade]"),
    );
  });

  it("does not relocate keyframes past indirect top-level reads through closures", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const readFade = () => fade;

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const cached = readFade();

const Box = styled.div\`
  padding: 1rem;
\`;

export const App = () => <Box />;
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-indirect-read.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const fade = stylex.keyframes")).toBeLessThan(
      code.indexOf("const cached = readFade()"),
    );
  });

  it("does not relocate keyframes above bindings used in the keyframes initializer", () => {
    const source = `
import styled, { keyframes } from "styled-components";

const OFFSET = 40;

const sweep = keyframes\`
  from {
    transform: translateX(-\${OFFSET}px);
  }
  to {
    transform: translateX(100%);
  }
\`;

const Box = styled.div\`
  animation: \${sweep} 1s linear;
  padding: 1rem;
\`;

export const App = (
  <div>
    <Box />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-init-deps.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toMatch(/const OFFSET = 40[\s\S]*const sweep = stylex\.keyframes/);
  });

  it("does not relocate keyframes above destructured bindings used in the initializer", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const tokens = { OFFSET: 40 };
const { OFFSET } = tokens;

const sweep = stylex.keyframes({
  from: {
    transform: \`translateX(-\${OFFSET}px)\`,
  },
  to: {
    transform: "translateX(100%)",
  },
});

const Box = styled.div\`
  animation-name: \${sweep};
  padding: 1rem;
\`;

export const App = (
  <div>
    <Box />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-destructure-deps.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toMatch(/\{ OFFSET \} = tokens[\s\S]*const sweep = stylex\.keyframes/);
  });

  it("does not relocate keyframes downward across later initializer dependencies", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const sweep = stylex.keyframes({
  from: {
    transform: \`translateX(-\${OFFSET}px)\`,
  },
  to: {
    transform: "translateX(100%)",
  },
});

var OFFSET = 40;

const Box = styled.div\`
  animation-name: \${sweep};
  padding: 1rem;
\`;

export const App = (
  <div>
    <Box />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-downward-init-deps.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const sweep = stylex.keyframes")).toBeLessThan(
      code.indexOf("var OFFSET = 40"),
    );
  });

  it("does not relocate keyframes past indirect reads via destructured closures", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

const { readFade } = { readFade: () => fade };

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const cached = readFade();

const Box = styled.div\`
  padding: 1rem;
\`;

export const App = (
  <div>
    <Box />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-destructure-closure.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const fade = stylex.keyframes")).toBeLessThan(
      code.indexOf("const cached = readFade()"),
    );
  });

  it("does not relocate keyframes past indirect reads via class static methods", () => {
    const source = `
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";

class Reader {
  static readFade() {
    return fade;
  }
}

const fade = stylex.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const cached = Reader.readFade();

const Box = styled.div\`
  padding: 1rem;
\`;

export const App = (
  <div>
    <Box />
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: join(testCasesDir, "keyframes-placement-class-closure.input.tsx") },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code.indexOf("const fade = stylex.keyframes")).toBeLessThan(
      code.indexOf("const cached = Reader.readFade()"),
    );
  });
});

describe("keyframes in css helper", () => {
  it("should bail on comma-separated multi-animation in css helper rather than misparse", () => {
    const source = `
import styled, { keyframes, css } from "styled-components";

const pulse = keyframes\`
  0% { opacity: 1; }
  100% { opacity: 0.5; }
\`;

const fade = keyframes\`
  from { opacity: 0; }
  to { opacity: 1; }
\`;

const Box = styled.div<{ $animate?: boolean }>\`
  \${(props) =>
    props.$animate &&
    css\`
      animation: \${pulse} 1s linear, \${fade} 2s ease;
    \`}
\`;

export const App = () => <Box $animate>Multi</Box>;
`;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "keyframes-cssConditional.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Comma-separated animations in css helpers should cause a bail
    // (untransformed source) rather than produce incorrect longhands
    expect(result.code).toBeNull();
  });
});

describe("keyframes interpolation safety", () => {
  it("should not convert keyframes when a slot expression resolves to a non-static binding", () => {
    const source = `
import styled, { keyframes } from "styled-components";

const dynamicOpacity = () => 0.5;

const fade = keyframes\`
  from {
    opacity: \${dynamicOpacity};
  }
  to {
    opacity: 1;
  }
\`;

const Box = styled.div\`
  animation: \${fade} 1s linear;
\`;

export const App = () => <Box />;
`;

    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("const fade = keyframes`");
    expect(result.code).not.toContain("const fade = stylex.keyframes(");
  });
});

describe("binary expression with bare props param usage", () => {
  it("should bail when the arrow function body passes props as a bare argument", () => {
    const source = `
import styled from "styled-components";

const offset = (props: { $depth: number }) => props.$depth * 4;

const Box = styled.div<{ $depth: number }>\`
  padding-left: \${(props) => props.$depth * 16 + offset(props)}px;
\`;

export const App = () => <Box $depth={2}>Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });

  it("should bail when the arrow function body uses computed member access", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $base: number; $key: string }>\`
  padding-left: \${(props) => props.$base + props[props.$key]}px;
\`;

export const App = () => <Box $base={10} $key="$base">Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });

  it("should bail when the arrow function body uses string-literal computed access", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $offset: number }>\`
  padding-left: \${(props) => props.$offset + props["$offset"]}px;
\`;

export const App = () => <Box $offset={10}>Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).toBeNull();
  });

  it("should transform when all prop references are member accesses", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $depth: number }>\`
  padding-left: \${(props) => props.$depth * 16 + 4}px;
\`;

export const App = () => <Box $depth={2}>Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("depth * 16 + 4");
    expect(result.code).toContain("styles.boxPaddingLeft(depth)");
  });

  it("should preserve props object access when a nested function shadows props", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ width: string; items: Array<{ width: string }> }>\`
  width: \${(props) => props.items.map((props) => props.width).join(",") || props.width};
\`;

export const App = () => <Box width="100%" items={[{ width: "50%" }]}>Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("props.items.map(props => props.width)");
    expect(code).not.toContain("props.items.map(props => width)");
  });

  it("should preserve destructured local access when a nested function shadows it", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ width: string; items: string[] }>\`
  width: \${({ width: w, items }) => items.map((w) => w).join(",") || w};
\`;

export const App = () => <Box width="100%" items={["50%"]}>Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    expect(result.code).not.toBeNull();
    const code = result.code ?? "";
    expect(code).toContain("props.items.map(w => w)");
    expect(code).toContain("|| props.width");
    expect(code).not.toContain("items.map(w => width)");
  });
});

describe("indexed theme lookup shorthand safety", () => {
  it("should not emit CSS shorthand properties in indexed theme style functions", () => {
    const source = `
import styled from "styled-components";

type Spacing = "sm" | "md";

const Pill = styled.span<{ $spacing: Spacing }>\`
  display: inline-block;

  &::after {
    content: "";
    display: block;
    padding: \${(props) => props.theme.spacing[props.$spacing]};
  }
\`;

export const App = () => <Pill $spacing="sm">Content</Pill>;
`;
    const result = runTransformWithDiagnostics(source);
    // The codemod should NOT emit "padding" as a shorthand in the style function.
    // It should either expand to longhands or bail on the indexed theme path.
    if (result.code) {
      expect(result.code).not.toMatch(/\bpadding:/);
    }
  });

  it("should not emit CSS shorthand properties in indexed theme style functions without pseudo-element", () => {
    const source = `
import styled from "styled-components";

type Spacing = "sm" | "md";

const Box = styled.div<{ $spacing: Spacing }>\`
  padding: \${(props) => props.theme.spacing[props.$spacing]};
\`;

export const App = () => <Box $spacing="sm">Content</Box>;
`;
    const result = runTransformWithDiagnostics(source);
    // The codemod should NOT emit "padding" as a shorthand in the style function.
    // Bailing (code === null) is also acceptable — better than emitting invalid StyleX.
    if (result.code) {
      expect(result.code).not.toMatch(/\bpadding:/);
    }
  });
});

describe("extraClassNames with useSxProp: false", () => {
  it("should merge CSS module className into stylex.props spread instead of adding duplicate className", () => {
    const source = `
import styled from "styled-components";
import { draggableRegion } from "./lib/helpers";

const DraggableBar = styled.div\`
  pointer-events: all;
  \${draggableRegion(true)};
\`;

export function App() {
  return <DraggableBar>Draggable</DraggableBar>;
}
`;

    const adapterWithNoSxProp = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: Parameters<NonNullable<Adapter["resolveCall"]>>[0]) {
        if (ctx.calleeImportedName === "draggableRegion") {
          return {
            extraClassNames: [
              {
                expr: "electronStyles.draggableRegionDisableChildren",
                imports: [
                  {
                    from: { kind: "specifier" as const, value: "./lib/electronMixins.module.css" },
                    names: [{ imported: "default", local: "electronStyles" }],
                  },
                ],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "mixin-extraClassNames.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithNoSxProp },
    );

    expect(result.code).not.toBeNull();
    // With useSxProp: false, the output uses {...stylex.props(...)}.
    // The CSS module className must be folded into the merge, not added as a
    // separate className attribute that would override the spread's className.
    // A duplicate className= after {...stylex.props(...)} causes the element to
    // lose its StyleX classes entirely.
    expect(result.code).toContain("stylex.props");
    expect(result.code).toContain("electronStyles");
    // The className from CSS module should NOT be a standalone JSX attribute
    // following the spread — it must be merged.
    expect(result.code).not.toMatch(/\{\.\.\.stylex\.props\([^)]+\)\}\s*className=/);
  });

  it("joins expression attrs className with extra classNames without stringifying undefined", () => {
    const source = `
import styled from "styled-components";
import { draggableRegion } from "./lib/helpers";

const maybeClassName = undefined as string | undefined;

const DraggableBar = styled.div.attrs({
  className: maybeClassName,
})\`
  pointer-events: all;
  \${draggableRegion(true)};
\`;

export function App() {
  return <DraggableBar>Draggable</DraggableBar>;
}
`;

    const adapterWithNoSxProp = {
      externalInterface() {
        return { styles: false, as: false, ref: false };
      },
      resolveValue() {
        return undefined;
      },
      resolveCall(ctx: Parameters<NonNullable<Adapter["resolveCall"]>>[0]) {
        if (ctx.calleeImportedName === "draggableRegion") {
          return {
            extraClassNames: [
              {
                expr: "electronStyles.draggableRegionDisableChildren",
                imports: [
                  {
                    from: { kind: "specifier" as const, value: "./lib/electronMixins.module.css" },
                    names: [{ imported: "default", local: "electronStyles" }],
                  },
                ],
              },
            ],
          };
        }
        return undefined;
      },
      resolveSelector() {
        return undefined;
      },
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      {
        source,
        path: join(testCasesDir, "mixin-extraClassNames.input.tsx"),
      },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithNoSxProp },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("[maybeClassName,");
    expect(result.code).toContain(".filter(Boolean)");
    expect(result.code).not.toContain("`${maybeClassName}");
  });
});

describe("compound :has() component selectors", () => {
  it("should bail on &:has(${Component}):hover (compound pseudo + has)", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.span\`
  color: blue;
\`;

const Button = styled.button\`
  background: lightgray;

  &:has(\${Icon}):hover {
    background: lightyellow;
  }
\`;

export const App = () => (
  <div>
    <Button>No icon</Button>
    <Button>With icon <Icon>★</Icon></Button>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // The `Button` decl carrying the compound :has+pseudo selector cannot be
    // transformed. With per-decl skips the rest of the file is allowed to
    // convert, but `Button` itself must remain as a styled-components declaration
    // and a warning must be emitted for the unsupported selector.
    expect(
      result.warnings.some(
        (w) => w.type.startsWith("Unsupported selector:") || w.type.includes(":has"),
      ),
    ).toBe(true);
    if (result.code !== null) {
      expect(result.code).toMatch(/const\s+Button\s*=\s*styled\.button`/);
    }
  });

  it("should handle &:has(${Component}) with specificity hack (&&:has)", () => {
    const source = `
import styled from "styled-components";

const Icon = styled.span\`
  color: blue;
\`;

const Button = styled.button\`
  background: lightgray;

  &&:has(\${Icon}) {
    background: lightyellow;
  }
\`;

export const App = () => (
  <div>
    <Button>No icon</Button>
    <Button>With icon <Icon>★</Icon></Button>
  </div>
);
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    // Should transform (not bail) — && is a specificity hack normalized to &
    expect(result.code).not.toBeNull();
    expect(result.code).toContain("stylex.when.descendant");
  });
});

describe("var() rewriter — adapter contract", () => {
  it("should retry adapter resolution without fallback and drop the CSS var default when resolved", () => {
    const source = `
import styled from "styled-components";

const Container = styled.div\`
  border-radius: var(--control-border-radius, 4px);
\`;

export const App = () => <Container>content</Container>;
`;

    const seenFallbacks: Array<string | undefined> = [];
    const noFallbackAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--control-border-radius") {
          seenFallbacks.push(ctx.fallback);
          if (ctx.fallback) {
            return undefined;
          }
          return {
            expr: "vars.controlBorderRadius",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./vars.stylex" },
                names: [{ imported: "vars" }],
              },
            ],
          };
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: noFallbackAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(seenFallbacks).toEqual(["4px", undefined]);
    expect(result.code).toContain("borderRadius: vars.controlBorderRadius");
    expect(result.code).not.toContain("var(--control-border-radius, 4px)");
  });

  it("should not pass placeholder sentinels to adapter when var() default contains a dynamic interpolation", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $tone: string }>\`
  width: \${(props) => \`var(--known-var, \${props.$tone})\`};
\`;

export const App = () => <Box $tone="red">x</Box>;
`;

    const fallbacksSeen: Array<string | undefined> = [];
    const recordingAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--known-var") {
          fallbacksSeen.push(ctx.fallback);
          return {
            expr: "vars.knownVar",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./vars.stylex" },
                names: [{ imported: "vars" }],
              },
            ],
          };
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: recordingAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(fallbacksSeen.length).toBeGreaterThan(0);
    for (const fallback of fallbacksSeen) {
      // Adapter must never receive synthetic interpolation markers as fallback text;
      // it would mis-parse them as part of the user's CSS fallback content.
      expect(fallback ?? "").not.toMatch(/__SC_TPL_EXPR_/);
      expect(fallback ?? "").not.toContain("\u0000");
    }
  });

  it("should rewrite known local CSS variable definitions and usages to the same StyleX variable", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  --spacing-sm: 24px;
  margin-left: var(--spacing-sm);
\`;

export const App = () => <Box>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import * as stylex from "@stylexjs/stylex";
      import { vars } from "./css-variables.stylex";

      export const App = () => <div sx={styles.box}>content</div>;

      const styles = stylex.create({
        box: {
          [vars.spacingSm]: "24px",
          marginLeft: vars.spacingSm,
        },
      });
      "
    `);
  });

  it("should keep unresolved static custom property declarations as string keys", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  --local-gap: 12px;
  gap: var(--local-gap);
  &::before {
    --local-gap: 4px;
    margin-left: var(--local-gap);
  }
\`;

export const App = () => <Box>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import * as React from "react";
      import * as stylex from "@stylexjs/stylex";

      export const App = () => <div sx={styles.box} style={boxInlineStyle}>content</div>;

      const boxInlineStyle = {
        gap: "var(--local-gap)",
      } satisfies React.CSSProperties;

      const styles = stylex.create({
        box: {
          "--local-gap": "12px",
          "::before": {
            "--local-gap": "4px",
            marginLeft: "var(--local-gap)",
          },
        },
      });
      "
    `);
    expect(result.code).not.toContain('["--local-gap"]');
  });

  it("should keep unresolved dynamic custom property declarations out of stylex.create", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  \${(props) => (props.$width != null ? \`--panel-width: \${props.$width}px\` : "")};
  width: var(--panel-width, 200px);
\`;

export const App = () => <Box $width={320}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toMatchInlineSnapshot(`
      "
      import * as React from "react";
      import * as stylex from "@stylexjs/stylex";

      type BoxProps = React.PropsWithChildren<{
        $width?: number;
      }>;

      function Box(props: BoxProps) {
        const {
          children,
          $width,
        } = props;
        const sx = stylex.props($width != null ? styles.boxWithPanelWidth($width) : undefined);

        return (
          <div
            {...sx}
            style={{
              ...sx.style,
              width: "var(--panel-width, 200px)",
            }}>{children}</div>
        );
      }

      export const App = () => <Box $width={320}>content</Box>;

      const styles = stylex.create({
        boxWithPanelWidth: (width: number) => ({
          "--panel-width": \`\${width}px\`,
        }),
      });
      "
    `);
  });

  it("should emit defineVars sidecars for inline-only local custom property writes", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  --panel-width: 200px;
  \${(props) => (props.$width ? \`--panel-width: \${props.$width}px\` : "")};
  padding: 4px;
\`;

export const App = () => <Box $width={320}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toContain('import { testVariables } from "./test.stylex"');
    expect(result.code).toContain('[testVariables["--panel-width"]]');
    expect(result.sidecarFiles?.[0]?.content).toContain("export const testVariables");
    expect(result.sidecarFiles?.[0]?.content).toContain('"--panel-width": "200px"');
  });

  it("should emit defineVars sidecars for inline-only local custom property reads", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  --panel-width: 200px;
  width: var(--panel-width, 200px);
\`;

export const App = () => <Box>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).toContain('import { testVariables } from "./test.stylex"');
    expect(result.code).toContain('width: testVariables["--panel-width"]');
    expect(result.sidecarFiles?.[0]?.content).toContain("export const testVariables");
    expect(result.sidecarFiles?.[0]?.content).toContain('"--panel-width": "200px"');
  });

  it("should rewrite local CSS variable values under computed media keys", () => {
    const source = `
import styled from "styled-components";
import { screenSize } from "./lib/helpers";

const Box = styled.div\`
  --gap: 12px;
  \${screenSize.phone} {
    margin-left: var(--gap, 4px);
  }
\`;

export const App = () => <Box>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toContain('breakpoints.phone]: "var(--gap, 4px)"');
    expect(result.code).toContain('[breakpoints.phone]: testVariables["--gap"]');
  });

  it("should drop rewritten local CSS variable definitions when usage requests dropDefinition", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  --theme-color: red;
  color: var(--theme-color, blue);
\`;

export const App = () => <Box>content</Box>;
`;

    const fallbackDroppingAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--theme-color") {
          return {
            expr: "vars.themeColor",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./vars.stylex" },
                names: [{ imported: "vars" }],
              },
            ],
            ...(ctx.fallback ? { dropDefinition: true } : {}),
          };
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fallbackDroppingAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("color: vars.themeColor");
    expect(result.code).not.toContain("[vars.themeColor]");
  });

  it("should preserve caller style spread when raw CSS variable inline styles are emitted", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div\`
  width: var(--raw-width);
\`;

export const App = (props: { style?: React.CSSProperties }) => <Box {...props}>content</Box>;
`;
    const adapterWithoutSxProp = {
      ...fixtureAdapter,
      styleMerger: null,
      useSxProp: false,
      usePhysicalProperties: true,
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "raw-var-caller-style.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: adapterWithoutSxProp },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('width: "var(--raw-width)"');
    expect(result.code).toContain("...style");
  });

  it("should not inline raw CSS variable values that are overridden by variants", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  color: var(--raw-color);
  \${(props) => (props.$active ? "color: red;" : "")}
\`;

export const App = () => <Box $active>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-variant-override.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('color: "var(--raw-color)"');
    expect(result.code).toContain('color: "red"');
    expect(result.code).toContain("styles.box, active && styles.boxActive");
    expect(result.code).not.toContain('color: "var(--raw-color)",\n      }}');
  });

  it("should not inline raw CSS variable values that are overridden by later css mixins", () => {
    const source = `
import styled, { css } from "styled-components";

const overrideColor = css\`
  color: red;
\`;

const Box = styled.div\`
  color: var(--raw-color);
  \${overrideColor}
\`;

export const App = () => <Box>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-mixin-override.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('color: "var(--raw-color)"');
    expect(result.code).toContain('color: "red"');
    expect(result.code).toContain("styles.box");
    expect(result.code).toContain("styles.overrideColor");
    expect(result.code).not.toContain('color: "var(--raw-color)",\n      }}');
  });

  it("should not inline dynamic raw CSS variable values when a static raw variable for the same property was moved", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  width: \${(props) => \`var(--dynamic-width, \${props.$width ?? 0}px)\`};
  width: var(--static-width);
\`;

export const App = () => <Box $width={120}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-static-dynamic-order.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('width: "var(--static-width)"');
    expect(result.code).toContain("styles.boxWidth(props)");
    expect(result.code).toContain("return <div sx={[styles.box, styles.boxWidth(props)]}>");
    expect(result.code).not.toContain("style={{");
  });

  it("should inline dynamic raw CSS variable values when no later style overrides the property", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  width: \${(props) => \`var(--dynamic-width, \${props.$width ?? 0}px)\`};
\`;

export const App = () => <Box $width={120}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-dynamic-inline.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("style={{");
    expect(result.code).toContain("width: `var(--dynamic-width, ${props.$width ?? 0}px)`");
    expect(result.code).not.toContain("styles.boxWidth(props)");
  });

  it("should inline later dynamic raw CSS variable values after same-property static values", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  width: var(--static-width);
  width: \${(props) => \`var(--dynamic-width, \${props.$width ?? 0}px)\`};
\`;

export const App = () => <Box $width={120}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-static-before-dynamic.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain('width: "var(--static-width)"');
    expect(result.code).toContain("width: `var(--dynamic-width, ${props.$width ?? 0}px)`");
    expect(result.code).not.toContain("styles.boxWidth(props)");
  });

  it("should not inline dynamic raw CSS variable values when a later normal declaration overrides them", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $width?: number }>\`
  width: \${(props) => \`var(--dynamic-width, \${props.$width ?? 0}px)\`};
  width: 10px;
\`;

export const App = () => <Box $width={120}>content</Box>;
`;

    const result = transformWithWarnings(
      { source, path: "raw-var-dynamic-before-static-normal.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: fixtureAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(result.code).toContain("styles.boxWidth(props)");
    expect(result.code).toContain("width: 10");
    expect(result.code).not.toContain("style={{");
  });

  it("should drop --name definition from variant buckets when adapter returns dropDefinition: true", () => {
    const source = `
import styled from "styled-components";

const Box = styled.div<{ $active?: boolean }>\`
  color: var(--variant-color);
  \${(props) => (props.$active ? "--variant-color: red;" : "")}
\`;

export const App = () => (
  <div>
    <Box>off</Box>
    <Box $active>on</Box>
  </div>
);
`;

    const droppingAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--variant-color") {
          return {
            expr: "vars.variantColor",
            imports: [
              {
                from: { kind: "specifier" as const, value: "./vars.stylex" },
                names: [{ imported: "vars" }],
              },
            ],
            dropDefinition: true,
          };
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: droppingAdapter },
    );

    expect(result.code).not.toBeNull();
    // The original `--variant-color: red` definition lived inside the active-variant
    // bucket. With dropDefinition: true the codemod must remove it from every bucket
    // that holds the local definition, not just the base styleObj.
    expect(result.code).not.toContain("--variant-color");
  });

  it("should pass the owning CSS property when resolving var() values", () => {
    const source = `
import styled from "styled-components";

const ClickTarget = styled.button\`
  cursor: var(--pointer);
\`;

export const App = () => <ClickTarget>Click target</ClickTarget>;
`;

    const cssPropertiesSeen: Array<string | undefined> = [];
    const recordingAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--pointer") {
          cssPropertiesSeen.push(ctx.cssProperty);
          return undefined;
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: recordingAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(cssPropertiesSeen).toEqual(["cursor"]);
    expect(result.code).toContain('cursor: "var(--pointer)"');
  });

  it("should pass the original CSS property when resolving var() values from mapped properties", () => {
    const source = `
import styled from "styled-components";

const Panel = styled.section\`
  background-color: var(--surface);
\`;

export const App = () => <Panel>Panel</Panel>;
`;

    const cssPropertiesSeen: Array<string | undefined> = [];
    const recordingAdapter = {
      ...fixtureAdapter,
      resolveValue(ctx: ResolveValueContext) {
        if (ctx.kind === "cssVariable" && ctx.name === "--surface") {
          cssPropertiesSeen.push(ctx.cssProperty);
          if (ctx.cssProperty === "background-color") {
            return {
              expr: "vars.surface",
              imports: [
                {
                  from: { kind: "specifier" as const, value: "./vars.stylex" },
                  names: [{ imported: "vars" }],
                },
              ],
            };
          }
          return undefined;
        }
        return fixtureAdapter.resolveValue(ctx);
      },
    } satisfies Adapter;

    const result = transformWithWarnings(
      { source, path: "test.tsx" },
      { jscodeshift: j, j, stats: () => {}, report: () => {} },
      { adapter: recordingAdapter },
    );

    expect(result.code).not.toBeNull();
    expect(cssPropertiesSeen).toEqual(["background-color"]);
    expect(result.code).toContain("backgroundColor: vars.surface");
  });
});
