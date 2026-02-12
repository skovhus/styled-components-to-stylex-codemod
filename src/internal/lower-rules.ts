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

export type { RelationOverride } from "./lower-rules/state.js";

export function lowerRules(ctx: TransformContext): {
  resolvedStyleObjects: Map<string, unknown>;
  relationOverrides: RelationOverride[];
  ancestorSelectorParents: Set<string>;
  namedAncestorMarkersByStyleKey: Map<string, string>;
  namedAncestorMarkersByComponentName: Map<string, string>;
  markerTodos: Array<{ componentName: string; markerName: string }>;
  usedCssHelperFunctions: Set<string>;
  bail: boolean;
} {
  const state = createLowerRulesState(ctx);

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
    // Generate style objects from relation override buckets
    finalizeRelationOverrides({
      j: state.j,
      relationOverrideBuckets: state.relationOverrideBuckets,
      relationOverrideMarkersByKey: state.relationOverrideMarkersByKey,
      relationOverrides: state.relationOverrides,
      resolvedStyleObjects: state.resolvedStyleObjects,
      makeCssPropKey,
    });
  }

  return {
    resolvedStyleObjects: state.resolvedStyleObjects,
    relationOverrides: state.relationOverrides,
    ancestorSelectorParents: state.ancestorSelectorParents,
    namedAncestorMarkersByStyleKey: state.namedAncestorMarkersByStyleKey,
    namedAncestorMarkersByComponentName: state.namedAncestorMarkersByComponentName,
    markerTodos: state.markerTodos,
    usedCssHelperFunctions: state.usedCssHelperFunctions,
    bail: state.bail,
  };
}
