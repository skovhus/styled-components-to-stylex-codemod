/**
 * Runs the codemod over input files with an adapter.
 * Core concepts: jscodeshift execution, globs, and adapter hooks.
 */
import { run as jscodeshiftRun } from "jscodeshift/src/Runner.js";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  Adapter,
  AdapterInput,
  CallResolveContext,
  CallResolveResult,
  ResolveValueContext,
  ResolveValueResult,
  SelectorResolveContext,
  SelectorResolveResult,
} from "./adapter.js";
import { Logger, type CollectedWarning } from "./internal/logger.js";
import { assertValidAdapterInput, describeValue } from "./internal/public-api-validation.js";

export interface RunTransformOptions {
  /**
   * Glob pattern(s) for files to transform
   * @example "src/**\/*.tsx" or ["src/**\/*.ts", "src/**\/*.tsx"]
   */
  files: string | string[];

  /**
   * File glob(s) to scan for cross-file component selector usage, or `null` to opt out.
   *
   * When set to a glob pattern, files matching this glob that are NOT in `files` trigger
   * the bridge strategy (stable bridge className for incremental migration when consumers
   * are not transformed). Files in both globs use the marker sidecar strategy (both
   * consumer and target are transformed).
   *
   * Required when `externalInterface` is `"auto"`.
   *
   * @example "src/**\/*.tsx"
   * @example null  // opt out of cross-file scanning
   */
  consumerPaths: string | string[] | null;

  /**
   * Adapter for customizing the transform.
   * Controls value resolution and resolver-provided imports.
   *
   * Use `externalInterface: "auto"` to auto-detect which exported components
   * need external className/style and polymorphic `as` support by scanning
   * consumer code specified via `consumerPaths` (or `files`).
   *
   * Note: `"auto"` requires prepass scanning to succeed. If prepass fails,
   * runTransform throws instead of silently falling back.
   */
  adapter: AdapterInput;

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
   * Commands to run after transformation to format the output files.
   * Each command string will be invoked with the transformed file paths appended as arguments.
   * @example ["pnpm prettier --write", "pnpm eslint --fix"]
   */
  formatterCommands?: string[];

  /**
   * Maximum number of examples shown per warning category in the summary.
   * @default 15
   */
  maxExamples?: number;
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
 *   consumerPaths: null,
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
        '  await runTransform({ files: "src/**/*.tsx", consumerPaths: null, adapter });',
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

  // Validate consumerPaths is explicitly provided (null to opt out, or a glob string/array).
  const consumerPathsRaw = (options as { consumerPaths?: unknown }).consumerPaths;
  if (consumerPathsRaw === undefined) {
    throw new Error(
      [
        "runTransform(options): `consumerPaths` is required.",
        "Pass a glob pattern to enable cross-file selector scanning, or `null` to opt out.",
        'Example: consumerPaths: "src/**/*.tsx"  // scan for cross-file usage',
        "Example: consumerPaths: null             // opt out",
      ].join("\n"),
    );
  }

  const {
    files,
    consumerPaths: consumerPathsOption,
    dryRun = false,
    print = false,
    parser = "tsx",
    formatterCommands,
    maxExamples,
  } = options;

  if (maxExamples !== undefined) {
    Logger.setMaxExamples(maxExamples);
  }

  const adapterInput = options.adapter;
  assertValidAdapterInput(adapterInput, "runTransform(options)");

  // externalInterface: "auto" requires consumerPaths to know where to scan
  if (adapterInput.externalInterface === "auto" && consumerPathsOption === null) {
    throw new Error(
      [
        'runTransform(options): externalInterface is "auto" but consumerPaths is null.',
        "Auto-detection needs consumer file globs to scan for styled(Component) and as-prop usage.",
        'Example: consumerPaths: "src/**/*.tsx"',
      ].join("\n"),
    );
  }

  const resolveValueWithLogging = (ctx: ResolveValueContext): ResolveValueResult | undefined => {
    try {
      return adapterInput.resolveValue(ctx);
    } catch (e) {
      const msg = `adapter.resolveValue threw an error: ${
        e instanceof Error ? e.message : String(e)
      }`;
      const filePath = ctx.filePath ?? "<unknown>";
      Logger.logError(msg, filePath, ctx.loc, ctx);
      Logger.markErrorAsLogged(e);
      throw e;
    }
  };

  const resolveCallWithLogging = (ctx: CallResolveContext): CallResolveResult | undefined => {
    try {
      return adapterInput.resolveCall(ctx);
    } catch (e) {
      const msg = `adapter.resolveCall threw an error: ${e instanceof Error ? e.message : String(e)}`;
      Logger.logError(msg, ctx.callSiteFilePath, ctx.loc, ctx);
      Logger.markErrorAsLogged(e);
      throw e;
    }
  };

  const resolveSelectorWithLogging = (
    ctx: SelectorResolveContext,
  ): SelectorResolveResult | undefined => {
    try {
      return adapterInput.resolveSelector(ctx);
    } catch (e) {
      const msg = `adapter.resolveSelector threw an error: ${e instanceof Error ? e.message : String(e)}`;
      Logger.logError(msg, ctx.filePath, ctx.loc, ctx);
      Logger.markErrorAsLogged(e);
      throw e;
    }
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

  Logger.setFileCount(filePaths.length);

  // Resolve consumer paths for cross-file selector prepass
  const consumerPatterns = consumerPathsOption
    ? Array.isArray(consumerPathsOption)
      ? consumerPathsOption
      : [consumerPathsOption]
    : [];
  const consumerFilePaths: string[] = [];
  for (const pattern of consumerPatterns) {
    for await (const file of glob(pattern, { cwd })) {
      consumerFilePaths.push(file);
    }
  }

  if (consumerPatterns.length > 0 && consumerFilePaths.length === 0) {
    throw new Error(
      [
        "runTransform(options): consumerPaths matched no files.",
        `Pattern(s): ${consumerPatterns.join(", ")}`,
        "Check that the glob pattern is correct and files exist.",
      ].join("\n"),
    );
  }

  // Create shared module resolver
  const { createModuleResolver } = await import("./internal/prepass/resolve-imports.js");
  const sharedResolver = createModuleResolver();

  // Unified prepass: cross-file selectors + optional consumer analysis in a single pass.
  // Contract:
  // - externalInterface: "auto" -> prepass is required; fail fast if it crashes.
  // - externalInterface: function -> prepass is best-effort; warn and continue with empty results.
  const { runPrepass } = await import("./internal/prepass/run-prepass.js");
  const absoluteFiles = filePaths.map((f) => resolve(f));
  const absoluteConsumers = consumerFilePaths.map((f) => resolve(f));

  let prepassResult: Awaited<ReturnType<typeof runPrepass>>;
  try {
    prepassResult = await runPrepass({
      filesToTransform: absoluteFiles,
      consumerPaths: absoluteConsumers,
      resolver: sharedResolver,
      parserName: parser,
      createExternalInterface: adapterInput.externalInterface === "auto",
      enableAstCache: true,
    });
  } catch (err) {
    if (adapterInput.externalInterface === "auto") {
      throw createAutoPrepassFailureError(err, consumerPatterns, parser);
    }

    Logger.warn(
      `Prepass failed, continuing without cross-file analysis: ${err instanceof Error ? err.message : String(err)}`,
    );
    prepassResult = {
      crossFileInfo: {
        selectorUsages: new Map(),
        componentsNeedingMarkerSidecar: new Map(),
        componentsNeedingGlobalSelectorBridge: new Map(),
      },
      consumerAnalysis: undefined,
    };
  }

  const crossFilePrepassResult = prepassResult.crossFileInfo;

  // Resolve "auto" externalInterface → concrete function using consumer analysis
  const resolvedAdapter: Adapter = (() => {
    if (adapterInput.externalInterface === "auto" && prepassResult.consumerAnalysis) {
      const analysisMap = prepassResult.consumerAnalysis;
      return {
        ...adapterInput,
        externalInterface: (ctx) => {
          let realPath: string;
          try {
            realPath = realpathSync(resolve(ctx.filePath));
          } catch {
            realPath = resolve(ctx.filePath);
          }
          return (
            analysisMap.get(`${realPath}:${ctx.componentName}`) ?? {
              styles: false,
              as: false,
            }
          );
        },
      };
    }
    return adapterInput as Adapter;
  })();

  const adapterWithLogging: Adapter = {
    styleMerger: resolvedAdapter.styleMerger,
    externalInterface(ctx) {
      return resolvedAdapter.externalInterface(ctx);
    },
    resolveValue: resolveValueWithLogging,
    resolveCall: resolveCallWithLogging,
    resolveSelector: resolveSelectorWithLogging,
  };

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

  // Map populated by the per-file transform to collect sidecar .stylex.ts files
  const sidecarFiles = new Map<string, string>();

  // Map populated by the per-file transform to collect bridge results for consumer patching
  const bridgeResults = new Map<
    string,
    import("./internal/transform-types.js").BridgeComponentResult[]
  >();

  const result = await jscodeshiftRun(transformPath, filePaths, {
    parser,
    dry: dryRun,
    print,
    adapter: adapterWithLogging,
    crossFilePrepassResult,
    sidecarFiles,
    bridgeResults,
    // Programmatic use passes an Adapter object (functions). That cannot be
    // serialized across process boundaries, so we must run in-band.
    runInBand: true,
  });

  // Write sidecar .stylex.ts files (defineMarker declarations)
  if (sidecarFiles.size > 0 && !dryRun) {
    for (const [sidecarPath, content] of sidecarFiles) {
      await writeFile(sidecarPath, content, "utf-8");
    }
  }

  // Patch unconverted consumer files that reference bridge components via CSS selectors
  if (bridgeResults.size > 0 && !dryRun) {
    const { buildConsumerReplacements, patchConsumerFile } =
      await import("./internal/bridge-consumer-patcher.js");
    const consumerReplacements = buildConsumerReplacements(
      crossFilePrepassResult.selectorUsages,
      bridgeResults,
    );
    const patchedFiles: string[] = [];
    for (const [consumerPath, replacements] of consumerReplacements) {
      const patched = patchConsumerFile(consumerPath, replacements);
      if (patched !== null) {
        await writeFile(consumerPath, patched, "utf-8");
        patchedFiles.push(consumerPath);
      }
    }

    // Include patched consumer files in formatter commands
    if (formatterCommands && patchedFiles.length > 0) {
      await runFormatters(formatterCommands, patchedFiles);
    }
  }

  // Run formatter commands if specified and files were transformed (not in dry run mode)
  if (formatterCommands && formatterCommands.length > 0 && result.ok > 0 && !dryRun) {
    await runFormatters(formatterCommands, filePaths);
  }

  const report = Logger.createReport();
  report.print();

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
    warnings: report.getWarnings(),
  };
}

// --- Non-exported helpers ---

function createAutoPrepassFailureError(
  err: unknown,
  consumerPatterns: readonly string[],
  parser: "babel" | "babylon" | "flow" | "ts" | "tsx",
): Error {
  const reason = err instanceof Error ? err.message : String(err);
  return new Error(
    [
      'runTransform(options): prepass failed while using externalInterface: "auto".',
      '"auto" depends on successful prepass scanning and cannot continue without it.',
      `Underlying error: ${reason}`,
      "",
      "Troubleshooting:",
      "  - Verify `consumerPaths` glob(s) and file syntax.",
      `  - Confirm parser setting matches your code (current parser: ${JSON.stringify(parser)}).`,
      "  - Check module resolution inputs (tsconfig paths / imports).",
      "  - Use a manual `externalInterface(ctx)` function to continue without auto-detection.",
      "",
      `consumerPaths: ${consumerPatterns.length > 0 ? consumerPatterns.join(", ") : "(none)"}`,
    ].join("\n"),
  );
}

/** Run formatter commands on a list of files, logging warnings on failure. */
async function runFormatters(commands: string[], files: string[]): Promise<void> {
  for (const formatterCommand of commands) {
    const [cmd, ...cmdArgs] = formatterCommand.split(/\s+/);
    if (cmd) {
      try {
        await new Promise<void>((res, rej) => {
          const proc = spawn(cmd, [...cmdArgs, ...files], {
            stdio: "inherit",
            shell: true,
          });
          proc.on("close", (code) => {
            if (code === 0) {
              res();
            } else {
              rej(new Error(`Formatter command exited with code ${code}`));
            }
          });
          proc.on("error", rej);
        });
      } catch (e) {
        Logger.warn(`Formatter command failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
