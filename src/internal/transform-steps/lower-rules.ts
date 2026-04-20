/**
 * Step: lower CSS rules into StyleX-ready objects.
 * Core concepts: rule lowering, adapter resolution, and bailout handling.
 */
import { lowerRules } from "../lower-rules.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import { removeInlinedCssHelperFunctions } from "../transform/css-helpers.js";
import { TransformContext } from "../transform-context.js";

/**
 * True when any identifier inside the skipped decl's template references a css helper
 * that was extracted (and its source declaration removed) earlier in the pipeline.
 * Checks the raw template expression AST plus any resolved references the lowering
 * process captured before bailing.
 */
function skippedDeclReferencesHelper(
  decl: { templateExpressions?: unknown[]; extraStyleKeys?: string[] },
  helperLocalNames: Set<string>,
): boolean {
  for (const expr of decl.templateExpressions ?? []) {
    if (expressionReferencesAny(expr, helperLocalNames)) {
      return true;
    }
  }
  return false;
}

function expressionReferencesAny(node: unknown, names: Set<string>): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; name?: string };
  if (n.type === "Identifier" && typeof n.name === "string" && names.has(n.name)) {
    return true;
  }
  for (const key of Object.keys(n)) {
    if (
      key === "loc" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    const child = (n as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const c of child) {
        if (expressionReferencesAny(c, names)) {
          return true;
        }
      }
    } else if (child && typeof child === "object") {
      if (expressionReferencesAny(child, names)) {
        return true;
      }
    }
  }
  return false;
}

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

  // Partial migration is opt-in. When disabled, any per-decl bail escalates to a
  // whole-file bail so the output matches the stricter pre-flag behavior.
  const allowPartialMigration = ctx.options.allowPartialMigration ?? false;
  if (ctx.styledDecls && ctx.styledDecls.length > 0) {
    const anyTransformable = ctx.styledDecls.some((d) => !d.skipTransform);
    if (!anyTransformable) {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
    if (!allowPartialMigration && ctx.styledDecls.some((d) => d.skipTransform)) {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
    // `css\`\`` helpers are extracted (and their source declarations removed) by
    // extractCssHelpersStep before lowering runs. Two unsafe partial-mode cases:
    //   1) A helper itself failed to lower — its source is already gone, so any
    //      consumer would dangle.
    //   2) A non-helper decl is skipped but its preserved template still
    //      interpolates a helper (`${helper}`) — the helper's source was extracted,
    //      so the surviving identifier is undefined.
    // Either case must bail the whole file so the original stays intact.
    const helperLocalNames = new Set<string>();
    for (const d of ctx.styledDecls) {
      if (d.isCssHelper) {
        helperLocalNames.add(d.localName);
      }
    }
    const unsafeSkip = ctx.styledDecls.find(
      (d) => d.skipTransform && (d.isCssHelper || skippedDeclReferencesHelper(d, helperLocalNames)),
    );
    if (unsafeSkip) {
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
