/**
 * Lowers styled-component CSS rules into StyleX-compatible style objects.
 * Core concepts: stateful rule processing, variant extraction, and safe bailouts.
 */
import type { TransformContext } from "./transform-context.js";
import type { RelationOverride } from "./lower-rules/state.js";
import { createLowerRulesState } from "./lower-rules/state.js";
import { createDeclProcessingState } from "./lower-rules/decl-setup.js";
import { preScanCssHelperPlaceholders } from "./lower-rules/pre-scan.js";
import { processDeclRules } from "./lower-rules/process-rules.js";
import { finalizeDeclProcessing } from "./lower-rules/finalize-decl.js";
import { postProcessAfterBaseMixins } from "./lower-rules/after-base-mixins.js";
import { finalizeRelationOverrides } from "./lower-rules/relation-overrides.js";
import { makeCssPropKey } from "./lower-rules/shared.js";
import { extractInlineKeyframes } from "./keyframes.js";

export type { RelationOverride } from "./lower-rules/state.js";

export function lowerRules(ctx: TransformContext): {
  resolvedStyleObjects: Map<string, unknown>;
  relationOverrides: RelationOverride[];
  ancestorSelectorParents: Set<string>;
  usedCssHelperFunctions: Set<string>;
  bail: boolean;
} {
  const state = createLowerRulesState(ctx);

  // Pre-scan all declarations for inline @keyframes definitions.
  // These must be registered before rule processing so animation properties
  // can reference them.
  for (const decl of state.styledDecls) {
    const inlineKfs = extractInlineKeyframes(decl.rules);
    for (const [name, frames] of inlineKfs) {
      state.keyframesNames.add(name);
      if (!ctx.inlineKeyframes) {
        ctx.inlineKeyframes = new Map();
      }
      ctx.inlineKeyframes.set(name, frames);
    }
  }

  for (const decl of state.styledDecls) {
    if (state.bail) {
      break;
    }
    if (decl.preResolvedStyle) {
      state.resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          state.resolvedStyleObjects.set(k, v);
        }
      }
      continue;
    }

    const declState = createDeclProcessingState(state, decl);
    if (!preScanCssHelperPlaceholders(declState)) {
      break;
    }

    processDeclRules(declState);
    if (state.bail) {
      break;
    }

    finalizeDeclProcessing(declState);
    if (state.bail) {
      break;
    }
  }

  if (!state.bail) {
    postProcessAfterBaseMixins(state);
  }

  if (!state.bail) {
    // Generate style objects from descendant override pseudo buckets
    finalizeRelationOverrides({
      j: state.j,
      relationOverridePseudoBuckets: state.relationOverridePseudoBuckets,
      relationOverrides: state.relationOverrides,
      resolvedStyleObjects: state.resolvedStyleObjects,
      makeCssPropKey,
      childPseudoMarkers: state.childPseudoMarkers,
    });
  }

  return {
    resolvedStyleObjects: state.resolvedStyleObjects,
    relationOverrides: state.relationOverrides,
    ancestorSelectorParents: state.ancestorSelectorParents,
    usedCssHelperFunctions: state.usedCssHelperFunctions,
    bail: state.bail,
  };
}
