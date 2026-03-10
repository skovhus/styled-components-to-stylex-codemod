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
import { cssKeyframeNameToIdentifier, extractInlineKeyframes } from "./keyframes.js";

export type { RelationOverride } from "./lower-rules/state.js";

export function lowerRules(ctx: TransformContext): {
  resolvedStyleObjects: Map<string, unknown>;
  relationOverrides: RelationOverride[];
  ancestorSelectorParents: Set<string>;
  usedCssHelperFunctions: Set<string>;
  crossFileMarkers: Map<string, string>;
  bail: boolean;
} {
  const state = createLowerRulesState(ctx);

  // Pre-scan all declarations for inline @keyframes definitions.
  // These must be registered before rule processing so animation properties
  // can reference them.
  const reservedNames = new Set(state.styledDecls.map((d) => d.localName));
  for (const decl of state.styledDecls) {
    const inlineKfs = extractInlineKeyframes(decl.rules);
    for (const [cssName, frames] of inlineKfs) {
      let jsName = cssKeyframeNameToIdentifier(cssName);
      while (reservedNames.has(jsName)) {
        jsName = `${jsName}Animation`;
      }
      reservedNames.add(jsName);
      state.keyframesNames.add(cssName);
      if (!ctx.inlineKeyframes) {
        ctx.inlineKeyframes = new Map();
      }
      ctx.inlineKeyframes.set(jsName, frames);
      if (!ctx.inlineKeyframeNameMap) {
        ctx.inlineKeyframeNameMap = new Map();
      }
      ctx.inlineKeyframeNameMap.set(cssName, jsName);
    }
  }
  state.inlineKeyframeNameMap = ctx.inlineKeyframeNameMap;

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

  // Determine which parent style keys actually need markers (defaultMarker or
  // defineMarker). A marker is only needed when an override has pseudo conditions
  // (e.g., `&:hover ${Child}`) that emit `stylex.when.ancestor()`. Overrides
  // without pseudos (e.g., `& ${Child}`) are unconditional and need no marker.
  const parentsNeedingMarker = new Set<string>();
  const overrideByKey = new Map(state.relationOverrides.map((o) => [o.overrideStyleKey, o]));
  for (const [overrideKey, pseudoBuckets] of state.relationOverridePseudoBuckets) {
    const hasPseudo = [...pseudoBuckets.keys()].some((key) => key !== null);
    if (hasPseudo) {
      const override = overrideByKey.get(overrideKey);
      if (override) {
        parentsNeedingMarker.add(override.parentStyleKey);
      }
    }
  }

  // Derive cross-file markers from relation overrides (single source of truth).
  // Only include markers for parents that actually need them.
  const crossFileMarkers = new Map<string, string>();
  for (const o of state.relationOverrides) {
    if (o.crossFile && o.markerVarName && parentsNeedingMarker.has(o.parentStyleKey)) {
      crossFileMarkers.set(o.parentStyleKey, o.markerVarName);
    }
  }

  // Filter ancestorSelectorParents to only parents needing markers.
  // Parents without pseudo conditions don't need markers — their override
  // styles are applied unconditionally via JSX rewriting.
  // Exception: sibling marker parents always need markers because
  // stylex.when.siblingBefore() references them at runtime.
  const filteredAncestorParents = new Set<string>();
  for (const key of state.ancestorSelectorParents) {
    if (parentsNeedingMarker.has(key) || state.siblingMarkerParents.has(key)) {
      filteredAncestorParents.add(key);
    }
  }

  return {
    resolvedStyleObjects: state.resolvedStyleObjects,
    relationOverrides: state.relationOverrides,
    ancestorSelectorParents: filteredAncestorParents,
    usedCssHelperFunctions: state.usedCssHelperFunctions,
    crossFileMarkers,
    bail: state.bail,
  };
}
