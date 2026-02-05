/**
 * Step: lower CSS rules into StyleX-ready objects.
 * Core concepts: rule lowering, adapter resolution, and bailout handling.
 */
import { lowerRules } from "../lower-rules.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { removeInlinedCssHelperFunctions } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * Lowers CSS rules into resolvable style objects and resolves dynamic values via the adapter.
 */
export function lowerRulesStep(ctx: TransformContext): StepResult {
  if (!ctx.styledDecls) {
    return CONTINUE;
  }

  const lowered = lowerRules(ctx);

  ctx.resolvedStyleObjects = lowered.resolvedStyleObjects;
  ctx.descendantOverrides = lowered.descendantOverrides;
  ctx.ancestorSelectorParents = lowered.ancestorSelectorParents;

  if (lowered.bail || ctx.resolveValueBailRef.value) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Now that we know the file is transformable, remove any css helper functions that were inlined.
  if (
    removeInlinedCssHelperFunctions({
      root: ctx.root,
      j: ctx.j,
      cssLocal: ctx.cssLocal,
      names: lowered.usedCssHelperFunctions,
    })
  ) {
    ctx.markChanged();
  }

  return CONTINUE;
}
