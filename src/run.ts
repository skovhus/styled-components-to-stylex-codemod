import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { glob } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Adapter } from "./adapter.js";
import { defaultAdapter } from "./adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface RunTransformOptions {
  /**
   * Glob pattern(s) for files to transform
   * @example "src/**\/*.tsx" or ["src/**\/*.ts", "src/**\/*.tsx"]
   */
  files: string | string[];

  /**
   * Adapter for transforming theme values
   * @default defaultAdapter (CSS variables)
   */
  adapter?: Adapter;

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
 * import { runTransform } from 'styled-components-to-stylex-codemod';
 *
 * const myAdapter = {
 *   transformValue({ path, defaultValue }) {
 *     return `themeVars.${path.replace(/\./g, '_')}`;
 *   },
 *   getImports() {
 *     return ["import { themeVars } from './theme.stylex';"];
 *   },
 *   getDeclarations() {
 *     return [];
 *   },
 * };
 *
 * await runTransform({
 *   files: 'src/**\/*.tsx',
 *   adapter: myAdapter,
 *   dryRun: true,
 * });
 * ```
 */
export async function runTransform(options: RunTransformOptions): Promise<RunTransformResult> {
  const {
    files,
    adapter = defaultAdapter,
    dryRun = false,
    print = false,
    parser = "tsx",
  } = options;

  // Resolve file paths from glob patterns
  const patterns = Array.isArray(files) ? files : [files];
  const filePaths: string[] = [];

  for (const pattern of patterns) {
    for await (const file of glob(pattern)) {
      filePaths.push(file);
    }
  }

  if (filePaths.length === 0) {
    process.stderr.write("No files matched the provided glob pattern(s)\n");
    return {
      errors: 0,
      unchanged: 0,
      skipped: 0,
      transformed: 0,
      timeElapsed: 0,
    };
  }

  // Path to the transform module.
  // - In published builds, `run` and `transform` live together in `dist/` (transform.mjs exists next to run.mjs)
  // - In-repo tests/dev, `src/transform.mjs` doesn't exist, but `dist/transform.mjs` usually does
  const transformPath = (() => {
    const adjacent = join(__dirname, "transform.mjs");
    if (existsSync(adjacent)) return adjacent;

    const distSibling = join(__dirname, "..", "dist", "transform.mjs");
    if (existsSync(distSibling)) return distSibling;

    throw new Error(
      [
        "Could not locate transform module.",
        `Tried: ${adjacent}`,
        `       ${distSibling}`,
        "Run `pnpm build` to generate dist artifacts.",
      ].join("\n"),
    );
  })();

  const result = await jscodeshiftRun(transformPath, filePaths, {
    parser,
    dry: dryRun,
    print,
    // Programmatic use passes an Adapter object (functions). That cannot be
    // serialized across process boundaries, so we must run in-band.
    runInBand: true,
    adapter,
  });

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
  };
}
