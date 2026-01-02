import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { glob } from "node:fs/promises";
import type { Hook, Adapter, DynamicHandler } from "./hook.js";
import { normalizeHook, adapterToHook, isAdapter } from "./hook.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RunTransformOptions {
  /**
   * Glob pattern(s) for files to transform
   * @example "src/**\/*.tsx" or ["src/**\/*.ts", "src/**\/*.tsx"]
   */
  files: string | string[];

  /**
   * Hook for customizing the transform.
   * Controls value resolution, imports, declarations, and custom handlers.
   */
  hook?: Hook;

  /**
   * @deprecated Use hook instead
   */
  adapter?: Adapter;

  /**
   * @deprecated Use hook.handlers instead
   */
  handlers?: DynamicHandler[];

  /**
   * Dry run - don't write changes to files
   * @default false
   */
  dryRun?: boolean;

  /**
   * Print transformed output to stdout
   * @default false
   */
  print?: boolean;

  /**
   * jscodeshift parser to use
   * @default "tsx"
   */
  parser?: "babel" | "babylon" | "flow" | "ts" | "tsx";
}

export interface RunTransformResult {
  /** Number of files that had errors */
  errors: number;
  /** Number of files that were unchanged */
  unchanged: number;
  /** Number of files that were skipped */
  skipped: number;
  /** Number of files that were transformed */
  transformed: number;
  /** Total time in seconds */
  timeElapsed: number;
}

/**
 * Run the styled-components to StyleX transform on files matching the glob pattern.
 *
 * @example
 * ```ts
 * import { runTransform, defineHook } from 'styled-components-to-stylex-codemod';
 *
 * const myHook = defineHook({
 *   resolveValue({ path }) {
 *     return `themeVars.${path.replace(/\./g, '_')}`;
 *   },
 *   imports: ["import { themeVars } from './theme.stylex';"],
 * });
 *
 * await runTransform({
 *   files: 'src/**\/*.tsx',
 *   hook: myHook,
 *   dryRun: true,
 * });
 * ```
 */
export async function runTransform(options: RunTransformOptions): Promise<RunTransformResult> {
  const { files, dryRun = false, print = false, parser = "tsx" } = options;

  // Normalize hook from various input shapes
  const rawHook: Hook | undefined = options.hook
    ?? (options.adapter && isAdapter(options.adapter) ? adapterToHook(options.adapter) : undefined);
  const hook = rawHook ? normalizeHook(rawHook) : undefined;

  // Resolve file paths from glob patterns
  const patterns = Array.isArray(files) ? files : [files];
  const filePaths: string[] = [];

  for (const pattern of patterns) {
    for await (const file of glob(pattern)) {
      filePaths.push(file);
    }
  }

  if (filePaths.length === 0) {
    console.warn("No files matched the provided glob pattern(s)");
    return {
      errors: 0,
      unchanged: 0,
      skipped: 0,
      transformed: 0,
      timeElapsed: 0,
    };
  }

  // Path to the transform module
  const transformPath = join(__dirname, "transform.mjs");

  const result = await jscodeshiftRun(transformPath, filePaths, {
    parser,
    dry: dryRun,
    print,
    ...(hook ? { hook } : {}),
    ...(options.handlers ? { handlers: options.handlers } : {}),
  });

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
  };
}
