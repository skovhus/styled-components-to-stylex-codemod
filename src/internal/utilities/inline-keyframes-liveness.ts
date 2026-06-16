import type { TransformContext } from "../transform-context.js";
import type { StyledDecl } from "../transform-types.js";
import { collectIdentifiers } from "./jscodeshift-utils.js";

export type InlineKeyframePruneState = Pick<
  TransformContext,
  "inlineKeyframes" | "inlineKeyframeNameMap" | "keyframesNames"
>;

export type InlineKeyframeStyleBuckets = Pick<
  StyledDecl,
  "skipTransform" | "variantDimensions" | "staticBooleanVariants" | "callSiteCombinedStyles"
>;

export function pruneUnusedInlineKeyframes(args: {
  state: InlineKeyframePruneState;
  emittedStyleValues: Iterable<unknown>;
  styledDecls: readonly InlineKeyframeStyleBuckets[];
}): void {
  const { state, emittedStyleValues, styledDecls } = args;
  const inlineKeyframes = state.inlineKeyframes;
  if (!inlineKeyframes || inlineKeyframes.size === 0) {
    return;
  }

  const referenced = collectReferencedInlineKeyframes(inlineKeyframes, emittedStyleValues);
  collectReferencedTransformedVariantKeyframes(inlineKeyframes, styledDecls, referenced);
  deleteUnreferencedInlineKeyframes(state, referenced);
}

function collectReferencedInlineKeyframes(
  inlineKeyframes: NonNullable<TransformContext["inlineKeyframes"]>,
  values: Iterable<unknown>,
): Set<string> {
  const referenced = new Set<string>();
  for (const value of values) {
    collectReferencedInlineKeyframeNames(inlineKeyframes, value, referenced);
  }
  return referenced;
}

function collectReferencedTransformedVariantKeyframes(
  inlineKeyframes: NonNullable<TransformContext["inlineKeyframes"]>,
  styledDecls: readonly InlineKeyframeStyleBuckets[],
  referenced: Set<string>,
): void {
  for (const decl of styledDecls) {
    if (decl.skipTransform) {
      continue;
    }
    for (const dimension of decl.variantDimensions ?? []) {
      collectReferencedInlineKeyframeNames(inlineKeyframes, dimension.variants, referenced);
    }
    for (const variant of decl.staticBooleanVariants ?? []) {
      collectReferencedInlineKeyframeNames(inlineKeyframes, variant.styles, referenced);
    }
    for (const combined of decl.callSiteCombinedStyles ?? []) {
      collectReferencedInlineKeyframeNames(inlineKeyframes, combined.styles, referenced);
    }
  }
}

function collectReferencedInlineKeyframeNames(
  inlineKeyframes: NonNullable<TransformContext["inlineKeyframes"]>,
  value: unknown,
  referenced: Set<string>,
): void {
  const identifiers = new Set<string>();
  collectIdentifiers(value, identifiers);
  for (const name of identifiers) {
    if (inlineKeyframes.has(name)) {
      referenced.add(name);
    }
  }
}

function deleteUnreferencedInlineKeyframes(
  state: InlineKeyframePruneState,
  referenced: ReadonlySet<string>,
): void {
  const inlineKeyframes = state.inlineKeyframes;
  if (!inlineKeyframes) {
    return;
  }
  for (const name of inlineKeyframes.keys()) {
    if (!referenced.has(name)) {
      inlineKeyframes.delete(name);
    }
  }

  if (!state.inlineKeyframeNameMap) {
    return;
  }
  for (const [cssName, jsName] of state.inlineKeyframeNameMap.entries()) {
    if (!inlineKeyframes.has(jsName)) {
      state.inlineKeyframeNameMap.delete(cssName);
      state.keyframesNames.delete(cssName);
    }
  }
}
