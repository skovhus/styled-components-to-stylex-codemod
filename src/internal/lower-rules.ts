/**
 * Lowers styled-component CSS rules into StyleX-compatible style objects.
 * Core concepts: stateful rule processing, variant extraction, and safe bailouts.
 */
import type { TransformContext } from "./transform-context.js";
import type { StyledDecl } from "./transform-types.js";
import type { LowerRulesState, RelationOverride } from "./lower-rules/state.js";
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
  siblingMarkerKeys: Set<string>;
  parentsNeedingDefaultMarker: Set<string>;
  /** Maps style key → set of CSS attribute selector strings used in ancestor attribute conditions */
  ancestorAttrsByStyleKey: Map<string, Set<string>>;
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

    const snapshot = snapshotStateForDecl(state);
    state.currentDecl = decl;
    const outcome = processOneDecl(state, decl);
    state.currentDecl = null;

    if (outcome === "skip") {
      restoreStateSnapshot(state, snapshot);
      continue;
    }
    if (outcome === "bail") {
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

  // Final cleanup: any decl that became skipped after its per-decl rollback window
  // (e.g. during postProcessAfterBaseMixins or finalizeRelationOverrides) still has
  // its styleKeys in the shared maps — prune them so emission never emits entries
  // for skipped decls.
  if (!state.bail) {
    pruneSkippedDeclsFromState(state);
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

  // Derive markers from relation overrides and sibling selectors.
  // Cross-file overrides use markers for parents that need them;
  // sibling selectors use per-component markers for scoped matching.
  const crossFileMarkers = new Map<string, string>();
  for (const o of state.relationOverrides) {
    if (o.crossFile && o.markerVarName && parentsNeedingMarker.has(o.parentStyleKey)) {
      crossFileMarkers.set(o.parentStyleKey, o.markerVarName);
    }
  }
  for (const [styleKey, markerName] of state.siblingMarkerNames) {
    crossFileMarkers.set(styleKey, markerName);
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

  // Parents that have at least one override WITHOUT a scoped marker need
  // defaultMarker() so that `stylex.when.ancestor(':pseudo')` (no marker arg) can match.
  // Parents whose overrides ALL use scoped markers (e.g. pure sibling selectors)
  // only need their scoped marker — defaultMarker() would be unnecessary overhead.
  const parentsNeedingDefaultMarker = new Set<string>();
  for (const o of state.relationOverrides) {
    if (!o.markerVarName && parentsNeedingMarker.has(o.parentStyleKey)) {
      parentsNeedingDefaultMarker.add(o.parentStyleKey);
    }
  }

  return {
    resolvedStyleObjects: state.resolvedStyleObjects,
    relationOverrides: state.relationOverrides,
    ancestorSelectorParents: filteredAncestorParents,
    usedCssHelperFunctions: state.usedCssHelperFunctions,
    crossFileMarkers,
    siblingMarkerKeys: new Set(state.siblingMarkerNames.keys()),
    parentsNeedingDefaultMarker,
    ancestorAttrsByStyleKey: state.ancestorAttrsByStyleKey,
    bail: state.bail,
  };
}

// --- Non-exported helpers ---

type DeclOutcome = "ok" | "skip" | "bail";

/**
 * Lower one decl through the pre-scan → process-rules → finalize sequence.
 * Returns `"skip"` if the decl marked itself skipped (per-decl bail), `"bail"` if
 * something set the file-level bail, or `"ok"` on success.
 */
function processOneDecl(state: LowerRulesState, decl: StyledDecl): DeclOutcome {
  const declState = createDeclProcessingState(state, decl);
  // preScanCssHelperPlaceholders returns false when markBail was called during
  // scanning — either as a per-decl skip (new) or a legacy file-level bail.
  if (!preScanCssHelperPlaceholders(declState)) {
    return decl.skipTransform ? "skip" : "bail";
  }
  processDeclRules(declState);
  if (decl.skipTransform) {
    return "skip";
  }
  if (state.bail) {
    return "bail";
  }
  finalizeDeclProcessing(declState);
  if (decl.skipTransform) {
    return "skip";
  }
  if (state.bail) {
    return "bail";
  }
  return "ok";
}

/**
 * Snapshot of shared state that per-decl processing may mutate. Used to roll back
 * partial mutations when a decl marks itself skipped mid-processing, so that the
 * skipped decl does not leak styleKeys or relation overrides into the output.
 */
type StateSnapshot = {
  resolvedStyleKeys: Set<string>;
  relationOverridesLength: number;
  ancestorSelectorParents: Set<string>;
  siblingMarkerParents: Set<string>;
  siblingMarkerNames: Array<[string, string]>;
  relationOverridePseudoKeys: Set<string>;
  childPseudoKeys: Set<string>;
  ancestorAttrKeys: Set<string>;
  usedCssHelperFunctions: Set<string>;
};

function snapshotStateForDecl(state: LowerRulesState): StateSnapshot {
  return {
    resolvedStyleKeys: new Set(state.resolvedStyleObjects.keys()),
    relationOverridesLength: state.relationOverrides.length,
    ancestorSelectorParents: new Set(state.ancestorSelectorParents),
    siblingMarkerParents: new Set(state.siblingMarkerParents),
    siblingMarkerNames: [...state.siblingMarkerNames.entries()],
    relationOverridePseudoKeys: new Set(state.relationOverridePseudoBuckets.keys()),
    childPseudoKeys: new Set(state.childPseudoMarkers.keys()),
    ancestorAttrKeys: new Set(state.ancestorAttrsByStyleKey.keys()),
    usedCssHelperFunctions: new Set(state.usedCssHelperFunctions),
  };
}

/**
 * Collect style keys *owned* by this decl — keys whose corresponding entry in
 * `resolvedStyleObjects` was created by this decl's own processing.
 *
 * Excludes *referenced* keys (extends, extra mixin keys) because those are owned
 * by another decl (typically a css helper or base component). Pruning referenced
 * keys for a skipped decl would also remove them for transformed decls that
 * still need them — silently dropping styles from otherwise-fine output.
 */
function collectOwnedDeclStyleKeys(decl: StyledDecl): Set<string> {
  const keys = new Set<string>();
  keys.add(decl.styleKey);
  for (const key of Object.values(decl.variantStyleKeys ?? {})) {
    keys.add(key);
  }
  if (decl.enumVariant) {
    keys.add(decl.enumVariant.baseKey);
    for (const c of decl.enumVariant.cases) {
      keys.add(c.styleKey);
    }
  }
  if (decl.attrWrapper) {
    for (const k of [
      decl.attrWrapper.checkboxKey,
      decl.attrWrapper.radioKey,
      decl.attrWrapper.readonlyKey,
      decl.attrWrapper.externalKey,
      decl.attrWrapper.httpsKey,
      decl.attrWrapper.pdfKey,
    ]) {
      if (k) {
        keys.add(k);
      }
    }
  }
  for (const sbv of decl.staticBooleanVariants ?? []) {
    keys.add(sbv.styleKey);
  }
  for (const cc of decl.callSiteCombinedStyles ?? []) {
    keys.add(cc.styleKey);
  }
  return keys;
}

function pruneSkippedDeclsFromState(state: LowerRulesState): void {
  const skipped = state.styledDecls.filter((d: StyledDecl) => d.skipTransform);
  if (skipped.length === 0) {
    return;
  }

  // Any key still referenced by a transformed (non-skipped) decl must be preserved,
  // even if the skipped decl also claims ownership of it. This covers shared helper
  // and mixin style keys that appear in multiple decls' owned key sets.
  const keepKeys = new Set<string>();
  for (const d of state.styledDecls) {
    if (d.skipTransform) {
      continue;
    }
    for (const key of collectOwnedDeclStyleKeys(d)) {
      keepKeys.add(key);
    }
    if (d.extendsStyleKey) {
      keepKeys.add(d.extendsStyleKey);
    }
    for (const key of d.extraStyleKeys ?? []) {
      keepKeys.add(key);
    }
    for (const key of d.extraStyleKeysAfterBase ?? []) {
      keepKeys.add(key);
    }
  }

  const keysToDelete = new Set<string>();
  for (const d of skipped) {
    for (const key of collectOwnedDeclStyleKeys(d)) {
      if (!keepKeys.has(key)) {
        keysToDelete.add(key);
      }
    }
  }
  for (const key of keysToDelete) {
    state.resolvedStyleObjects.delete(key);
    state.relationOverridePseudoBuckets.delete(key);
    state.childPseudoMarkers.delete(key);
    state.ancestorAttrsByStyleKey.delete(key);
    state.ancestorSelectorParents.delete(key);
    state.siblingMarkerParents.delete(key);
    state.siblingMarkerNames.delete(key);
  }
  if (keysToDelete.size > 0) {
    const kept = state.relationOverrides.filter(
      (o) =>
        !keysToDelete.has(o.parentStyleKey) &&
        !keysToDelete.has(o.childStyleKey) &&
        !keysToDelete.has(o.overrideStyleKey),
    );
    state.relationOverrides.splice(0, state.relationOverrides.length, ...kept);
  }
}

function restoreStateSnapshot(state: LowerRulesState, snap: StateSnapshot): void {
  pruneMapKeysNotIn(state.resolvedStyleObjects, snap.resolvedStyleKeys);
  state.relationOverrides.length = snap.relationOverridesLength;
  resetSet(state.ancestorSelectorParents, snap.ancestorSelectorParents);
  resetSet(state.siblingMarkerParents, snap.siblingMarkerParents);
  state.siblingMarkerNames.clear();
  for (const [k, v] of snap.siblingMarkerNames) {
    state.siblingMarkerNames.set(k, v);
  }
  pruneMapKeysNotIn(state.relationOverridePseudoBuckets, snap.relationOverridePseudoKeys);
  pruneMapKeysNotIn(state.childPseudoMarkers, snap.childPseudoKeys);
  pruneMapKeysNotIn(state.ancestorAttrsByStyleKey, snap.ancestorAttrKeys);
  resetSet(state.usedCssHelperFunctions, snap.usedCssHelperFunctions);
}

/** Delete every key from `map` that isn't also in `allowed`. Collects first to avoid mutating during iteration. */
function pruneMapKeysNotIn(map: Map<string, unknown>, allowed: Set<string>): void {
  const toDelete: string[] = [];
  for (const key of map.keys()) {
    if (!allowed.has(key)) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) {
    map.delete(key);
  }
}

function resetSet<T>(target: Set<T>, source: Set<T>): void {
  target.clear();
  for (const v of source) {
    target.add(v);
  }
}
