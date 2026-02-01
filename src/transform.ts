import type { API, FileInfo, Options } from "jscodeshift";

import { Logger } from "./internal/logger.js";
import { TransformContext } from "./internal/transform-context.js";
import type { TransformOptions, TransformResult } from "./internal/transform-types.js";
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
import type { TransformStep } from "./internal/transform-types.js";

export type { TransformOptions, TransformResult } from "./internal/transform-types.js";

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
    return result.code;
  } catch (e) {
    const msg = `Transform failed: ${e instanceof Error ? e.message : String(e)}`;
    Logger.logError(msg, file.path);
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
  const ctx = new TransformContext(file, api, options);
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
