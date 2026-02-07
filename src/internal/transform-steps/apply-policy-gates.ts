/**
 * Step: apply policy-based skip gates and warnings.
 * Core concepts: createGlobalStyle handling.
 */
import { collectCreateGlobalStyleWarnings, shouldSkipForCreateGlobalStyle } from "../policy.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";

/**
 * Applies skip policies and emits warnings for unsupported styled-components features.
 */
export function applyPolicyGates(ctx: TransformContext): StepResult {
  const { j, styledImports, warnings } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // Policy: createGlobalStyle is unsupported in StyleX; emit a warning when imported.
  warnings.push(...collectCreateGlobalStyleWarnings(styledImports));

  if (shouldSkipForCreateGlobalStyle({ styledImports, j })) {
    return returnResult({ code: null, warnings }, "skip");
  }

  return CONTINUE;
}
