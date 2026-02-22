/**
 * Main jscodeshift transform pipeline for styled-components to StyleX.
 * Core concepts: ordered transform steps, context orchestration, and logging.
 */
import type { API, FileInfo, Options } from "jscodeshift";
import { basename, dirname, join, resolve as pathResolve } from "node:path";

import { Logger } from "./internal/logger.js";
import { TransformContext } from "./internal/transform-context.js";
import type {
  CrossFileInfo,
  CrossFileSelectorUsage,
  TransformOptions,
  TransformResult,
  TransformStep,
} from "./internal/transform-types.js";
import { analyzeAfterEmitStep } from "./internal/transform-steps/analyze-after-emit.js";
import { analyzeBeforeEmitStep } from "./internal/transform-steps/analyze-before-emit.js";
import { applyPolicyGates } from "./internal/transform-steps/apply-policy-gates.js";
import { buildImportMapStep } from "./internal/transform-steps/build-import-map.js";
import { cleanupCssImportStep } from "./internal/transform-steps/cleanup-css-import.js";
import { collectStaticPropsStep } from "./internal/transform-steps/collect-static-props.js";
import { collectStyledDeclsStep } from "./internal/transform-steps/collect-styled-decls.js";
import { convertKeyframesStep } from "./internal/transform-steps/convert-keyframes.js";
import { detectStringMappingFnsStep } from "./internal/transform-steps/detect-string-mapping-fns.js";
import { detectUnsupportedPatternsStep } from "./internal/transform-steps/detect-unsupported-patterns.js";
import { rewriteCssHelpersStep } from "./internal/transform-steps/rewrite-css-helpers.js";
import { emitStylesStep } from "./internal/transform-steps/emit-styles.js";
import { emitBridgeExportsStep } from "./internal/transform-steps/emit-bridge-exports.js";
import { emitWrappersStep } from "./internal/transform-steps/emit-wrappers.js";
import { ensureMergerImportStep } from "./internal/transform-steps/ensure-merger-import.js";
import { ensureReactImportStep } from "./internal/transform-steps/ensure-react-import.js";
import { extractCssHelpersStep } from "./internal/transform-steps/extract-css-helpers.js";
import { finalize } from "./internal/transform-steps/finalize.js";
import { lowerRulesStep } from "./internal/transform-steps/lower-rules.js";
import { postProcessStep } from "./internal/transform-steps/post-process.js";
import { preflight } from "./internal/transform-steps/preflight.js";
import { reinsertStaticPropsStep } from "./internal/transform-steps/reinsert-static-props.js";
import { rewriteJsxStep } from "./internal/transform-steps/rewrite-jsx.js";
import { upgradePolymorphicAsPropTypesStep } from "./internal/transform-steps/upgrade-polymorphic-as-prop-types.js";

export type {
  BridgeComponentResult,
  TransformOptions,
  TransformResult,
} from "./internal/transform-types.js";

/**
 * Transform styled-components to StyleX
 *
 * This is a sample transform that serves as a starting point.
 * You'll need to implement the actual transformation logic based on your needs.
 */
export default function transform(file: FileInfo, api: API, options: Options): string | null {
  try {
    const result = transformWithWarnings(file, api, options as TransformOptions);
    Logger.logWarnings(result.warnings, file.path);

    // Store sidecar .stylex.ts content in the options side-channel for the runner to write
    if (result.sidecarContent) {
      const sidecarFiles = (options as Record<string, unknown>).sidecarFiles as
        | Map<string, string>
        | undefined;
      if (sidecarFiles) {
        const dir = dirname(file.path);
        const fileBase = basename(file.path).replace(/\.\w+$/, "");
        sidecarFiles.set(join(dir, `${fileBase}.stylex.ts`), result.sidecarContent);
      }
    }

    // Store bridge results in the options side-channel for post-transform consumer patching
    if (result.bridgeResults && result.bridgeResults.length > 0) {
      const bridgeResultsMap = (options as Record<string, unknown>).bridgeResults as
        | Map<string, import("./internal/transform-types.js").BridgeComponentResult[]>
        | undefined;
      if (bridgeResultsMap) {
        bridgeResultsMap.set(pathResolve(file.path), result.bridgeResults);
      }
    }

    return result.code;
  } catch (e) {
    if (!Logger.isErrorLogged(e)) {
      const msg = `Transform failed: ${e instanceof Error ? e.message : String(e)}`;
      Logger.logError(msg, file.path);
    }
    throw e;
  }
}

/**
 * Transform with detailed warnings returned (for testing)
 */
export function transformWithWarnings(
  file: FileInfo,
  api: API,
  options: TransformOptions,
): TransformResult {
  // Extract per-file cross-file info from the global prepass result
  const enrichedOptions = extractCrossFileInfoForFile(file.path, options);
  const ctx = new TransformContext(file, api, enrichedOptions);
  const pipeline: TransformStep[] = [
    preflight,
    applyPolicyGates,
    convertKeyframesStep,
    buildImportMapStep,
    extractCssHelpersStep,
    detectStringMappingFnsStep,
    detectUnsupportedPatternsStep,
    collectStyledDeclsStep,
    lowerRulesStep,
    analyzeBeforeEmitStep,
    rewriteCssHelpersStep,
    emitStylesStep,
    analyzeAfterEmitStep,
    collectStaticPropsStep,
    rewriteJsxStep,
    emitWrappersStep,
    emitBridgeExportsStep,
    upgradePolymorphicAsPropTypesStep,
    ensureMergerImportStep,
    reinsertStaticPropsStep,
    postProcessStep,
    cleanupCssImportStep,
    ensureReactImportStep,
  ];

  for (const step of pipeline) {
    const outcome = step(ctx);
    if (outcome.kind === "return") {
      return outcome.result;
    }
  }

  return finalize(ctx);
}

// --- Non-exported helpers ---

/**
 * Shape of the global prepass result attached to jscodeshift options by runTransform.
 * This is an untyped passthrough from jscodeshift's options bag, so we define
 * the expected shape here to avoid scattered inline type assertions.
 */
interface GlobalPrepassResult {
  selectorUsages: Map<string, CrossFileSelectorUsage[]>;
  componentsNeedingGlobalSelectorBridge: Map<string, Set<string>>;
}

/**
 * Extract per-file cross-file info from the global prepass result stored in jscodeshift options.
 * The prepass result (if any) is passed via `options.crossFilePrepassResult` from runTransform.
 */
function extractCrossFileInfoForFile(
  filePath: string,
  options: TransformOptions,
): TransformOptions {
  // jscodeshift passes arbitrary options through; we access the prepass result
  // that runTransform attached. This is the one place we need an assertion
  // because jscodeshift's Options type doesn't know about our custom field.
  const prepass = (options as Record<string, unknown>).crossFilePrepassResult as
    | GlobalPrepassResult
    | undefined;

  if (!prepass) {
    return options;
  }

  const absPath = pathResolve(filePath);
  const selectorUsages = prepass.selectorUsages.get(absPath);
  const bridgeComponentNames = prepass.componentsNeedingGlobalSelectorBridge?.get(absPath);

  if ((!selectorUsages || selectorUsages.length === 0) && !bridgeComponentNames) {
    return options;
  }

  const crossFileInfo: CrossFileInfo = {
    selectorUsages: selectorUsages ?? [],
    bridgeComponentNames,
  };

  return { ...options, crossFileInfo };
}
