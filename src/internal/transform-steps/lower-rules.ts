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
  ctx.relationOverrides = lowered.relationOverrides;
  ctx.ancestorSelectorParents = lowered.ancestorSelectorParents;
  ctx.crossFileMarkers = lowered.crossFileMarkers;
  ctx.siblingMarkerKeys = lowered.siblingMarkerKeys;
  ctx.parentsNeedingDefaultMarker = lowered.parentsNeedingDefaultMarker;
  ctx.ancestorAttrsByStyleKey = lowered.ancestorAttrsByStyleKey;

  if (lowered.bail || ctx.resolveValueBailRef.value) {
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // Nothing lowered successfully — every declaration hit a per-decl bail. Skip the
  // file entirely rather than emitting a no-op stylex import alongside untouched
  // styled-components source.
  if (ctx.styledDecls && ctx.styledDecls.length > 0) {
    const anyTransformable = ctx.styledDecls.some((d) => !d.skipTransform);
    if (!anyTransformable) {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
    // `css\`\`` helpers are extracted (and their source declarations removed) by
    // extractCssHelpersStep before lowering runs. If we then can't lower the helper,
    // we have no way to restore its source — any consumer that references it would
    // dangle. Bail the whole file so the original stays intact.
    const skippedHelper = ctx.styledDecls.find((d) => d.skipTransform && d.isCssHelper);
    if (skippedHelper) {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
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
