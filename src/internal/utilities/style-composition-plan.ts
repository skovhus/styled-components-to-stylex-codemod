/**
 * Builds ordered style composition metadata shared by emit-adjacent analysis.
 * Core concepts: style key order, conditional contributors, and dynamic args.
 */
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";

export type StyleContributionSource =
  | "base"
  | "mixin"
  | "variant"
  | "styleFn"
  | "pseudo"
  | "theme"
  | "attr"
  | "enum"
  | "adjacent"
  | "promoted"
  | "combined"
  | "propsArg";

export type StyleSequenceEntry = {
  styleKey: string;
  styleObj?: Record<string, unknown>;
  patchable: boolean;
  contributes?: boolean;
  contributesDynamic?: boolean;
  source: StyleContributionSource;
};

type OrderedTailEntry = {
  order: number;
  index: number;
  entry: StyleSequenceEntry;
};

type SequenceEntryGroup = {
  immediate: StyleSequenceEntry[];
  ordered: OrderedTailEntry[];
};

type ExtraStyleEntryGroups = {
  beforeBase: StyleSequenceEntry[];
  afterBase: StyleSequenceEntry[];
  afterVariants: StyleSequenceEntry[];
};

export function buildStyleKeySequence(
  ctx: TransformContext,
  decl: StyledDecl,
  options?: { includeLocalBase?: boolean },
): StyleSequenceEntry[] {
  const entries: StyleSequenceEntry[] = [];
  const extraEntries = buildExtraStyleEntries(decl);

  if (options?.includeLocalBase !== false) {
    for (const styleKey of localBaseStyleKeys(ctx, decl)) {
      entries.push({ styleKey, patchable: false, source: "base" });
    }
  }
  entries.push(...extraEntries.beforeBase);
  if (!decl.skipBaseStyleRef) {
    entries.push({ styleKey: decl.styleKey, patchable: true, source: "base" });
  }
  entries.push(...extraEntries.afterBase);

  const variantAndStyleFnEntries = buildVariantAndStyleFnEntries(decl);
  const variantDimensionEntries = buildVariantDimensionEntries(decl);
  entries.push(...variantAndStyleFnEntries.immediate);
  entries.push(...variantDimensionEntries.immediate);
  entries.push(...buildThemeEntries(decl));
  entries.push(...buildAttrWrapperEntries(decl));
  entries.push(...buildPseudoExpandEntries(decl));
  entries.push(...buildPseudoAliasEntries(decl));
  entries.push(...buildCompoundVariantEntries(decl));
  entries.push(
    ...mergeOrderedEntries([variantDimensionEntries.ordered, variantAndStyleFnEntries.ordered]),
  );
  entries.push(...extraEntries.afterVariants);
  entries.push(...buildEnumVariantEntries(decl));
  entries.push(...buildCallSiteCombinedEntries(decl));
  entries.push(...buildPromotedStyleEntries(decl));
  if (decl.adjacentSiblingStyleKey) {
    entries.push({
      styleKey: decl.adjacentSiblingStyleKey,
      patchable: true,
      source: "adjacent",
    });
  }

  return entries;
}

function buildExtraStyleEntries(decl: StyledDecl): ExtraStyleEntryGroups {
  const groups: ExtraStyleEntryGroups = { beforeBase: [], afterBase: [], afterVariants: [] };
  const mixinOrder = decl.mixinOrder;
  const extraStyleKeys = decl.extraStyleKeys ?? [];
  const propsArgs = decl.extraStylexPropsArgs ?? [];
  const afterBaseKeys = new Set(decl.extraStyleKeysAfterBase ?? []);

  if (!mixinOrder || mixinOrder.length === 0) {
    for (const styleKey of extraStyleKeys) {
      const entry = styleKeyEntry(styleKey, afterBaseKeys.has(styleKey));
      if (afterBaseKeys.has(styleKey)) {
        groups.afterBase.push(entry);
      } else {
        groups.beforeBase.push(entry);
      }
    }
    for (let index = 0; index < propsArgs.length; index++) {
      pushPropsArgEntry(groups, decl, index, "afterBase");
    }
    return groups;
  }

  let styleKeyIndex = 0;
  let propsArgIndex = 0;
  for (const entryKind of mixinOrder) {
    if (entryKind === "styleKey" && styleKeyIndex < extraStyleKeys.length) {
      pushStyleKeyEntry(groups, extraStyleKeys[styleKeyIndex]!, afterBaseKeys);
      styleKeyIndex += 1;
    } else if (entryKind === "propsArg" && propsArgIndex < propsArgs.length) {
      pushPropsArgEntry(groups, decl, propsArgIndex, "beforeBase");
      propsArgIndex += 1;
    }
  }

  for (; styleKeyIndex < extraStyleKeys.length; styleKeyIndex++) {
    pushStyleKeyEntry(groups, extraStyleKeys[styleKeyIndex]!, afterBaseKeys);
  }
  for (; propsArgIndex < propsArgs.length; propsArgIndex++) {
    pushPropsArgEntry(groups, decl, propsArgIndex, "afterBase");
  }

  return groups;
}

function pushStyleKeyEntry(
  groups: ExtraStyleEntryGroups,
  styleKey: string,
  afterBaseKeys: ReadonlySet<string>,
): void {
  const afterBase = afterBaseKeys.has(styleKey);
  const entry = styleKeyEntry(styleKey, afterBase);
  if (afterBase) {
    groups.afterBase.push(entry);
  } else {
    groups.beforeBase.push(entry);
  }
}

function pushPropsArgEntry(
  groups: ExtraStyleEntryGroups,
  decl: StyledDecl,
  index: number,
  fallbackGroup: "beforeBase" | "afterBase",
): void {
  const arg = decl.extraStylexPropsArgs?.[index];
  const entry = propsArgEntry(decl, index);
  if (arg?.afterVariants) {
    groups.afterVariants.push(entry);
  } else if (arg?.afterBase || fallbackGroup === "afterBase") {
    groups.afterBase.push(entry);
  } else {
    groups.beforeBase.push(entry);
  }
}

function styleKeyEntry(styleKey: string, patchable: boolean): StyleSequenceEntry {
  return { styleKey, patchable, source: "mixin" };
}

function propsArgEntry(decl: StyledDecl, index: number): StyleSequenceEntry {
  return {
    styleKey: `${decl.styleKey}ExtraStylexPropsArg${index}`,
    patchable: false,
    contributesDynamic: true,
    source: "propsArg",
  };
}

function localBaseStyleKeys(ctx: TransformContext, decl: StyledDecl): string[] {
  if (decl.extendsStyleKey) {
    return [decl.extendsStyleKey];
  }
  const keys: string[] = [];
  const visited = new Set<string>([decl.localName]);
  let currentBase = decl.base;
  while (currentBase.kind === "component") {
    if (visited.has(currentBase.ident)) {
      break;
    }
    visited.add(currentBase.ident);
    const baseDecl = ctx.declByLocal?.get(currentBase.ident);
    if (!baseDecl || baseDecl.skipTransform) {
      break;
    }
    keys.push(baseDecl.styleKey);
    currentBase = baseDecl.base;
  }
  return keys.reverse();
}

function buildVariantAndStyleFnEntries(decl: StyledDecl): SequenceEntryGroup {
  const variantEntries = Object.entries(decl.variantStyleKeys ?? {}).map(([when, styleKey]) => ({
    when,
    entry: {
      styleKey,
      patchable: true,
      contributes: false,
      source: "variant",
    } satisfies StyleSequenceEntry,
  }));
  const styleFnEntries = (decl.styleFnFromProps ?? []).map((styleFn) => ({
    sourceOrder: styleFn.sourceOrder,
    entry: {
      styleKey: styleFn.fnKey,
      patchable: true,
      source: "styleFn",
    } satisfies StyleSequenceEntry,
  }));
  const hasSourceOrder =
    Object.keys(decl.variantSourceOrder ?? {}).length > 0 ||
    styleFnEntries.some((entry) => entry.sourceOrder !== undefined);

  if (!hasSourceOrder) {
    return {
      immediate: [
        ...variantEntries.map((entry) => entry.entry),
        ...styleFnEntries.map((entry) => entry.entry),
      ],
      ordered: [],
    };
  }

  const immediate = [
    ...variantEntries
      .filter((entry) => decl.variantSourceOrder?.[entry.when] === undefined)
      .map((entry) => entry.entry),
    ...styleFnEntries
      .filter((entry) => entry.sourceOrder === undefined)
      .map((entry) => entry.entry),
  ];

  const ordered: OrderedTailEntry[] = [];
  let index = 0;
  for (const variant of variantEntries) {
    const order = decl.variantSourceOrder?.[variant.when];
    if (order === undefined) {
      continue;
    }
    ordered.push({
      order,
      index,
      entry: variant.entry,
    });
    index += 1;
  }
  for (const styleFn of styleFnEntries) {
    if (styleFn.sourceOrder === undefined) {
      continue;
    }
    ordered.push({
      order: styleFn.sourceOrder,
      index,
      entry: styleFn.entry,
    });
    index += 1;
  }

  return {
    immediate,
    ordered,
  };
}

function buildVariantDimensionEntries(decl: StyledDecl): SequenceEntryGroup {
  const immediate: StyleSequenceEntry[] = [];
  const ordered: OrderedTailEntry[] = [];
  let index = 0;

  for (const dimension of decl.variantDimensions ?? []) {
    const entries: StyleSequenceEntry[] = Object.entries(dimension.variants).map(
      ([variantKey, styleObj]) =>
        ({
          styleKey: `${dimension.variantObjectName}.${variantKey}`,
          styleObj,
          patchable: true,
          contributes: false,
          source: "variant",
        }) satisfies StyleSequenceEntry,
    );
    if (dimension.fallbackFnKey) {
      entries.push({
        styleKey: dimension.fallbackFnKey,
        patchable: true,
        source: "styleFn",
      });
    }
    if (dimension.sourceOrder === undefined) {
      immediate.push(...entries);
      continue;
    }
    for (const entry of entries) {
      ordered.push({ order: dimension.sourceOrder, index, entry });
      index += 1;
    }
  }

  return {
    immediate,
    ordered,
  };
}

function mergeOrderedEntries(groups: OrderedTailEntry[][]): StyleSequenceEntry[] {
  return groups
    .flat()
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((orderedEntry) => orderedEntry.entry);
}

function buildPseudoExpandEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.pseudoExpandSelectors ?? []).map((entry) => ({
    styleKey: entry.styleKey,
    patchable: true,
    source: "pseudo",
  }));
}

function buildThemeEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const entries: StyleSequenceEntry[] = [];
  for (const hook of decl.needsUseThemeHook ?? []) {
    if (hook.trueStyleKey) {
      entries.push({
        styleKey: hook.trueStyleKey,
        patchable: true,
        contributes: false,
        source: "theme",
      });
    }
    if (hook.falseStyleKey) {
      entries.push({
        styleKey: hook.falseStyleKey,
        patchable: true,
        contributes: false,
        source: "theme",
      });
    }
  }
  return entries;
}

function buildPseudoAliasEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.pseudoAliasSelectors ?? []).flatMap((entry) =>
    entry.styleKeys.map(
      (styleKey) =>
        ({
          styleKey,
          patchable: true,
          contributes: false,
          source: "pseudo",
        }) satisfies StyleSequenceEntry,
    ),
  );
}

function buildCompoundVariantEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.compoundVariants ?? []).flatMap((entry) => {
    if (entry.kind === "3branch") {
      return [entry.outerTruthyKey, entry.innerTruthyKey, entry.innerFalsyKey].map(
        (styleKey) =>
          ({
            styleKey,
            patchable: true,
            contributes: false,
            source: "variant",
          }) satisfies StyleSequenceEntry,
      );
    }
    return [
      entry.outerTruthyInnerTruthyKey,
      entry.outerTruthyInnerFalsyKey,
      entry.outerFalsyInnerTruthyKey,
      entry.outerFalsyInnerFalsyKey,
    ].map(
      (styleKey) =>
        ({
          styleKey,
          patchable: true,
          contributes: false,
          source: "variant",
        }) satisfies StyleSequenceEntry,
    );
  });
}

function buildAttrWrapperEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const attrWrapper = decl.attrWrapper;
  if (!attrWrapper) {
    return [];
  }
  return [
    attrWrapper.checkboxKey,
    attrWrapper.radioKey,
    attrWrapper.readonlyKey,
    attrWrapper.externalKey,
    attrWrapper.httpsKey,
    attrWrapper.pdfKey,
  ]
    .filter((styleKey): styleKey is string => typeof styleKey === "string")
    .map(
      (styleKey) => ({ styleKey, patchable: true, source: "attr" }) satisfies StyleSequenceEntry,
    );
}

function buildCallSiteCombinedEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.callSiteCombinedStyles ?? []).map((entry) => ({
    styleKey: entry.styleKey,
    patchable: true,
    source: "combined",
  }));
}

function buildPromotedStyleEntries(decl: StyledDecl): StyleSequenceEntry[] {
  return (decl.promotedStyleProps ?? [])
    .filter((entry) => !entry.mergeIntoBase)
    .map((entry) => ({ styleKey: entry.styleKey, patchable: true, source: "promoted" }));
}

function buildEnumVariantEntries(decl: StyledDecl): StyleSequenceEntry[] {
  const enumVariant = decl.enumVariant;
  if (!enumVariant) {
    return [];
  }
  return [
    { styleKey: enumVariant.baseKey, patchable: true, source: "enum" } satisfies StyleSequenceEntry,
    ...enumVariant.cases.map(
      (entry) =>
        ({
          styleKey: entry.styleKey,
          patchable: true,
          source: "enum",
        }) satisfies StyleSequenceEntry,
    ),
  ];
}
