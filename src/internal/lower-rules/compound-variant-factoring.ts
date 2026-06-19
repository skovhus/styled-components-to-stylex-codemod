/**
 * Factors styles common to complementary compound variants (e.g.
 * `parent && prop` / `parent && !prop`) up into a shared parent bucket,
 * preserving CSS source order so the cascade is unchanged.
 */
import { styleKeyWithSuffix } from "../transform/helpers.js";
import type { StyledDecl } from "../transform-types.js";
import { mergeStyleObjects } from "./utils.js";
import { astShapeKey } from "./ast-style-utils.js";

export function factorCommonStylesFromComplementaryCompoundVariants(args: {
  decl: StyledDecl;
  stateResolvedStyleObjects: Map<string, unknown>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  variantSourceOrder: Record<string, number>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
}): void {
  const { decl, remainingBuckets, remainingStyleKeys, variantSourceOrder, styleFnFromProps } = args;
  const complementaryPairs = collectComplementaryCompoundPairs(remainingBuckets);

  for (const pair of complementaryPairs) {
    const positiveBucket = remainingBuckets.get(pair.positiveWhen);
    const negativeBucket = remainingBuckets.get(pair.negativeWhen);
    if (!positiveBucket || !negativeBucket) {
      continue;
    }
    const parentStyleKey = styleKeyWithSuffix(decl.styleKey, pair.parentWhen);
    const sourceOrders = getSafeFactoredSourceOrders({
      decl,
      pair,
      parentStyleKey,
      variantSourceOrder,
      remainingBuckets,
      remainingStyleKeys,
      styleFnFromProps,
      styleFnDecls: args.styleFnDecls,
      extraStyleObjects: args.extraStyleObjects,
      attrBuckets: args.attrBuckets,
      stateResolvedStyleObjects: args.stateResolvedStyleObjects,
    });
    if (!sourceOrders) {
      continue;
    }

    const parentBucket = remainingBuckets.get(pair.parentWhen) ?? {};
    const commonStyles = extractMovableCommonStyles(positiveBucket, negativeBucket, parentBucket);
    if (Object.keys(commonStyles).length === 0) {
      continue;
    }

    mergeStyleObjects(parentBucket, commonStyles);
    remainingBuckets.set(pair.parentWhen, parentBucket);
    remainingStyleKeys[pair.parentWhen] ??= parentStyleKey;

    removeStyleProps(positiveBucket, commonStyles);
    removeStyleProps(negativeBucket, commonStyles);
    removeEmptyVariantBucket(pair.positiveWhen, remainingBuckets, remainingStyleKeys);
    removeEmptyVariantBucket(pair.negativeWhen, remainingBuckets, remainingStyleKeys);

    variantSourceOrder[pair.parentWhen] = Math.min(...sourceOrders) - 0.1;
  }
}

// --- Non-exported helpers ---

type ComplementaryCompoundPair = {
  parentWhen: string;
  positiveWhen: string;
  negativeWhen: string;
};

type TrailingBooleanConjunction = {
  parentWhen: string;
  propName: string;
  negated: boolean;
};

function getSafeFactoredSourceOrders(args: {
  decl: StyledDecl;
  pair: ComplementaryCompoundPair;
  parentStyleKey: string;
  variantSourceOrder: Record<string, number>;
  remainingBuckets: Map<string, Record<string, unknown>>;
  remainingStyleKeys: Record<string, string>;
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
  stateResolvedStyleObjects: Map<string, unknown>;
}): [number, number] | null {
  const { decl, pair, parentStyleKey, variantSourceOrder, remainingBuckets, styleFnFromProps } =
    args;
  if (remainingBuckets.has(pair.parentWhen)) {
    return null;
  }
  if (isReservedFactoredStyleKey(args)) {
    return null;
  }
  if (hasInverseVariantBucket(pair.parentWhen, remainingBuckets)) {
    return null;
  }
  if (styleFnFromProps.some((entry) => entry.conditionWhen === pair.parentWhen)) {
    return null;
  }
  if (styleFnFromProps.some((entry) => entry.jsxProp === pair.parentWhen)) {
    return null;
  }
  if (hasPotentialConsolidatedStyleFnKey(parentStyleKey, decl, styleFnFromProps)) {
    return null;
  }

  const positiveOrder = variantSourceOrder[pair.positiveWhen];
  const negativeOrder = variantSourceOrder[pair.negativeWhen];
  if (typeof positiveOrder !== "number" || typeof negativeOrder !== "number") {
    return null;
  }

  const startOrder = Math.min(positiveOrder, negativeOrder);
  for (const [when, order] of Object.entries(variantSourceOrder)) {
    if (when === pair.positiveWhen || when === pair.negativeWhen) {
      continue;
    }
    if (order > startOrder && when !== pair.parentWhen) {
      return null;
    }
  }
  for (const entry of styleFnFromProps) {
    const order = entry.sourceOrder;
    if (typeof order === "number" && order > startOrder) {
      return null;
    }
  }

  return [positiveOrder, negativeOrder];
}

function isReservedFactoredStyleKey(args: {
  decl: StyledDecl;
  pair: ComplementaryCompoundPair;
  parentStyleKey: string;
  remainingStyleKeys: Record<string, string>;
  styleFnDecls: Map<string, unknown>;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  attrBuckets: Map<string, Record<string, unknown>>;
  stateResolvedStyleObjects: Map<string, unknown>;
}): boolean {
  const {
    decl,
    pair,
    parentStyleKey,
    remainingStyleKeys,
    styleFnDecls,
    extraStyleObjects,
    attrBuckets,
    stateResolvedStyleObjects,
  } = args;

  for (const [when, styleKey] of Object.entries(remainingStyleKeys)) {
    if (when !== pair.parentWhen && styleKey === parentStyleKey) {
      return true;
    }
  }
  for (const staticVariant of decl.staticBooleanVariants ?? []) {
    if (staticVariant.styleKey === parentStyleKey) {
      return true;
    }
  }
  for (const combinedStyle of decl.callSiteCombinedStyles ?? []) {
    if (combinedStyle.styleKey === parentStyleKey) {
      return true;
    }
  }

  return (
    styleFnDecls.has(parentStyleKey) ||
    extraStyleObjects.has(parentStyleKey) ||
    attrBuckets.has(parentStyleKey) ||
    stateResolvedStyleObjects.has(parentStyleKey)
  );
}

function hasPotentialConsolidatedStyleFnKey(
  parentStyleKey: string,
  decl: StyledDecl,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): boolean {
  if (!decl.shouldForwardProp) {
    return false;
  }

  const countsByProp = new Map<string, number>();
  for (const entry of styleFnFromProps) {
    if (entry.jsxProp === "__props" || entry.conditionWhen || !entry.jsxProp.startsWith("$")) {
      continue;
    }
    countsByProp.set(entry.jsxProp, (countsByProp.get(entry.jsxProp) ?? 0) + 1);
  }

  for (const [propName, count] of countsByProp) {
    if (count < 2) {
      continue;
    }
    const suffix = propName.slice(1).charAt(0).toUpperCase() + propName.slice(2);
    if (`${decl.styleKey}${suffix}` === parentStyleKey) {
      return true;
    }
  }
  return false;
}

function hasInverseVariantBucket(
  parentWhen: string,
  remainingBuckets: Map<string, Record<string, unknown>>,
): boolean {
  for (const when of remainingBuckets.keys()) {
    if (conditionsAreInverses(parentWhen, when)) {
      return true;
    }
  }
  return false;
}

function conditionsAreInverses(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  const unwrappedLeftNegation = unwrapNegatedCondition(normalizedLeft);
  const unwrappedRightNegation = unwrapNegatedCondition(normalizedRight);
  if (unwrappedLeftNegation === normalizedRight || unwrappedRightNegation === normalizedLeft) {
    return true;
  }

  const leftComparison = parseSimpleComparison(normalizedLeft);
  const rightComparison = parseSimpleComparison(normalizedRight);
  return (
    !!leftComparison &&
    !!rightComparison &&
    leftComparison.left === rightComparison.left &&
    leftComparison.right === rightComparison.right &&
    leftComparison.operator !== rightComparison.operator
  );
}

function unwrapNegatedCondition(condition: string): string | null {
  if (condition.startsWith("!(") && condition.endsWith(")")) {
    return condition.slice(2, -1).trim();
  }
  if (condition.startsWith("!")) {
    return condition.slice(1).trim();
  }
  return null;
}

function parseSimpleComparison(
  condition: string,
): { left: string; operator: "===" | "!=="; right: string } | null {
  const match = condition.match(/^(.+?)\s*(===|!==)\s*(.+)$/);
  if (!match) {
    return null;
  }
  const [, left, operator, right] = match;
  if (!left || !right || (operator !== "===" && operator !== "!==")) {
    return null;
  }
  return { left: left.trim(), operator, right: right.trim() };
}

function collectComplementaryCompoundPairs(
  remainingBuckets: Map<string, Record<string, unknown>>,
): ComplementaryCompoundPair[] {
  const candidates = new Map<
    string,
    {
      parentWhen: string;
      positiveWhen?: string;
      negativeWhen?: string;
    }
  >();

  for (const when of remainingBuckets.keys()) {
    const parsed = parseTrailingBooleanConjunction(when);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.parentWhen}\0${parsed.propName}`;
    const candidate = candidates.get(key) ?? { parentWhen: parsed.parentWhen };
    if (parsed.negated) {
      candidate.negativeWhen = when;
    } else {
      candidate.positiveWhen = when;
    }
    candidates.set(key, candidate);
  }

  return [...candidates.values()].flatMap((candidate) =>
    candidate.positiveWhen && candidate.negativeWhen
      ? [
          {
            parentWhen: candidate.parentWhen,
            positiveWhen: candidate.positiveWhen,
            negativeWhen: candidate.negativeWhen,
          },
        ]
      : [],
  );
}

function parseTrailingBooleanConjunction(when: string): TrailingBooleanConjunction | null {
  if (when.includes("||") || when.includes("(") || when.includes(")")) {
    return null;
  }

  const parts = when.split(/\s+&&\s+/).map((part) => part.trim());
  if (parts.length < 2) {
    return null;
  }

  const leaf = parts[parts.length - 1];
  if (!leaf) {
    return null;
  }

  const match = leaf.match(/^(!)?([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (!match) {
    return null;
  }
  const [, negation, propName] = match;
  if (!propName) {
    return null;
  }

  return {
    parentWhen: parts.slice(0, -1).join(" && "),
    propName,
    negated: negation === "!",
  };
}

function extractMovableCommonStyles(
  positiveBucket: Record<string, unknown>,
  negativeBucket: Record<string, unknown>,
  parentBucket: Record<string, unknown>,
): Record<string, unknown> {
  const commonStyles: Record<string, unknown> = {};
  for (const [prop, positiveValue] of Object.entries(positiveBucket)) {
    if (!(prop in negativeBucket)) {
      continue;
    }

    const negativeValue = negativeBucket[prop];
    if (!styleValuesAreEqual(positiveValue, negativeValue)) {
      continue;
    }

    const parentValue = parentBucket[prop];
    if (parentValue !== undefined && !styleValuesAreEqual(parentValue, positiveValue)) {
      continue;
    }

    commonStyles[prop] = positiveValue;
  }
  return commonStyles;
}

function styleValuesAreEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (!a || !b || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  return astShapeKey(a) === astShapeKey(b);
}

function removeStyleProps(
  bucket: Record<string, unknown>,
  stylesToRemove: Record<string, unknown>,
): void {
  for (const prop of Object.keys(stylesToRemove)) {
    delete bucket[prop];
  }
}

function removeEmptyVariantBucket(
  when: string,
  remainingBuckets: Map<string, Record<string, unknown>>,
  remainingStyleKeys: Record<string, string>,
): void {
  const bucket = remainingBuckets.get(when);
  if (bucket && Object.keys(bucket).length === 0) {
    remainingBuckets.delete(when);
    delete remainingStyleKeys[when];
  }
}
