import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { glob } from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  Adapter,
  CallResolveContext,
  CallResolveResult,
  ResolveValueContext,
  ResolveValueResult,
} from "./adapter.js";
import { Logger, type CollectedWarning } from "./internal/logger.js";
import { assertValidAdapter, describeValue } from "./internal/public-api-validation.js";

export interface RunTransformOptions {
  /**
   * Glob pattern(s) for files to transform
   * @example "src/**\/*.tsx" or ["src/**\/*.ts", "src/**\/*.tsx"]
   */
  files: string | string[];

  /**
   * Adapter for customizing the transform.
   * Controls value resolution and resolver-provided imports.
   */
  adapter: Adapter;

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

  /**
   * Command to run after transformation to format the output files.
   * The transformed file paths will be appended as arguments.
   * @example "pnpm prettier --write"
   */
  formatterCommand?: string;
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
  /** Warnings emitted during transformation */
  warnings: CollectedWarning[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run the styled-components to StyleX transform on files matching the glob pattern.
 *
 * @example
 * ```ts
 * import { runTransform } from 'styled-components-to-stylex-codemod';
 * import { defineAdapter } from 'styled-components-to-stylex-codemod';
 *
 * const adapter = defineAdapter({
 *   resolveValue(ctx) {
 *     if (ctx.kind !== "theme") return null;
 *     return {
 *       expr: `themeVars.${ctx.path.replace(/\\./g, "_")}`,
 *       imports: [{ from: { kind: "specifier", value: "./theme.stylex" }, names: [{ imported: "themeVars" }] }],
 *     };
 *   },
 * });
 *
 * await runTransform({
 *   files: 'src/**\/*.tsx',
 *   adapter,
 *   dryRun: true,
 * });
 * ```
 */
export async function runTransform(options: RunTransformOptions): Promise<RunTransformResult> {
  if (!options || typeof options !== "object") {
    throw new Error(
      [
        "runTransform(options) was called with an invalid argument.",
        "Expected: runTransform({ files: string | string[], adapter: Adapter, ... })",
        `Received: ${describeValue(options)}`,
        "",
        "Example (plain JS):",
        '  import { runTransform, defineAdapter } from "styled-components-to-stylex-codemod";',
        "  const adapter = defineAdapter({ resolveValue() { return null; } });",
        '  await runTransform({ files: "src/**/*.tsx", adapter });',
      ].join("\n"),
    );
  }

  // Validate early so JS users get actionable errors instead of destructuring crashes.
  const filesValue = (options as { files?: unknown }).files;
  if (typeof filesValue !== "string" && !Array.isArray(filesValue)) {
    throw new Error(
      [
        "runTransform(options): `files` is required.",
        "Expected: files: string | string[]",
        `Received: files=${describeValue(filesValue)}`,
      ].join("\n"),
    );
  }
  if (typeof filesValue === "string" && filesValue.trim() === "") {
    throw new Error(
      [
        "runTransform(options): `files` must be a non-empty string.",
        'Example: files: "src/**/*.tsx"',
      ].join("\n"),
    );
  }
  if (Array.isArray(filesValue)) {
    if (filesValue.length === 0) {
      throw new Error(
        [
          "runTransform(options): `files` must not be an empty array.",
          'Example: files: ["src/**/*.ts", "src/**/*.tsx"]',
        ].join("\n"),
      );
    }
    const bad = filesValue.find((p) => typeof p !== "string" || p.trim() === "");
    if (bad !== undefined) {
      throw new Error(
        [
          "runTransform(options): `files` array must contain non-empty strings.",
          `Received: files=${describeValue(filesValue)}`,
        ].join("\n"),
      );
    }
  }

  const { files, dryRun = false, print = false, parser = "tsx", formatterCommand } = options;

  const adapter = options.adapter;
  assertValidAdapter(adapter, "runTransform(options)");

  const resolveValueWithLogging = (ctx: ResolveValueContext): ResolveValueResult | null => {
    try {
      return adapter.resolveValue(ctx);
    } catch (e) {
      const msg = `adapter.resolveValue threw an error: ${
        e instanceof Error ? e.message : String(e)
      }`;
      const filePath = ctx.filePath ?? "<unknown>";
      Logger.logError(msg, filePath, undefined, ctx);
      throw e;
    }
  };

  const resolveCallWithLogging = (ctx: CallResolveContext): CallResolveResult | null => {
    try {
      return adapter.resolveCall(ctx);
    } catch (e) {
      const msg = `adapter.resolveCall threw an error: ${e instanceof Error ? e.message : String(e)}`;
      Logger.logError(msg, ctx.callSiteFilePath, undefined, ctx);
      throw e;
    }
  };

  const adapterWithLogging: Adapter = {
    styleMerger: adapter.styleMerger,
    shouldSupportExternalStyling(ctx) {
      return adapter.shouldSupportExternalStyling(ctx);
    },
    resolveValue: resolveValueWithLogging,
    resolveCall: resolveCallWithLogging,
  };

  // Resolve file paths from glob patterns
  const patterns = Array.isArray(files) ? files : [files];
  const filePaths: string[] = [];

  const cwd = process.cwd();
  for (const pattern of patterns) {
    for await (const file of glob(pattern, { cwd })) {
      filePaths.push(file);
    }
  }

  if (filePaths.length === 0) {
    Logger.warn("No files matched the provided glob pattern(s)");
    return {
      errors: 0,
      unchanged: 0,
      skipped: 0,
      transformed: 0,
      timeElapsed: 0,
      warnings: [],
    };
  }

  // Path to the transform module.
  // - In published builds, `dist/index.mjs` and `dist/transform.mjs` live together.
  // - In-repo tests/dev, `src/transform.mjs` doesn't exist, but `dist/transform.mjs` usually does
  const transformPath = (() => {
    const adjacent = join(__dirname, "transform.mjs");
    if (existsSync(adjacent)) {
      return adjacent;
    }

    const distSibling = join(__dirname, "..", "dist", "transform.mjs");
    if (existsSync(distSibling)) {
      return distSibling;
    }

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
    adapter: adapterWithLogging,
    // Programmatic use passes an Adapter object (functions). That cannot be
    // serialized across process boundaries, so we must run in-band.
    runInBand: true,
  });

  // Run formatter if specified and files were transformed (not in dry run mode)
  if (formatterCommand && result.ok > 0 && !dryRun) {
    const [cmd, ...cmdArgs] = formatterCommand.split(/\s+/);
    if (cmd) {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(cmd, [...cmdArgs, ...filePaths], {
            stdio: "inherit",
            shell: true,
          });
          proc.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Formatter command exited with code ${code}`));
            }
          });
          proc.on("error", reject);
        });
      } catch (e) {
        Logger.warn(`Formatter command failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
    warnings: Logger.flushWarnings(),
  };
}
