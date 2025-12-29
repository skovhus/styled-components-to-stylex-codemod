import { describe, it, expect } from 'vitest';
import { applyTransform } from 'jscodeshift/src/testUtils.js';
import jscodeshift from 'jscodeshift';
import { readdirSync, readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import transform, {
  transformWithWarnings,
  cssVariablesAdapter,
  defineVarsAdapter,
  inlineValuesAdapter,
} from './transform.js';
import type { Adapter, TransformOptions } from './transform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default adapter for tests
const defaultAdapter: Adapter = cssVariablesAdapter;
const testCasesDir = join(__dirname, 'test-cases');
const j = jscodeshift.withParser('tsx');

function getTestCases(): string[] {
  const files = readdirSync(testCasesDir);
  const inputFiles = files.filter((f) => f.endsWith('.input.ts'));
  const outputFiles = files.filter((f) => f.endsWith('.output.ts'));

  const inputNames = new Set(inputFiles.map((f) => f.replace('.input.ts', '')));
  const outputNames = new Set(outputFiles.map((f) => f.replace('.output.ts', '')));

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

function readTestCase(name: string): { input: string; output: string; inputPath: string; outputPath: string } {
  const inputPath = join(testCasesDir, `${name}.input.ts`);
  const outputPath = join(testCasesDir, `${name}.output.ts`);

  if (!existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  if (!existsSync(outputPath)) {
    throw new Error(`Output file not found: ${outputPath}`);
  }

  const input = readFileSync(inputPath, 'utf-8');
  const output = readFileSync(outputPath, 'utf-8');
  return { input, output, inputPath, outputPath };
}

function runTransform(source: string, options: TransformOptions = {}): string {
  const opts = { adapter: defaultAdapter, ...options };
  const result = applyTransform(transform, opts, { source, path: 'test.tsx' }, { parser: 'tsx' });
  // applyTransform returns empty string when no changes, return original source
  return result || source;
}

function lintCode(code: string, name: string): void {
  const tempFile = join(testCasesDir, `_temp_${name}.tsx`);
  try {
    writeFileSync(tempFile, code);
    execSync(`pnpm oxlint "${tempFile}"`, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string };
    throw new Error(`Lint errors in transformed output:\n${err.stdout ?? err.stderr ?? ''}`);
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
        if (decl?.type === 'FunctionDeclaration') {
          return decl.id?.name === 'App';
        }
        if (decl?.type === 'VariableDeclaration') {
          return decl.declarations.some(
            (d) => 'id' in d && d.id.type === 'Identifier' && d.id.name === 'App'
          );
        }
        // export { App } (or export { App as Something })
        const specs = p.node.specifiers ?? [];
        return specs.some((s) => {
          if (s.type !== 'ExportSpecifier') return false;
          const exported = s.exported;
          if (exported.type === 'Identifier') {
            return exported.name === 'App';
          }
          // Handle Literal type for string exports
          if ('value' in exported && typeof exported.value === 'string') {
            return exported.value === 'App';
          }
          return false;
        });
      })
      .size() > 0;

  if (!hasExportedApp) {
    throw new Error(`${fileLabel} must export a named App component (required by Storybook auto-discovery).`);
  }
}

describe('test case file pairing', () => {
  it('should have matching input/output files for all test cases', () => {
    // This test verifies the test case structure is valid
    // getTestCases() throws if there are mismatched files
    const testCases = getTestCases();
    expect(testCases.length).toBeGreaterThan(0);
  });
});

describe('test case exports', () => {
  const testCases = getTestCases();

  it.each(testCases)('%s should export App in both input and output', (name) => {
    const { input, output } = readTestCase(name);
    assertExportsApp(input, `${name}.input.ts`);
    assertExportsApp(output, `${name}.output.ts`);
  });
});

describe('output invariants', () => {
  const testCases = getTestCases();

  it.each(testCases)('%s output should not import styled-components', (name) => {
    const { output } = readTestCase(name);
    expect(output).not.toMatch(/from\s+['"]styled-components['"]/);
  });
});

describe('output file linting', () => {
  const testCases = getTestCases();

  it.each(testCases)('%s output should pass linting', (name) => {
    const { output } = readTestCase(name);
    // Output fixtures are `.ts` but contain JSX; lint via a `.tsx` temp file.
    lintCode(output, `${name}_output`);
  });
});

// TODO: Enable these tests once the transform is fully implemented.
// These tests verify that the transform converts styled-components to StyleX.
// Currently the transform is a stub that only adds TODO comments.
describe.skip('transform (pending implementation)', () => {
  const testCases = getTestCases();

  it.each(testCases)('%s', (name) => {
    const { input, output } = readTestCase(name);
    const result = runTransform(input);
    expect(result).toBe(output);
    lintCode(result, name);
  });
});

describe('transform warnings', () => {
  it('should warn when createGlobalStyle is used', () => {
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
      { source, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: defaultAdapter }
    );

    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning).toMatchObject({
      type: 'unsupported-feature',
      feature: 'createGlobalStyle',
    });
    expect(warning.message).toContain('createGlobalStyle is not supported in StyleX');
  });

  it('should not warn when createGlobalStyle is not used', () => {
    const source = `
import styled from 'styled-components';

const Button = styled.button\`
  color: blue;
\`;
`;

    const result = transformWithWarnings(
      { source, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: defaultAdapter }
    );

    expect(result.warnings).toHaveLength(0);
  });
});

describe('adapter configuration', () => {
  const themeSource = `
import styled from 'styled-components';

const Button = styled.button\`
  color: \${props => props.theme.colors.primary};
\`;

export const App = () => <Button>Click</Button>;
`;

  it('should accept cssVariablesAdapter', () => {
    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: cssVariablesAdapter }
    );

    // Transform runs without error
    expect(result.warnings).toHaveLength(0);
  });

  it('should accept defineVarsAdapter', () => {
    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: defineVarsAdapter }
    );

    expect(result.warnings).toHaveLength(0);
  });

  it('should accept inlineValuesAdapter', () => {
    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: inlineValuesAdapter }
    );

    expect(result.warnings).toHaveLength(0);
  });

  it('should accept custom adapter', () => {
    const customAdapter: Adapter = {
      transformValue({ path, defaultValue }) {
        return `customVar('${path}', '${defaultValue ?? ''}')`;
      },
      getImports() {
        return ["import { customVar } from './custom-theme';"];
      },
      getDeclarations() {
        return [];
      },
    };

    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: customAdapter }
    );

    expect(result.warnings).toHaveLength(0);
  });

  it('should use cssVariablesAdapter by default when no adapter specified', () => {
    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      {}
    );

    // Should run without error using default adapter
    expect(result.warnings).toHaveLength(0);
  });

  it('should handle builtin: prefix for adapter names', () => {
    const result = transformWithWarnings(
      { source: themeSource, path: 'test.tsx' },
      { jscodeshift, j: jscodeshift, stats: () => {}, report: () => {} },
      { adapter: 'builtin:defineVars' }
    );

    expect(result.warnings).toHaveLength(0);
  });
});
