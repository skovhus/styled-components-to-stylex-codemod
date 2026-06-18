/**
 * Attrs-info inheritance/merge helpers extracted from analyze-before-emit.
 * Merge a base styled decl's `attrs` metadata into an extending decl, with the
 * extending decl's own attrs taking precedence on name collisions.
 */
import type { StyledDecl } from "../transform-types.js";

export function mergeInheritedAttrsInfo(
  baseAttrsInfo: NonNullable<StyledDecl["attrsInfo"]>,
  ownAttrsInfo: StyledDecl["attrsInfo"],
): NonNullable<StyledDecl["attrsInfo"]> {
  const ownAttrNames = collectAttrsInfoAttrNames(ownAttrsInfo);
  return {
    staticAttrs: {
      ...Object.fromEntries(
        Object.entries(baseAttrsInfo.staticAttrs ?? {}).filter(([key]) => !ownAttrNames.has(key)),
      ),
      ...ownAttrsInfo?.staticAttrs,
    },
    sourceKind: ownAttrsInfo?.sourceKind ?? baseAttrsInfo.sourceKind,
    hasUnsupportedValues:
      (baseAttrsInfo.hasUnsupportedValues ?? false) ||
      (ownAttrsInfo?.hasUnsupportedValues ?? false),
    attrsAsTag: ownAttrsInfo?.attrsAsTag ?? baseAttrsInfo.attrsAsTag,
    defaultAttrs: mergeAttrEntriesByAttrName(
      filterAttrEntriesByAttrName(baseAttrsInfo.defaultAttrs, ownAttrNames),
      ownAttrsInfo?.defaultAttrs,
    ),
    conditionalAttrs: [
      ...filterAttrEntriesByAttrName(baseAttrsInfo.conditionalAttrs, ownAttrNames),
      ...(ownAttrsInfo?.conditionalAttrs ?? []),
    ],
    invertedBoolAttrs: [
      ...filterAttrEntriesByAttrName(baseAttrsInfo.invertedBoolAttrs, ownAttrNames),
      ...(ownAttrsInfo?.invertedBoolAttrs ?? []),
    ],
    dynamicAttrs: mergeAttrEntriesByAttrName(
      filterAttrEntriesByAttrName(baseAttrsInfo.dynamicAttrs, ownAttrNames),
      ownAttrsInfo?.dynamicAttrs,
    ),
    attrsStaticStyles: {
      ...baseAttrsInfo.attrsStaticStyles,
      ...ownAttrsInfo?.attrsStaticStyles,
    },
    attrsStaticStyleExpr: ownAttrsInfo?.attrsStaticStyleExpr ?? baseAttrsInfo.attrsStaticStyleExpr,
    attrsDynamicStyles: [
      ...(baseAttrsInfo.attrsDynamicStyles ?? []),
      ...(ownAttrsInfo?.attrsDynamicStyles ?? []),
    ],
  };
}

function collectAttrsInfoAttrNames(attrsInfo: StyledDecl["attrsInfo"]): Set<string> {
  const names = new Set<string>();
  for (const key of Object.keys(attrsInfo?.staticAttrs ?? {})) {
    names.add(key);
  }
  for (const entry of attrsInfo?.defaultAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.dynamicAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.conditionalAttrs ?? []) {
    names.add(entry.attrName);
  }
  for (const entry of attrsInfo?.invertedBoolAttrs ?? []) {
    names.add(entry.attrName);
  }
  return names;
}

function filterAttrEntriesByAttrName<T extends { attrName: string }>(
  entries: T[] | undefined,
  names: ReadonlySet<string>,
): T[] {
  return (entries ?? []).filter((entry) => !names.has(entry.attrName));
}

function mergeAttrEntriesByAttrName<T extends { attrName: string }>(
  baseEntries: T[] | undefined,
  ownEntries: T[] | undefined,
): T[] {
  const byAttrName = new Map<string, T>();
  for (const entry of baseEntries ?? []) {
    byAttrName.set(entry.attrName, entry);
  }
  for (const entry of ownEntries ?? []) {
    byAttrName.set(entry.attrName, entry);
  }
  return [...byAttrName.values()];
}
