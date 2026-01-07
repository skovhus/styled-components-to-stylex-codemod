import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { glob } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { Adapter } from "./adapter.js";
import { flushWarnings, logWarning, type CollectedWarning } from "./internal/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
  const { files, dryRun = false, print = false, parser = "tsx", formatterCommand } = options;

  const adapter = options.adapter;
  if (!adapter || typeof adapter.resolveValue !== "function") {
    throw new Error("Adapter must provide resolveValue(ctx) => { expr, imports } | null");
  }

  const adapterWithLogging: Adapter = {
    resolveValue(ctx) {
      try {
        return adapter.resolveValue(ctx);
      } catch (e: any) {
        const kind = (ctx as any)?.kind;
        const details =
          kind === "theme"
            ? `path=${String((ctx as any).path ?? "")}`
            : kind === "cssVariable"
              ? `name=${String((ctx as any).name ?? "")}`
              : kind === "call"
                ? `callee=${String((ctx as any).calleeImportedName ?? "")} source=${String(
                    (ctx as any).calleeSource?.value ?? "",
                  )} file=${String((ctx as any).callSiteFilePath ?? "")}`
                : "";
        const msg = `[styled-components-to-stylex] adapter.resolveValue threw${
          kind ? ` (kind=${kind}${details ? ` ${details}` : ""})` : ""
        }: ${(e as any)?.stack ?? String(e)}\n`;
        logWarning(msg);
        throw e;
      }
    },
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
    logWarning("No files matched the provided glob pattern(s)\n");
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
        logWarning(
          `[styled-components-to-stylex] Formatter command failed: ${e instanceof Error ? e.message : String(e)}\n`,
        );
      }
    }
  }

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
    warnings: flushWarnings(),
  };
}
