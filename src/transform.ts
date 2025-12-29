import type { API, FileInfo, Options } from 'jscodeshift';
import type { Adapter } from './adapters/adapter.js';
import { cssVariablesAdapter, defineVarsAdapter, inlineValuesAdapter } from './adapters/adapter.js';

/**
 * Warning emitted during transformation for unsupported features
 */
export interface TransformWarning {
  type: 'unsupported-feature';
  feature: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Result of the transform including any warnings
 */
export interface TransformResult {
  code: string | null;
  warnings: TransformWarning[];
}

/**
 * Options for the transform
 */
export interface TransformOptions extends Options {
  /** Path to adapter module or built-in adapter name (prefixed with 'builtin:') */
  adapter?: string | Adapter;
}

/**
 * Get the adapter from options
 */
function getAdapter(options: TransformOptions): Adapter {
  const { adapter } = options;

  if (!adapter) {
    return cssVariablesAdapter;
  }

  // If adapter is already an Adapter object (passed directly in tests)
  if (typeof adapter === 'object' && 'transformValue' in adapter) {
    return adapter;
  }

  // Handle built-in adapter names
  if (typeof adapter === 'string') {
    if (adapter.startsWith('builtin:')) {
      const name = adapter.slice('builtin:'.length);
      switch (name) {
        case 'cssVariables':
          return cssVariablesAdapter;
        case 'defineVars':
          return defineVarsAdapter;
        case 'inlineValues':
          return inlineValuesAdapter;
        default:
          console.warn(`Unknown built-in adapter: ${name}, using cssVariables`);
          return cssVariablesAdapter;
      }
    }

    // Custom adapter path - dynamically import
    // Note: This is async, so for CLI usage we handle it differently
    // For now, we support sync usage with built-in adapters and direct Adapter objects
    console.warn(`Custom adapter paths require async loading. Using cssVariables adapter.`);
    console.warn(`For custom adapters, use the programmatic API with adapter object.`);
    return cssVariablesAdapter;
  }

  return cssVariablesAdapter;
}

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(
  file: FileInfo,
  api: API,
  options: TransformOptions
): string | null {
  const result = transformWithWarnings(file, api, options);

  // Log warnings to console
  for (const warning of result.warnings) {
    const location = warning.line ? ` (${file.path}:${warning.line}:${warning.column ?? 0})` : ` (${file.path})`;
    console.warn(`[styled-components-to-stylex] Warning${location}: ${warning.message}`);
  }

  return result.code;
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions
): TransformResult {
  const j = api.jscodeshift;
  const root = j(file.source);
  const warnings: TransformWarning[] = [];
  // Get adapter for future use in transformation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const adapter = getAdapter(options);
  void adapter; // Suppress unused warning until transform is implemented

  let hasChanges = false;

  // Find styled-components imports
  const styledImports = root.find(j.ImportDeclaration, {
    source: { value: 'styled-components' },
  });

  if (styledImports.length === 0) {
    return { code: null, warnings: [] };
  }

  // Check for createGlobalStyle usage
  styledImports.forEach((importPath) => {
    const specifiers = importPath.node.specifiers ?? [];
    for (const specifier of specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported.type === 'Identifier' &&
        specifier.imported.name === 'createGlobalStyle'
      ) {
        const warning: TransformWarning = {
          type: 'unsupported-feature',
          feature: 'createGlobalStyle',
          message: 'createGlobalStyle is not supported in StyleX. Global styles should be handled separately (e.g., in a CSS file or using CSS reset libraries).',
        };
        if (specifier.loc) {
          warning.line = specifier.loc.start.line;
          warning.column = specifier.loc.start.column;
        }
        warnings.push(warning);
      }
    }
  });

  // TODO: Implement the actual transformation using the adapter
  // The adapter can be used like:
  // const transformedValue = adapter.transformValue({
  //   path: 'colors.primary',
  //   defaultValue: '#BF4F74',
  //   valueType: 'theme'
  // });

  // Example: Add a comment to indicate this file needs manual review
  styledImports.forEach((path) => {
    const comments = path.node.comments ?? [];
    comments.push(
      j.commentLine(' TODO: Convert to StyleX', true, false)
    );
    path.node.comments = comments;
    hasChanges = true;
  });

  return {
    code: hasChanges ? root.toSource() : null,
    warnings,
  };
}

// Re-export adapter types for convenience
export type { Adapter, AdapterContext } from './adapters/adapter.js';
export { cssVariablesAdapter, defineVarsAdapter, inlineValuesAdapter } from './adapters/adapter.js';
