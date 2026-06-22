/**
 * Runs the codemod over input files with an adapter.
 * Core concepts: jscodeshift execution, globs, and adapter hooks.
 */
import jscodeshift from "jscodeshift";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { spawn } from "node:child_process";
import type { API, FileInfo } from "jscodeshift";
import type {
  Adapter,
  AdapterInput,
  CallResolveContext,
  CallResolveResult,
  ResolveBaseComponentContext,
  ResolveBaseComponentResult,
  ResolveValueContext,
  ResolveValueDirectionalResult,
  ResolveValueResult,
  SelectorResolveContext,
  SelectorResolveResult,
} from "./adapter.js";
import { Logger, type CollectedWarning } from "./internal/logger.js";
import { assertValidAdapterInput, describeValue } from "./internal/public-api-validation.js";
import { mergeMarkerDeclarations } from "./internal/merge-markers.js";
import type { TransformMode } from "./internal/transform-types.js";
import type {
  TypeScriptComponentMetadata,
  TypeScriptPrepassMetadata,
} from "./internal/prepass/typescript-analysis.js";
import {
  resolveBarrelReExport,
  type Resolve,
} from "./internal/prepass/extract-external-interface.js";
import {
  extractStyledDefBasesFromSource,
  type StyledDefBasesMap,
} from "./internal/prepass/compute-leaf-set.js";
import type {
  CrossFileInfo,
  CrossFileSelectorUsage,
} from "./internal/prepass/scan-cross-file-selectors.js";
import { resolveStaticMemberComponentNames } from "./internal/prepass/resolve-static-members.js";
import { toRealPath } from "./internal/utilities/path-utils.js";
import { transformedComponentAcceptsSx } from "./internal/utilities/sx-surface.js";

export { mergeMarkerDeclarations };

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
   * jscodeshift parser to use.
   *
   * When set to `"ts"` or `"tsx"` (including the default), runTransform also
   * builds TypeScript compiler metadata for more accurate wrapper interfaces.
   *
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
   * @default 3
   */
  maxExamples?: number;

  /**
   * Suppress console output: both the per-file runner messages and the final
   * warning summary report. Warnings are still collected and returned.
   * @default false
   */
  silent?: boolean;

  /**
   * Controls which styled declarations are eligible for conversion.
   *
   * - `"all"` converts every supported styled declaration.
   * - `"leavesOnly"` only converts declarations whose render base is intrinsic
   *   after adapter resolution, or that wrap another leaf styled declaration in
   *   the transform run (including cross-file imports).
   *
   * @default "all"
   */
  transformMode?: TransformMode;

  /**
   * When true, allow the codemod to leave individual styled declarations as-is when
   * they hit an unsupported pattern while transforming the rest of the file. This
   * enables incremental migration: a file with one unconvertible component still
   * produces useful output for the others.
   *
   * When false (default), any per-decl bail escalates to a whole-file bail — the
   * safer/stricter behavior matching the pre-partial-migration semantics.
   *
   * @default false
   */
  allowPartialMigration?: boolean;

  /**
   * Also collect per-file outcomes as if each file were transformed by itself,
   * while reusing the same prepass. Useful for candidate finders that recommend
   * files to run individually.
   *
   * @default false
   */
  collectStandaloneFileResults?: boolean;

  /**
   * Absolute paths of files to treat as already converted to StyleX, even though
   * they are not. Cascade-conflict checks then "see past" these files so a
   * consumer's own unsupported patterns surface instead of being masked by the
   * cascade bail. Intended for analysis-only/dry runs (e.g. the migration plan).
   */
  assumeConvertedFiles?: string[];
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
  /** Per-file outcomes from the dependency-ordered run. */
  fileResults: TransformFileResult[];
  /** Per-file outcomes from isolated transforms, populated when requested. */
  standaloneFileResults?: TransformFileResult[];
  /** Warnings from isolated transforms, populated when requested. */
  standaloneWarnings?: CollectedWarning[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Expand glob pattern(s) into file paths relative to `cwd`. */
export async function expandGlobFiles(patterns: readonly string[], cwd: string): Promise<string[]> {
  const filePaths: string[] = [];
  for (const pattern of patterns) {
    for await (const file of glob(pattern, { cwd })) {
      filePaths.push(file);
    }
  }
  return filePaths;
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
 *   styleMerger: null,
 *   useSxProp: false,
 *   usePhysicalProperties: true,
 *   externalInterface() {
 *     return { styles: false, as: false, ref: false };
 *   },
 *   resolveValue(ctx) {
 *     if (ctx.kind !== "theme") return null;
 *     return {
 *       expr: `themeVars.${ctx.path.replace(/\\./g, "_")}`,
 *       imports: [{ from: { kind: "specifier", value: "./theme.stylex" }, names: [{ imported: "themeVars" }] }],
 *     };
 *   },
 *   resolveCall() {
 *     return null;
 *   },
 *   resolveSelector() {
 *     return undefined;
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
        "  const adapter = defineAdapter({",
        "    styleMerger: null,",
        "    useSxProp: false,",
        "    usePhysicalProperties: true,",
        "    externalInterface() { return { styles: false, as: false, ref: false }; },",
        "    resolveValue() { return null; },",
        "    resolveCall() { return null; },",
        "    resolveSelector() { return undefined; },",
        "  });",
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

  const transformModeRaw = (options as { transformMode?: unknown }).transformMode;
  if (
    transformModeRaw !== undefined &&
    transformModeRaw !== "all" &&
    transformModeRaw !== "leavesOnly"
  ) {
    throw new Error(
      [
        'runTransform(options): `transformMode` must be one of: "all", "leavesOnly".',
        `Received: transformMode=${describeValue(transformModeRaw)}`,
      ].join("\n"),
    );
  }

  const leavesOnly = options.transformMode === "leavesOnly";

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

  const resolveValueWithLogging = (
    ctx: ResolveValueContext,
  ): ResolveValueResult | ResolveValueDirectionalResult | undefined => {
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

  const resolveBaseComponentWithLogging = (
    ctx: ResolveBaseComponentContext,
  ): ResolveBaseComponentResult | undefined => {
    if (!adapterInput.resolveBaseComponent) {
      return undefined;
    }
    try {
      return adapterInput.resolveBaseComponent(ctx);
    } catch (e) {
      const msg = `adapter.resolveBaseComponent threw an error: ${
        e instanceof Error ? e.message : String(e)
      }`;
      Logger.logError(msg, ctx.filePath, undefined, ctx);
      Logger.markErrorAsLogged(e);
      throw e;
    }
  };

  // Resolve file paths from glob patterns
  const patterns = Array.isArray(files) ? files : [files];
  const cwd = process.cwd();
  let filePaths: string[] = await expandGlobFiles(patterns, cwd);

  if (filePaths.length === 0) {
    Logger.warn("No files matched the provided glob pattern(s)");
    return {
      errors: 0,
      unchanged: 0,
      skipped: 0,
      transformed: 0,
      timeElapsed: 0,
      warnings: [],
      fileResults: [],
    };
  }

  Logger.setFileCount(filePaths.length);

  // Resolve consumer paths for cross-file selector prepass
  const consumerPatterns = consumerPathsOption
    ? Array.isArray(consumerPathsOption)
      ? consumerPathsOption
      : [consumerPathsOption]
    : [];
  const consumerFilePaths = await expandGlobFiles(consumerPatterns, cwd);

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
  filePaths = orderFilesByLocalImportDependencies(filePaths, sharedResolver, toRealPath);

  // Unified prepass: cross-file selectors + optional consumer analysis in a single pass.
  // Contract:
  // - externalInterface: "auto" -> prepass is required; fail fast if it crashes.
  // - externalInterface: function -> prepass is best-effort; warn and continue with empty results.
  const { runPrepass } = await import("./internal/prepass/run-prepass.js");
  const absoluteFiles = filePaths.map((f) => resolve(f));
  const absoluteConsumers = consumerFilePaths.map((f) => resolve(f));

  let prepassResult: Awaited<ReturnType<typeof runPrepass>>;
  const prepassStartedAt = performance.now();
  Logger.info(
    `Prepass: starting (${absoluteFiles.length} file${absoluteFiles.length === 1 ? "" : "s"}, ${absoluteConsumers.length} consumer${absoluteConsumers.length === 1 ? "" : "s"}, parser=${parser})\n`,
  );
  try {
    prepassResult = await runPrepass({
      filesToTransform: absoluteFiles,
      consumerPaths: absoluteConsumers,
      resolver: sharedResolver,
      parserName: parser,
      createExternalInterface: adapterInput.externalInterface === "auto",
      enableAstCache: true,
      leavesOnly,
      resolveBaseComponent: adapterInput.resolveBaseComponent,
    });
    Logger.info(`Prepass: completed in ${formatElapsedSeconds(prepassStartedAt)}s\n`);
  } catch (err) {
    if (adapterInput.externalInterface === "auto") {
      throw createAutoPrepassFailureError(err, consumerPatterns, parser);
    }

    Logger.warn(
      `Prepass failed after ${formatElapsedSeconds(prepassStartedAt)}s, continuing without cross-file analysis: ${err instanceof Error ? err.message : String(err)}`,
    );
    prepassResult = {
      crossFileInfo: {
        selectorUsages: new Map(),
        componentsNeedingMarkerSidecar: new Map(),
        componentsNeedingGlobalSelectorBridge: new Map(),
        propUsageByFile: new Map(),
        stylexComponentFiles: new Map(),
        globalLeafKeys: leavesOnly ? new Set() : undefined,
      },
      consumerAnalysis: undefined,
      forwardedAsConsumers: new Map(),
      typeScriptMetadata: undefined,
    };
  }

  // Populated by the per-file transform as each file successfully converts.
  // Adapter hooks and cascade-conflict checks consult this live set so same-run
  // wrappers only assume a base accepts StyleX props after the base actually converted.
  const transformedFiles = new Set<string>();
  const transformedComponents = new Map<string, Set<string>>();
  const transformedFileSources = new Map<string, string>();

  // Seed files the caller asks us to treat as already converted (analysis-only:
  // lets cascade-conflict and wrapped-component-surface checks "see past" a manual
  // blocker so a consumer's own unsupported patterns surface instead of being
  // masked). Seeding transformedFileSources makes wrappers assume the hand-
  // converted base will expose the styling surface (className/sx).
  for (const assumedFile of options.assumeConvertedFiles ?? []) {
    const realPath = toRealPath(resolve(assumedFile));
    transformedFiles.add(realPath);
    if (!transformedComponents.has(realPath)) {
      const extracted: StyledDefBasesMap = new Map();
      let source = "";
      try {
        source = readFileSync(realPath, "utf-8");
        extractStyledDefBasesFromSource(realPath, source, extracted);
      } catch {
        // Unreadable file — seed it as converted with no known component names.
      }
      transformedComponents.set(realPath, new Set(extracted.get(realPath)?.keys() ?? []));
      transformedFileSources.set(realPath, source);
    }
  }

  const crossFilePrepassResult = {
    ...prepassResult.crossFileInfo,
    transformedFiles,
    transformedComponents,
    typeScriptMetadata: prepassResult.typeScriptMetadata,
  };

  // Resolve "auto" externalInterface → concrete function using consumer analysis
  const resolvedAdapter: Adapter = (() => {
    if (adapterInput.externalInterface === "auto" && prepassResult.consumerAnalysis) {
      const analysisMap = prepassResult.consumerAnalysis;
      const prepassResolve: Resolve = (specifier, fromFile) => {
        const resolved = sharedResolver.resolve(resolve(fromFile), specifier);
        return resolved ? toRealPath(resolved) : null;
      };
      const cachedRead = (filePath: string): string => {
        try {
          return readFileSync(filePath, "utf-8");
        } catch {
          return "";
        }
      };
      const lookupAutoExternalInterface = (filePath: string, componentName: string) =>
        analysisMap.get(`${toRealPath(filePath)}:${componentName}`);
      const styledDefinitionNamesByFile = new Map<string, Set<string>>();
      const resolveExistingSourcePath = (filePath: string): string => {
        for (const ext of ["", ".tsx", ".ts", ".jsx", ".js"]) {
          const candidate = `${filePath}${ext}`;
          if (existsSync(candidate)) {
            return candidate;
          }
        }
        return filePath;
      };
      const getStyledDefinitionNames = (filePath: string): Set<string> => {
        const realPath = toRealPath(resolveExistingSourcePath(filePath));
        const cached = styledDefinitionNamesByFile.get(realPath);
        if (cached) {
          return cached;
        }
        const extracted: StyledDefBasesMap = new Map();
        extractStyledDefBasesFromSource(realPath, cachedRead(realPath), extracted);
        const names = new Set(extracted.get(realPath)?.keys() ?? []);
        styledDefinitionNamesByFile.set(realPath, names);
        return names;
      };
      const getDefaultExportedName = (filePath: string): string | null => {
        const match = cachedRead(toRealPath(resolveExistingSourcePath(filePath))).match(
          /\bexport\s+default\s+([A-Z][A-Za-z0-9]*)\b/,
        );
        return match?.[1] ?? null;
      };

      return {
        ...adapterInput,
        externalInterface: (ctx) => {
          return (
            lookupAutoExternalInterface(ctx.filePath, ctx.componentName) ?? {
              styles: false,
              as: false,
              ref: false,
            }
          );
        },
        wrappedComponentInterface: (ctx) => {
          const explicitResult = adapterInput.wrappedComponentInterface?.(ctx);
          if (explicitResult !== undefined) {
            return explicitResult;
          }

          if (!adapterInput.useSxProp) {
            return undefined;
          }

          const resolvedImport = sharedResolver.resolve(resolve(ctx.filePath), ctx.importSource);
          if (!resolvedImport) {
            return undefined;
          }

          const resolvedPath = toRealPath(resolvedImport);
          const definitionPath =
            resolveBarrelReExport(resolvedPath, ctx.importedName, prepassResolve, cachedRead) ??
            resolvedPath;
          const definitionSourcePath = resolveExistingSourcePath(definitionPath);

          const memberPath = ctx.memberPath ?? [];
          const autoInterfaceNames =
            memberPath.length > 0
              ? [ctx.localName, memberPath[memberPath.length - 1]!]
              : ctx.importedName === "default"
                ? [ctx.localName, ctx.importedName]
                : [ctx.importedName];
          const styledDefinitionNames = getStyledDefinitionNames(definitionSourcePath);
          const rootSourceComponentNames =
            ctx.importedName === "default"
              ? [ctx.localName, getDefaultExportedName(definitionSourcePath)].filter(
                  (name): name is string => typeof name === "string",
                )
              : [ctx.importedName];
          const sourceComponentNames =
            memberPath.length > 0
              ? resolveStaticMemberComponentNames(
                  cachedRead(definitionSourcePath),
                  rootSourceComponentNames,
                  memberPath,
                )
              : rootSourceComponentNames;
          const typedComponent = findTypedComponentMetadata(
            prepassResult.typeScriptMetadata,
            definitionSourcePath,
            sourceComponentNames,
          );
          if (typedComponent?.supportsSxProp === true) {
            return {
              acceptsSx: true,
              ...(typedComponent.sxTarget ? { sxTarget: typedComponent.sxTarget } : {}),
              sxExcludedProperties: typedComponent.sxExcludedProperties,
              sxAllowedProperties: typedComponent.sxAllowedProperties,
            };
          }
          if (
            transformedComponentAcceptsSx({
              absolutePath: definitionSourcePath,
              componentNames: sourceComponentNames,
              sourceOverrides: transformedFileSources,
            })
          ) {
            return { acceptsSx: true };
          }
          if (!transformedFiles.has(toRealPath(definitionSourcePath))) {
            return undefined;
          }
          if (!sourceComponentNames.some((name) => styledDefinitionNames.has(name))) {
            return undefined;
          }
          const autoInterface = autoInterfaceNames
            .map((name) => lookupAutoExternalInterface(definitionSourcePath, name))
            .find((result) => result !== undefined);
          return autoInterface?.styles ? { acceptsSx: true } : undefined;
        },
      };
    }
    return adapterInput as Adapter;
  })();

  const adapterWithLogging: Adapter = {
    styleMerger: resolvedAdapter.styleMerger,
    themeHook: resolvedAdapter.themeHook,
    useSxProp: resolvedAdapter.useSxProp,
    usePhysicalProperties: resolvedAdapter.usePhysicalProperties,
    externalInterface(ctx) {
      return resolvedAdapter.externalInterface(ctx);
    },
    resolveValue: resolveValueWithLogging,
    resolveCall: resolveCallWithLogging,
    resolveSelector: resolveSelectorWithLogging,
    resolveBaseComponent: adapterInput.resolveBaseComponent
      ? resolveBaseComponentWithLogging
      : undefined,
    resolveThemeCall: resolvedAdapter.resolveThemeCall,
    wrappedComponentInterface: resolvedAdapter.wrappedComponentInterface,
    markerFile: resolvedAdapter.markerFile,
  };

  // Module containing the per-file transform.
  // - In published builds, `dist/index.mjs` and `dist/transform.mjs` live together.
  // - In-repo tests/dev, `src/transform.mjs` doesn't exist; use the source module fallback.
  const transformModule = (() => {
    const adjacent = join(__dirname, "transform.mjs");
    if (existsSync(adjacent)) {
      return { kind: "path", value: adjacent } as const;
    }

    if (existsSync(join(__dirname, "transform.ts"))) {
      return { kind: "source" } as const;
    }

    const distSibling = join(__dirname, "..", "dist", "transform.mjs");
    if (existsSync(distSibling)) {
      return { kind: "path", value: distSibling } as const;
    }

    return { kind: "source" } as const;
  })();

  // Map populated by the per-file transform to collect sidecar .stylex.ts files
  const sidecarFiles = new Map<string, string>();

  // Map populated by the per-file transform to collect bridge results for consumer patching
  const bridgeResults = new Map<
    string,
    import("./internal/transform-types.js").BridgeComponentResult[]
  >();

  // Map populated by the per-file transform: target file → transient prop renames for consumer patching
  const transientPropRenames = new Map<
    string,
    import("./internal/transform-types.js").TransientPropRenameResult[]
  >();

  const runnerOptions = {
    parser,
    dry: dryRun,
    print,
    adapter: adapterWithLogging,
    crossFilePrepassResult,
    sidecarFiles,
    bridgeResults,
    transformedFiles,
    transformedComponents,
    transformedFileSources,
    transientPropRenames,
    allowPartialMigration: options.allowPartialMigration ?? (leavesOnly ? true : false),
    transformMode: leavesOnly ? "leavesOnly" : (options.transformMode ?? "all"),
    globalLeafKeys: crossFilePrepassResult.globalLeafKeys,
    resolveModule: (fromFile: string, specifier: string) =>
      sharedResolver.resolve(resolve(fromFile), specifier),
    // Programmatic use passes an Adapter object (functions). That cannot be
    // serialized across process boundaries, so we must run in-band.
    runInBand: true,
    silent: options.silent ?? false,
  };

  let standaloneResult: SequentialRunResult | undefined;
  let standaloneWarnings: CollectedWarning[] | undefined;
  if (options.collectStandaloneFileResults === true) {
    standaloneResult = await runTransformSequentially(transformModule, filePaths, {
      ...runnerOptions,
      dry: true,
      print: false,
      sidecarFiles: new Map(),
      bridgeResults: new Map(),
      transformedFiles: new Set(),
      transformedComponents: new Map(),
      transformedFileSources: new Map(),
      transientPropRenames: new Map(),
      crossFilePrepassResult: {
        ...crossFilePrepassResult,
        transformedFiles: new Set(),
        transformedComponents: new Map(),
      },
      silent: true,
      isolateFiles: true,
      createIsolatedOptions(filePath) {
        const isolatedTransformedFiles = new Set<string>();
        const isolatedTransformedComponents = new Map<string, Set<string>>();
        return {
          ...runnerOptions,
          dry: true,
          print: false,
          sidecarFiles: new Map(),
          bridgeResults: new Map(),
          transformedFiles: isolatedTransformedFiles,
          transformedComponents: isolatedTransformedComponents,
          transformedFileSources: new Map(),
          transientPropRenames: new Map(),
          crossFilePrepassResult: createStandalonePrepassResult(
            crossFilePrepassResult,
            filePath,
            isolatedTransformedFiles,
            isolatedTransformedComponents,
          ),
          silent: true,
          isolateFiles: true,
        };
      },
    });
    standaloneWarnings = Logger.createReport().getWarnings();
    Logger._clearCollected();
    Logger.setFileCount(filePaths.length);
  }

  // Worker.js processes a chunk with async.each even when jscodeshift runs in-band.
  // Several transform decisions read the live transformedFiles set, so call the
  // transform directly in dependency order instead of re-entering Runner per file.
  const result = await runTransformSequentially(transformModule, filePaths, runnerOptions);

  // Write sidecar .stylex.ts files (defineMarker declarations)
  // Merge with existing content to avoid clobbering user-owned exports (e.g. defineVars).
  if (sidecarFiles.size > 0 && !dryRun) {
    for (const [sidecarPath, content] of sidecarFiles) {
      const merged = mergeSidecarContent(sidecarPath, content);
      await writeFile(sidecarPath, merged, "utf-8");
    }
  }

  // Patch unconverted consumer files that reference bridge components via CSS selectors
  if (bridgeResults.size > 0 && !dryRun) {
    const { buildConsumerReplacements, patchConsumerFile } =
      await import("./internal/bridge-consumer-patcher.js");
    const consumerReplacements = buildConsumerReplacements(
      crossFilePrepassResult.selectorUsages,
      bridgeResults,
      transformedFiles,
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

  // Patch unconverted consumers: as → forwardedAs on styled() wrappers of converted components
  if (prepassResult.forwardedAsConsumers.size > 0 && !dryRun) {
    const { buildForwardedAsReplacements, patchConsumerForwardedAs } =
      await import("./internal/forwarded-as-consumer-patcher.js");
    const forwardedAsReplacements = buildForwardedAsReplacements(
      prepassResult.forwardedAsConsumers,
      transformedFiles,
    );
    const patchedFiles: string[] = [];
    for (const [consumerPath, entries] of forwardedAsReplacements) {
      const patched = patchConsumerForwardedAs(consumerPath, entries);
      if (patched !== null) {
        await writeFile(consumerPath, patched, "utf-8");
        patchedFiles.push(consumerPath);
      }
    }
    if (formatterCommands && patchedFiles.length > 0) {
      await runFormatters(formatterCommands, patchedFiles);
    }
  }

  // Patch unconverted consumers: rename $-prefixed props on components whose props were renamed
  if (transientPropRenames.size > 0 && !dryRun) {
    const { collectTransientPropPatches } =
      await import("./internal/transient-prop-consumer-patcher.js");
    const patches = collectTransientPropPatches({
      transientPropRenames,
      consumerFilePaths: consumerFilePaths.map((p) => resolve(p)),
      resolver: sharedResolver,
    });
    const patchedFiles: string[] = [];
    for (const { consumerPath, patched } of patches) {
      await writeFile(consumerPath, patched, "utf-8");
      patchedFiles.push(consumerPath);
    }
    if (formatterCommands && patchedFiles.length > 0) {
      await runFormatters(formatterCommands, patchedFiles);
    }
  }

  // Run formatter commands if specified and files were transformed (not in dry run mode)
  if (formatterCommands && formatterCommands.length > 0 && result.ok > 0 && !dryRun) {
    await runFormatters(formatterCommands, filePaths);
  }

  const report = Logger.createReport();
  if (!(options.silent ?? false)) {
    report.print();
  }

  return {
    errors: result.error,
    unchanged: result.nochange,
    skipped: result.skip,
    transformed: result.ok,
    timeElapsed: parseFloat(result.timeElapsed) || 0,
    warnings: report.getWarnings(),
    fileResults: result.files,
    standaloneFileResults: standaloneResult?.files,
    standaloneWarnings,
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

function formatElapsedSeconds(startedAt: number): string {
  return ((performance.now() - startedAt) / 1000).toFixed(1);
}

function findTypedComponentMetadata(
  metadata: TypeScriptPrepassMetadata | undefined,
  filePath: string,
  componentNames: readonly string[],
): TypeScriptComponentMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  const names = new Set(componentNames);
  const resolvedFilePath = toRealPath(filePath);
  return metadata.files
    .find((file) => file.filePath === resolvedFilePath)
    ?.components.find((component) => names.has(component.name));
}

/**
 * Merge new sidecar marker content into an existing .stylex.ts file, preserving
 * user-owned exports (e.g. defineVars). If the file doesn't exist, returns content as-is.
 */
export function mergeSidecarContent(sidecarPath: string, newContent: string): string {
  let existing: string;
  try {
    existing = readFileSync(sidecarPath, "utf-8");
  } catch {
    // File doesn't exist yet — use new content as-is
    return newContent;
  }
  return mergeMarkerDeclarations(existing, newContent);
}

function orderFilesByLocalImportDependencies(
  filePaths: readonly string[],
  resolver: {
    resolve(fromFile: string, specifier: string): string | undefined;
  },
  normalizeFilePath: (filePath: string) => string,
): string[] {
  const filePathByNormalized = new Map<string, string>();
  for (const filePath of filePaths) {
    filePathByNormalized.set(normalizeFilePath(filePath), filePath);
  }

  const dependenciesByFile = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const dependencies: string[] = [];
    const source = readFileForOrdering(filePath);
    MODULE_SPECIFIER_RE.lastIndex = 0;
    for (const match of source.matchAll(MODULE_SPECIFIER_RE)) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }
      const resolved = resolver.resolve(resolve(filePath), specifier);
      if (!resolved) {
        continue;
      }
      const dependency = filePathByNormalized.get(normalizeFilePath(resolved));
      if (dependency && dependency !== filePath && !dependencies.includes(dependency)) {
        dependencies.push(dependency);
      }
    }
    dependenciesByFile.set(filePath, dependencies);
  }

  const ordered: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (filePath: string): void => {
    if (visited.has(filePath)) {
      return;
    }
    if (visiting.has(filePath)) {
      return;
    }
    visiting.add(filePath);
    for (const dependency of dependenciesByFile.get(filePath) ?? []) {
      visit(dependency);
    }
    visiting.delete(filePath);
    visited.add(filePath);
    ordered.push(filePath);
  };

  for (const filePath of filePaths) {
    visit(filePath);
  }
  return ordered;
}

const MODULE_SPECIFIER_RE = /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;

function readFileForOrdering(filePath: string): string {
  try {
    return readFileSync(resolve(filePath), "utf-8");
  } catch {
    return "";
  }
}

type TransformModuleSpecifier =
  | {
      kind: "path";
      value: string;
    }
  | {
      kind: "source";
    };

type TransformFunction = (
  file: FileInfo,
  api: API,
  options: import("./internal/transform-types.js").TransformOptions,
) => string | null | Promise<string | null>;

type CrossFilePrepassResult = CrossFileInfo & {
  transformedFiles?: Set<string>;
  transformedComponents?: Map<string, Set<string>>;
  typeScriptMetadata?: TypeScriptPrepassMetadata;
};

type SequentialRunOptions = import("./internal/transform-types.js").TransformOptions & {
  parser: NonNullable<RunTransformOptions["parser"]>;
  dry: boolean;
  print: boolean;
  silent: boolean;
  transformedFiles: Set<string>;
  transformedComponents: Map<string, Set<string>>;
  transformedFileSources: Map<string, string>;
  crossFilePrepassResult?: CrossFilePrepassResult;
  isolateFiles?: boolean;
  createIsolatedOptions?: (filePath: string) => SequentialRunOptions;
};

type SequentialRunResult = {
  error: number;
  nochange: number;
  skip: number;
  ok: number;
  timeElapsed: string;
  files: TransformFileResult[];
};

export type TransformFileResult = {
  filePath: string;
  status: "error" | "skipped" | "unchanged" | "transformed";
};

function createStandalonePrepassResult(
  prepass: CrossFilePrepassResult,
  filePath: string,
  transformedFiles: Set<string>,
  transformedComponents: Map<string, Set<string>>,
): CrossFilePrepassResult {
  const standaloneFile = toRealPath(resolve(filePath));
  const selectorUsages = new Map<string, CrossFileSelectorUsage[]>();
  const componentsNeedingMarkerSidecar = new Map<string, Set<string>>();
  const componentsNeedingGlobalSelectorBridge = new Map<string, Set<string>>();

  for (const [consumerPath, usages] of prepass.selectorUsages) {
    const consumerIsTransformed = toRealPath(consumerPath) === standaloneFile;
    const isolatedUsages = usages.map((usage) => ({
      ...usage,
      consumerIsTransformed,
    }));
    selectorUsages.set(consumerPath, isolatedUsages);

    for (const usage of isolatedUsages) {
      if (usage.bridgeComponentName) {
        continue;
      }
      if (consumerIsTransformed) {
        addSetMapEntry(componentsNeedingMarkerSidecar, usage.resolvedPath, usage.importedName);
      }
      addSetMapEntry(componentsNeedingGlobalSelectorBridge, usage.resolvedPath, usage.importedName);
    }
  }

  return {
    ...prepass,
    selectorUsages,
    componentsNeedingMarkerSidecar,
    componentsNeedingGlobalSelectorBridge,
    globalLeafKeys: getStandaloneGlobalLeafKeys(prepass.globalLeafKeys, standaloneFile),
    transformedFiles,
    transformedComponents,
  };
}

function getStandaloneGlobalLeafKeys(
  globalLeafKeys: Set<string> | undefined,
  standaloneFile: string,
): Set<string> | undefined {
  if (!globalLeafKeys) {
    return undefined;
  }

  const filePrefix = `${standaloneFile}:`;
  return new Set([...globalLeafKeys].filter((key) => key.startsWith(filePrefix)));
}

function addSetMapEntry(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key);
  if (values) {
    values.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

async function runTransformSequentially(
  transformModule: TransformModuleSpecifier,
  filePaths: readonly string[],
  options: SequentialRunOptions,
): Promise<SequentialRunResult> {
  const transform = await loadTransformFunction(transformModule);
  const aggregate: SequentialRunResult = {
    error: 0,
    nochange: 0,
    skip: 0,
    ok: 0,
    timeElapsed: "0",
    files: [],
  };
  const startedAt = performance.now();
  const createApi = (): API => {
    const j = jscodeshift.withParser(options.parser);
    return {
      j,
      jscodeshift: j,
      stats: () => {},
      report: (msg) => {
        if (!options.silent) {
          process.stdout.write(`${msg}\n`);
        }
      },
    };
  };
  const sharedApi = createApi();

  for (const filePath of filePaths) {
    const fileOptions = options.createIsolatedOptions?.(filePath) ?? options;
    const api = fileOptions.isolateFiles === true ? createApi() : sharedApi;
    if (options.isolateFiles === true) {
      fileOptions.transformedFiles.clear();
      fileOptions.transformedComponents.clear();
      fileOptions.transformedFileSources.clear();
      fileOptions.crossFilePrepassResult?.transformedFiles?.clear();
      fileOptions.crossFilePrepassResult?.transformedComponents?.clear();
    }

    let source: string;
    try {
      source = await readFile(filePath, "utf-8");
    } catch (err) {
      Logger.logError(`File error: ${err instanceof Error ? err.message : String(err)}`, filePath);
      aggregate.error += 1;
      aggregate.files.push({ filePath, status: "error" });
      continue;
    }

    try {
      const output = await transform({ path: filePath, source }, api, fileOptions);
      if (output !== null) {
        fileOptions.transformedFileSources.set(toRealPath(filePath), output);
      }
      if (output === null) {
        aggregate.skip += 1;
        aggregate.files.push({ filePath, status: "skipped" });
        continue;
      }
      if (output === source) {
        aggregate.nochange += 1;
        aggregate.files.push({ filePath, status: "unchanged" });
        continue;
      }
      if (fileOptions.print) {
        process.stdout.write(`${output}\n`);
      }
      if (!fileOptions.dry) {
        await writeFile(filePath, output, "utf-8");
      }
      aggregate.ok += 1;
      aggregate.files.push({ filePath, status: "transformed" });
    } catch (err) {
      if (!Logger.isErrorLogged(err)) {
        Logger.logError(
          `Transformation error: ${err instanceof Error ? err.message : String(err)}`,
          filePath,
        );
      }
      aggregate.error += 1;
      aggregate.files.push({ filePath, status: "error" });
    }
  }

  aggregate.timeElapsed = ((performance.now() - startedAt) / 1000).toFixed(3);
  return aggregate;
}

async function loadTransformFunction(
  transformModule: TransformModuleSpecifier,
): Promise<TransformFunction> {
  const mod =
    transformModule.kind === "path"
      ? await import(pathToFileURL(transformModule.value).href)
      : await import("./transform.js");

  if (isTransformModule(mod)) {
    return mod.default;
  }

  throw new Error("Could not load transform module: default export is not a function.");
}

function isTransformModule(value: unknown): value is { default: TransformFunction } {
  return (
    typeof value === "object" &&
    value !== null &&
    "default" in value &&
    typeof (value as { default?: unknown }).default === "function"
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
