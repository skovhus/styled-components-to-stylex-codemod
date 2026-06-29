/**
 * Step: lower styled-component CSS rules into StyleX-compatible style objects.
 * Core concepts: rule lowering, adapter resolution, partial-migration policy.
 */
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl } from "../transform-types.js";
import { PARTIAL_PRESERVED_ANCESTOR_REVEAL_WARNING } from "../logger.js";
import { TransformContext } from "../transform-context.js";
import { getUseLogicalProperties, setUseLogicalProperties } from "../css-prop-mapping.js";
import { cssKeyframeNameToIdentifier, extractInlineKeyframes } from "../keyframes.js";
import { createDeclProcessingState } from "../lower-rules/decl-setup.js";
import { finalizeDeclProcessing } from "../lower-rules/finalize-decl.js";
import { postProcessAfterBaseMixins } from "../lower-rules/after-base-mixins.js";
import { preScanCssHelperPlaceholders } from "../lower-rules/pre-scan.js";
import { processDeclRules } from "../lower-rules/process-rules.js";
import { finalizeRelationOverrides } from "../lower-rules/relation-overrides.js";
import { makeCssPropKey } from "../lower-rules/shared.js";
import {
  createLowerRulesState,
  type LowerRulesState,
  type RelationOverride,
} from "../lower-rules/state.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { removeInlinedCssHelperFunctions } from "../transform/css-helpers.js";
import { isTemplatePlaceholderInSelectorContext } from "../utilities/selector-context-heuristic.js";
import { collectIdentifiers } from "../utilities/jscodeshift-utils.js";
import { expressionsReferenceAnyPath } from "../utilities/member-expression-paths.js";
import { shouldSkipPartialImportedComponentRoot } from "../utilities/partial-migration.js";
import { wrappedComponentInterfaceFor } from "../utilities/wrapped-component-interface.js";
import { LOGICAL_TO_PHYSICAL } from "../stylex-shorthands.js";

const PLACEHOLDER_RE_G = new RegExp(PLACEHOLDER_RE.source, "g");

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
    for (const decl of ctx.styledDecls) {
      if (lowered.preservedReferencedStyledDecls.has(decl.localName)) {
        decl.skipTransform = true;
      }
    }
    // `css\`\`` helpers are extracted (and their source declarations removed) by
    // extractCssHelpersStep before lowering runs. Two unsafe partial-mode cases:
    //   1) A helper itself failed to lower — its source is already gone, so any
    //      consumer would dangle.
    //   2) A non-helper decl is skipped but its preserved template still
    //      interpolates a helper (`${helper}`) — the helper's source was extracted,
    //      so the surviving identifier is undefined.
    // Either case must bail the whole file so the original stays intact.
    const removedHelperLocalNames = new Set<string>();
    for (const d of ctx.styledDecls) {
      if (d.isCssHelper && !d.isExported && !d.preserveCssHelperDeclaration) {
        removedHelperLocalNames.add(d.localName);
      }
    }
    const unsafeSkip = ctx.styledDecls.find(
      (d) =>
        d.skipTransform &&
        ((d.isCssHelper && !isSafelyPreservedSkippedCssHelper(d)) ||
          skippedDeclReferencesHelper(d, removedHelperLocalNames)),
    );
    if (unsafeSkip) {
      return returnResult({ code: null, warnings: ctx.warnings }, "bail");
    }
  }

  // Now that we know the file is transformable, remove any css helper functions that were inlined.
  const removableCssHelperFunctions = collectRemovableCssHelperFunctions(
    lowered.usedCssHelperFunctions,
    ctx.styledDecls,
  );
  if (
    removeInlinedCssHelperFunctions({
      root: ctx.root,
      j: ctx.j,
      cssLocal: ctx.cssLocal,
      names: removableCssHelperFunctions,
    })
  ) {
    ctx.markChanged();
  }

  return CONTINUE;
}

function isSafelyPreservedSkippedCssHelper(decl: StyledDecl): boolean {
  return decl.preserveCssHelperDeclaration === true && decl.suppressCssHelperStyleEmission === true;
}

// --- Non-exported helpers ---

type LowerRulesResult = {
  resolvedStyleObjects: Map<string, unknown>;
  relationOverrides: RelationOverride[];
  ancestorSelectorParents: Set<string>;
  usedCssHelperFunctions: Set<string>;
  crossFileMarkers: Map<string, string>;
  siblingMarkerKeys: Set<string>;
  parentsNeedingDefaultMarker: Set<string>;
  /** Maps style key → set of CSS attribute selector strings used in ancestor attribute conditions */
  ancestorAttrsByStyleKey: Map<string, Set<string>>;
  preservedReferencedStyledDecls: Set<string>;
  bail: boolean;
};

function lowerRules(ctx: TransformContext): LowerRulesResult {
  const state = createLowerRulesState(ctx);
  markPartialImportedComponentRoots(ctx, state);
  // Pre-scan all declarations for inline @keyframes definitions.
  // These must be registered before rule processing so animation properties
  // can reference them.
  const reservedNames = new Set(state.styledDecls.map((d) => d.localName));
  for (const decl of state.styledDecls) {
    if (decl.skipTransform) {
      continue;
    }
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
    if (decl.skipTransform) {
      continue;
    }
    if (decl.preResolvedStyle) {
      // Pre-resolved decls bypass processOneDecl, so record the style keys they
      // add here too — otherwise a later preservation (via a skipped sibling's
      // selector reference) would prune only the base key and leak the
      // preResolvedFnDecls (dynamic style-fn) keys as unused StyleX styles.
      const contributed = (decl.contributedStyleKeys ??= new Set<string>());
      state.resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      contributed.add(decl.styleKey);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          state.resolvedStyleObjects.set(k, v);
          contributed.add(k);
        }
      }
      continue;
    }

    const snapshot = snapshotStateForDecl(state);
    state.currentDecl = decl;
    const outcome = processOneDecl(ctx, state, decl);
    state.currentDecl = null;

    if (outcome === "skip") {
      restoreStateSnapshot(state, snapshot);
      continue;
    }
    if (outcome === "bail") {
      break;
    }
    recordAddedResolverImports(state, snapshot.resolverImportKeys, decl);
    recordContributedStyleKeys(state, snapshot.resolvedStyleKeys, decl);
  }

  if (!state.bail) {
    postProcessAfterBaseMixins(state);
  }

  if (!state.bail) {
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
  let preservedReferencedStyledDecls = new Set<string>();
  if (!state.bail) {
    // Compute preservation and propagate reveal-child preservation BEFORE any
    // pruning. A reverse-reveal child (`${Card}:hover &`) must be preserved when
    // its ancestor `Card` is preserved — either referenced by a skipped sibling
    // (e.g. `${Card} span.label { ... }`) or skipped late (e.g. an unsupported
    // after-base css mixin in postProcessAfterBaseMixins). Pruning deletes the
    // ancestor's relation overrides, so the propagation must traverse those edges
    // first; otherwise the child would stay converted with the reveal dropped.
    // Combined fixpoint of two propagations until the preserved set stabilizes:
    //   (a) a preserved/skipped decl preserves the components its template
    //       references as selectors (collectPreservedReferencedStyledDecls), and
    //   (b) a preserved/skipped reveal *ancestor* preserves its reveal children
    //       (preserveReverseRevealChildrenOfPreservedAncestors).
    // They feed each other: a newly-preserved reveal child may itself interpolate
    // another component (e.g. a second `${Panel}:hover &` reveal) whose ancestor
    // must also be preserved, so re-scan its template until nothing new is added.
    let prevPreservedCount = -1;
    while (preservedReferencedStyledDecls.size !== prevPreservedCount) {
      prevPreservedCount = preservedReferencedStyledDecls.size;
      preservedReferencedStyledDecls = collectPreservedReferencedStyledDecls(
        state,
        ctx.cssLocal,
        preservedReferencedStyledDecls,
      );
      preserveReverseRevealChildrenOfPreservedAncestors(state, preservedReferencedStyledDecls);
    }
    pruneSkippedDeclsFromState(state, preservedReferencedStyledDecls);
    prunePreservedReferencedDeclsFromState(state, preservedReferencedStyledDecls);
    prunePreservedReferencedResolverImports(state, preservedReferencedStyledDecls);
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
    preservedReferencedStyledDecls,
    bail: state.bail,
  };
}

type DeclOutcome = "ok" | "skip" | "bail";

/**
 * Lower one decl through the pre-scan → process-rules → finalize sequence.
 * Returns `"skip"` if the decl marked itself skipped (per-decl bail), `"bail"` if
 * something set the file-level bail, or `"ok"` on success.
 */
function processOneDecl(
  ctx: TransformContext,
  state: LowerRulesState,
  decl: StyledDecl,
): DeclOutcome {
  const previousUseLogicalProperties = getUseLogicalProperties();
  const componentInterface =
    decl.base.kind === "component" ? wrappedComponentInterfaceFor(ctx, decl.base.ident) : undefined;
  const forcePhysicalDirectionalShorthands =
    componentInterface?.acceptsSx === true &&
    componentInterface.sxExcludedProperties?.some((prop) => LOGICAL_TO_PHYSICAL[prop]) === true;

  if (forcePhysicalDirectionalShorthands) {
    setUseLogicalProperties(false);
  }

  try {
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
  } finally {
    if (forcePhysicalDirectionalShorthands) {
      setUseLogicalProperties(previousUseLogicalProperties);
    }
  }
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
  resolverImportKeys: Set<string>;
};

function markPartialImportedComponentRoots(ctx: TransformContext, state: LowerRulesState): void {
  for (const decl of state.styledDecls) {
    if (shouldSkipPartialImportedComponentRoot(ctx, decl)) {
      decl.skipTransform = true;
    }
  }
}

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
    resolverImportKeys: new Set(state.resolverImports.keys()),
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

function pruneSkippedDeclsFromState(
  state: LowerRulesState,
  preservedReferencedNames: Set<string> = new Set(),
): void {
  // A reveal child added to `preservedReferencedNames` will be preserved as
  // styled-components, but its `decl.skipTransform` isn't set until `lowerRules`
  // returns. Treat it as skipped here so it neither survives in the output nor
  // keeps a skipped ancestor's keys alive via the keep set (e.g. a later-assigned
  // `extendsStyleKey`/`extraStyleKeys` pointing at the ancestor).
  const willBePreserved = (d: StyledDecl): boolean =>
    d.skipTransform || preservedReferencedNames.has(d.localName);
  const skipped = state.styledDecls.filter(willBePreserved);
  if (skipped.length === 0) {
    return;
  }

  // Any key still referenced by a transformed (non-skipped) decl must be preserved,
  // even if the skipped decl also claims ownership of it. This covers shared helper
  // and mixin style keys that appear in multiple decls' owned key sets.
  const keepKeys = new Set<string>();
  for (const d of state.styledDecls) {
    if (willBePreserved(d)) {
      continue;
    }
    for (const key of declStyleKeysForPruning(d)) {
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
    for (const key of declStyleKeysForPruning(d)) {
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
  dropOrphanedRelationOverrides(state, keysToDelete);
}

/**
 * Drop relation overrides whose parent, child, or override style key was deleted
 * (its decl is preserved as styled-components), and remove the override's now
 * unreachable style object + pseudo bucket so emission never leaves an unused
 * StyleX style behind.
 */
function dropOrphanedRelationOverrides(state: LowerRulesState, keysToDelete: Set<string>): void {
  if (keysToDelete.size === 0) {
    return;
  }
  // A stored parent/child style key can be stale: the child key is captured before
  // the child's own finalize, which may rewrite it (e.g. enum/string-mapping
  // variants → a derived base key). Also test the decls' current style keys,
  // resolved via their immutable local names, so a preserved decl drops its
  // override regardless of key rewrites instead of leaving a dead StyleX entry.
  const currentStyleKey = (localName: string | undefined): string | undefined =>
    localName ? state.declByLocalName.get(localName)?.styleKey : undefined;
  const kept: RelationOverride[] = [];
  for (const o of state.relationOverrides) {
    const childCurrent = currentStyleKey(o.childLocalName);
    const parentCurrent = currentStyleKey(o.parentLocalName);
    const orphaned =
      keysToDelete.has(o.parentStyleKey) ||
      keysToDelete.has(o.childStyleKey) ||
      keysToDelete.has(o.overrideStyleKey) ||
      (childCurrent !== undefined && keysToDelete.has(childCurrent)) ||
      (parentCurrent !== undefined && keysToDelete.has(parentCurrent));
    if (orphaned) {
      state.resolvedStyleObjects.delete(o.overrideStyleKey);
      state.relationOverridePseudoBuckets.delete(o.overrideStyleKey);
      continue;
    }
    kept.push(o);
  }
  state.relationOverrides.splice(0, state.relationOverrides.length, ...kept);
}

/**
 * Reverse component-selector reveals (`${Ancestor}:hover &`) require the ancestor
 * to render a StyleX marker. The lowering pass only catches ancestors already
 * skipped when the child was processed; partial migration can additionally
 * preserve an ancestor *after* lowering when a skipped sibling references it as a
 * selector. Propagate that preservation to the reverse-reveal children so both
 * stay styled-components (keeping the original reveal) and the child's override
 * style is pruned instead of emitted dead.
 *
 * Runs as a fixpoint because a newly-preserved child may itself be the ancestor
 * of another reverse reveal. Same-file overrides only — cross-file reveals are
 * wired through the consumer patcher.
 */
function preserveReverseRevealChildrenOfPreservedAncestors(
  state: LowerRulesState,
  preservedNames: Set<string>,
): void {
  const declByStyleKey = new Map<string, StyledDecl>();
  for (const decl of state.styledDecls) {
    if (!decl.isCssHelper) {
      declByStyleKey.set(decl.styleKey, decl);
    }
  }
  const isPreserved = (decl: StyledDecl): boolean =>
    decl.skipTransform || preservedNames.has(decl.localName);
  // Prefer the immutable local name (style keys may have been rewritten after the
  // override was registered — e.g. enum/string-mapping variants), falling back to
  // the style key for overrides that predate local-name tagging.
  const resolveOverrideDecl = (localName: string | undefined, styleKey: string) =>
    (localName ? state.declByLocalName.get(localName) : undefined) ?? declByStyleKey.get(styleKey);
  let changed = true;
  while (changed) {
    changed = false;
    for (const override of state.relationOverrides) {
      // Don't gate on `override.crossFile`: the no-pseudo reverse form (`${Card} &`)
      // is flagged crossFile because it uses a scoped marker, yet its ancestor is a
      // same-file decl that still needs this propagation. Genuine cross-file reveals
      // are filtered instead by ancestor resolution below — their imported ancestor
      // has no local decl, so `ancestorDecl` is undefined and the override is skipped.
      const ancestorDecl = resolveOverrideDecl(override.parentLocalName, override.parentStyleKey);
      const childDecl = resolveOverrideDecl(override.childLocalName, override.childStyleKey);
      if (!ancestorDecl || !childDecl || !isPreserved(ancestorDecl) || isPreserved(childDecl)) {
        continue;
      }
      preservedNames.add(childDecl.localName);
      changed = true;
      state.warnings.push({
        severity: "warning",
        type: PARTIAL_PRESERVED_ANCESTOR_REVEAL_WARNING,
        loc: childDecl.loc,
        context: { child: childDecl.localName, ancestor: ancestorDecl.localName },
      });
    }
  }
}

function collectPreservedReferencedStyledDecls(
  state: LowerRulesState,
  cssLocal: string | undefined,
  initialPreserved: Set<string> = new Set(),
): Set<string> {
  const { styledDecls } = state;
  const preservedNames = new Set<string>(initialPreserved);
  const componentNames = new Set(
    styledDecls.filter((decl) => !decl.isCssHelper).map((decl) => decl.localName),
  );
  const helperSelectorIdentifiers = collectCssHelperFunctionSelectorIdentifiers(state, cssLocal);
  const addReferencedComponentNames = (referencedNames: Iterable<string>): boolean => {
    let added = false;
    for (const name of referencedNames) {
      if (componentNames.has(name) && !preservedNames.has(name)) {
        preservedNames.add(name);
        added = true;
      }
    }
    return added;
  };
  for (const decl of styledDecls) {
    if (!decl.isCssHelper || (!decl.isExported && !decl.preserveCssHelperDeclaration)) {
      continue;
    }
    addReferencedComponentNames(helperSelectorIdentifiers.get(decl.localName) ?? []);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const decl of styledDecls) {
      if ((!decl.skipTransform && !preservedNames.has(decl.localName)) || decl.isCssHelper) {
        continue;
      }
      const referencedNames = collectTemplateSelectorIdentifiers(decl);
      for (const helperName of collectTemplateExpressionIdentifiers(decl)) {
        for (const selectorName of helperSelectorIdentifiers.get(helperName) ?? []) {
          referencedNames.add(selectorName);
        }
      }
      changed = addReferencedComponentNames(referencedNames) || changed;
    }
  }
  return preservedNames;
}

function prunePreservedReferencedDeclsFromState(
  state: LowerRulesState,
  preservedNames: Set<string>,
): void {
  if (preservedNames.size === 0) {
    return;
  }
  const keysToDelete = new Set<string>();
  for (const decl of state.styledDecls) {
    if (!preservedNames.has(decl.localName)) {
      continue;
    }
    for (const key of declStyleKeysForPruning(decl)) {
      keysToDelete.add(key);
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
  dropOrphanedRelationOverrides(state, keysToDelete);
}

function recordContributedStyleKeys(
  state: LowerRulesState,
  beforeKeys: Set<string>,
  decl: StyledDecl,
): void {
  for (const key of state.resolvedStyleObjects.keys()) {
    if (!beforeKeys.has(key)) {
      (decl.contributedStyleKeys ??= new Set<string>()).add(key);
    }
  }
}

/**
 * Keys to prune when a decl is skipped/preserved: the statically-derivable owned
 * keys plus everything its processing actually contributed to `resolvedStyleObjects`
 * (dynamic style-fn / theme / pseudo keys that `collectOwnedDeclStyleKeys` can't
 * enumerate). The union keeps pruning complete without a fragile field-by-field list.
 */
function declStyleKeysForPruning(decl: StyledDecl): Set<string> {
  const keys = collectOwnedDeclStyleKeys(decl);
  for (const key of decl.contributedStyleKeys ?? []) {
    keys.add(key);
  }
  return keys;
}

function recordAddedResolverImports(
  state: LowerRulesState,
  beforeKeys: Set<string>,
  decl: StyledDecl,
): void {
  const addedKeys = new Set<string>();
  for (const key of state.resolverImports.keys()) {
    if (!beforeKeys.has(key)) {
      addedKeys.add(key);
    }
  }
  if (addedKeys.size > 0) {
    appendResolverImportKeys(decl, addedKeys);
  }
}

function prunePreservedReferencedResolverImports(
  state: LowerRulesState,
  preservedNames: Set<string>,
): void {
  if (preservedNames.size === 0) {
    return;
  }

  const keysToDelete = new Set<string>();
  const keysToKeep = new Set<string>();
  for (const decl of state.styledDecls) {
    const importKeys = decl.resolverImportKeys;
    if (!importKeys || importKeys.size === 0) {
      continue;
    }
    const target =
      preservedNames.has(decl.localName) || decl.skipTransform ? keysToDelete : keysToKeep;
    for (const key of importKeys) {
      target.add(key);
    }
  }

  for (const key of keysToDelete) {
    if (!keysToKeep.has(key)) {
      state.resolverImports.delete(key);
    }
  }
}

function appendResolverImportKeys(decl: StyledDecl, keys: Set<string>): void {
  if (!decl.resolverImportKeys) {
    decl.resolverImportKeys = new Set<string>();
  }
  for (const key of keys) {
    decl.resolverImportKeys.add(key);
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
  pruneMapKeysNotIn(state.resolverImports, snap.resolverImportKeys);
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

/**
 * True when the skipped decl's template interpolates a css helper that was extracted
 * (and its source declaration removed) earlier in the pipeline. The preserved decl
 * would otherwise reference an undefined identifier at runtime.
 */
function skippedDeclReferencesHelper(
  decl: { templateExpressions?: unknown[] },
  helperLocalNames: Set<string>,
): boolean {
  return expressionsReferenceAnyPath(decl.templateExpressions, helperLocalNames);
}

function collectRemovableCssHelperFunctions(
  usedCssHelperFunctions: Set<string>,
  styledDecls: StyledDecl[],
): Set<string> {
  const removable = new Set(usedCssHelperFunctions);
  if (removable.size === 0) {
    return removable;
  }

  for (const decl of styledDecls) {
    const keepsSource =
      decl.skipTransform ||
      (decl.isCssHelper &&
        (decl.isExported === true || decl.preserveCssHelperDeclaration === true));
    if (!keepsSource) {
      continue;
    }
    for (const name of collectTemplateExpressionIdentifiers(decl)) {
      removable.delete(name);
    }
  }
  return removable;
}

function collectTemplateSelectorIdentifiers(decl: StyledDecl): Set<string> {
  const identifiers = new Set<string>();
  if (!decl.rawCss) {
    return identifiers;
  }
  for (const match of decl.rawCss.matchAll(PLACEHOLDER_RE_G)) {
    const slotId = Number(match[1]);
    const expr = decl.templateExpressions[slotId] as { type?: string; name?: string } | undefined;
    if (
      expr?.type === "Identifier" &&
      expr.name &&
      isTemplatePlaceholderInSelectorContext(decl.rawCss, match.index, match[0].length)
    ) {
      identifiers.add(expr.name);
    }
  }
  return identifiers;
}

function collectCssHelperFunctionSelectorIdentifiers(
  state: LowerRulesState,
  cssLocal: string | undefined,
): Map<string, Set<string>> {
  const selectorIdentifiers = new Map<string, Set<string>>();
  const helperReferences = new Map<string, Set<string>>();
  for (const decl of state.styledDecls) {
    if (!decl.isCssHelper || (!decl.isExported && !decl.preserveCssHelperDeclaration)) {
      continue;
    }
    selectorIdentifiers.set(decl.localName, collectTemplateSelectorIdentifiers(decl));
    helperReferences.set(decl.localName, collectTemplateExpressionIdentifiers(decl));
  }
  for (const [name, helperFn] of state.cssHelperFunctions as Map<
    string,
    { rawCss?: string; templateExpressions?: unknown[] }
  >) {
    selectorIdentifiers.set(
      name,
      collectTemplateSelectorIdentifiersFromParts(helperFn.rawCss, helperFn.templateExpressions),
    );
    helperReferences.set(name, collectExpressionIdentifiers(helperFn.templateExpressions));
  }

  if (!cssLocal) {
    expandCssHelperSelectorIdentifiers(selectorIdentifiers, helperReferences);
    return selectorIdentifiers;
  }

  state.root
    .find(state.j.VariableDeclarator, {
      init: { type: "ArrowFunctionExpression" },
    } as object)
    .forEach((path: any) => {
      if (path.node.id?.type !== "Identifier") {
        return;
      }
      const init = path.node.init;
      const body = init?.body;
      if (
        body?.type !== "TaggedTemplateExpression" ||
        body.tag?.type !== "Identifier" ||
        body.tag.name !== cssLocal
      ) {
        return;
      }
      selectorIdentifiers.set(
        path.node.id.name,
        collectTemplateSelectorIdentifiersFromTemplate(body.quasi),
      );
      helperReferences.set(path.node.id.name, collectExpressionIdentifiers(body.quasi.expressions));
    });

  expandCssHelperSelectorIdentifiers(selectorIdentifiers, helperReferences);
  return selectorIdentifiers;
}

function collectTemplateExpressionIdentifiers(decl: StyledDecl): Set<string> {
  return collectExpressionIdentifiers(decl.templateExpressions);
}

function collectExpressionIdentifiers(expressions: readonly unknown[] | undefined): Set<string> {
  const identifiers = new Set<string>();
  for (const expr of expressions ?? []) {
    collectIdentifiers(expr, identifiers);
  }
  return identifiers;
}

function expandCssHelperSelectorIdentifiers(
  selectorIdentifiers: Map<string, Set<string>>,
  helperReferences: ReadonlyMap<string, ReadonlySet<string>>,
): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [helperName, references] of helperReferences) {
      const selectors = selectorIdentifiers.get(helperName);
      if (!selectors) {
        continue;
      }
      for (const reference of references) {
        const referencedSelectors = selectorIdentifiers.get(reference);
        if (!referencedSelectors) {
          continue;
        }
        for (const selectorName of referencedSelectors) {
          if (selectors.has(selectorName)) {
            continue;
          }
          selectors.add(selectorName);
          changed = true;
        }
      }
    }
  }
}

function collectTemplateSelectorIdentifiersFromTemplate(template: {
  quasis?: Array<{ value?: { raw?: string } }>;
  expressions?: unknown[];
}): Set<string> {
  const rawParts: string[] = [];
  const quasis = template.quasis ?? [];
  const expressions = template.expressions ?? [];
  for (let i = 0; i < quasis.length; i++) {
    rawParts.push(quasis[i]?.value?.raw ?? "");
    if (i < expressions.length) {
      rawParts.push(`__SC_EXPR_${i}__`);
    }
  }
  return collectTemplateSelectorIdentifiersFromParts(rawParts.join(""), expressions);
}

function collectTemplateSelectorIdentifiersFromParts(
  rawCss: string | undefined,
  templateExpressions: readonly unknown[] | undefined,
): Set<string> {
  const identifiers = new Set<string>();
  if (!rawCss) {
    return identifiers;
  }
  for (const match of rawCss.matchAll(PLACEHOLDER_RE_G)) {
    const slotId = Number(match[1]);
    const expr = templateExpressions?.[slotId] as { type?: string; name?: string } | undefined;
    if (
      expr?.type === "Identifier" &&
      expr.name &&
      isTemplatePlaceholderInSelectorContext(rawCss, match.index, match[0].length)
    ) {
      identifiers.add(expr.name);
    }
  }
  return identifiers;
}
