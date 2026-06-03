/**
 * Shared primitive for bucketing a single optional prop's dynamic style into static
 * `prop === value` variants when consumer usage is exhaustively observed.
 *
 * Several lower-rule paths (css-helper conditionals, interpolated declarations, interpolated
 * CSS blocks) discovered the same optimization independently. They differ only in how a single
 * bucket's style is computed from an observed prop value; the precondition checks, value bounds,
 * `prop === value` formatting, atomic emission, and post-emit bookkeeping are identical and live
 * here so every caller stays consistent.
 */

import type { ComponentPropUsageInfo, StyledDecl } from "../transform-types.js";
import {
  formatObservedVariantCondition,
  getExhaustiveObservedStaticValues,
} from "../utilities/prop-usage.js";

/** Upper bound on observed values before bucketing is considered too broad to be worthwhile. */
const MAX_OBSERVED_VARIANT_VALUES = 20;

/**
 * Validates that `propName` is an optional prop whose consumer usage is exhaustively observed
 * (it is sometimes omitted and every supplied value is a static string/number), returning the
 * observed values when bucketing is viable or `null` to bail.
 *
 * `isExported` is required: these buckets carry no runtime fallback, so they are only sound when
 * every call site is observable. Exported components can be rendered by callers outside the analyzed
 * set with unseen values, so bucketing must bail for them (callers fall back to dynamic styles).
 */
export function resolveObservedVariantValues(args: {
  usage: ComponentPropUsageInfo | undefined;
  propName: string;
  isOptional: boolean;
  isExported: boolean;
  minValues?: number;
}): Array<string | number> | null {
  if (args.isExported || !args.isOptional) {
    return null;
  }
  if ((args.usage?.props[args.propName]?.omittedCount ?? 0) === 0) {
    return null;
  }
  const values = getExhaustiveObservedStaticValues(args.usage, args.propName);
  if (
    !values ||
    values.length < (args.minValues ?? 1) ||
    values.length > MAX_OBSERVED_VARIANT_VALUES
  ) {
    return null;
  }
  return values;
}

/** Per-value outcome from {@link ObservedVariantBucketParams.buildBucket}. */
type ObservedBucketResult =
  /** Abort the whole optimization (e.g. a value resolved to a non-static expression). */
  | { kind: "bail" }
  /** This observed value contributes no style (e.g. an empty branch); skip it. */
  | { kind: "skip" }
  /** Emit a variant for this value, optionally guarded by a static `&&` prefix condition. */
  | { kind: "emit"; style: Record<string, unknown>; whenPrefix?: string };

interface ObservedVariantBucketParams {
  decl: StyledDecl;
  propName: string;
  /** Observed values from {@link resolveObservedVariantValues}. */
  observedValues: ReadonlyArray<string | number>;
  applyVariant: (info: { when: string; propName: string }, style: Record<string, unknown>) => void;
  /** Drops the now-statically-bucketed prop from the forwarded surface (path-specific). */
  ensurePropDrop: (propName: string) => void;
  buildBucket: (propValue: string | number) => ObservedBucketResult;
}

/**
 * Computes every bucket up front and emits atomically: if any value bails, nothing is emitted and
 * `false` is returned so the caller can fall back to its dynamic path. Returns `true` once at least
 * one variant has been emitted and the prop has been marked for lookup-cast + drop + wrapping.
 */
export function emitObservedVariantBuckets(params: ObservedVariantBucketParams): boolean {
  const buckets: Array<{ when: string; style: Record<string, unknown> }> = [];
  for (const propValue of params.observedValues) {
    const result = params.buildBucket(propValue);
    if (result.kind === "bail") {
      return false;
    }
    if (result.kind === "skip" || Object.keys(result.style).length === 0) {
      continue;
    }
    const condition = formatObservedVariantCondition(params.propName, propValue);
    buckets.push({
      when: result.whenPrefix ? `${result.whenPrefix} && ${condition}` : condition,
      style: result.style,
    });
  }
  if (buckets.length === 0) {
    return false;
  }
  for (const { when, style } of buckets) {
    params.applyVariant({ when, propName: params.propName }, style);
  }
  params.decl.variantLookupCastProps ??= new Set<string>();
  params.decl.variantLookupCastProps.add(params.propName);
  params.ensurePropDrop(params.propName);
  params.decl.needsWrapperComponent = true;
  return true;
}
