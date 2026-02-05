/**
 * Step: ensure React import when JSX requires it.
 * Core concepts: React binding insertion and change tracking.
 */
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { ensureReactBinding } from "../utilities/ensure-react-binding.js";

/**
 * Adds a React import when React is referenced but missing.
 */
export function ensureReactImportStep(ctx: TransformContext): StepResult {
  const { root, j } = ctx;

  if (ctx.needsReactImport) {
    ensureReactBinding({ root, j });
    ctx.markChanged();
  }

  return CONTINUE;
}
