/**
 * Per-decl correctness guards run during finalize: detect transforms that would
 * silently change semantics and should bail instead.
 */
import type { StyledDecl } from "../transform-types.js";
import { escapeRegex } from "../utilities/string-utils.js";

export { findImportedRootPropCollision, hasConflictingLogicalPhysicalScrollProps };

/**
 * Returns the name of an imported runtime-condition root (recorded in
 * `nonPropConditionRoots`) that also appears as a genuine component prop. Such a
 * collision is unrepresentable: the decl-wide non-prop marking suppresses
 * destructuring of the prop, so a prop-based variant would silently read the
 * imported binding instead. Covers both typed props and props inferred from
 * `props.<name>` usage in styling.
 *
 * `variantWhens` must be sourced from the in-progress finalize state, since
 * `decl.variantStyleKeys` is not assigned until later in finalize.
 */
function findImportedRootPropCollision(
  decl: StyledDecl,
  variantWhens: readonly string[],
): string | null {
  const roots = decl.nonPropConditionRoots;
  if (!roots || roots.size === 0) {
    return null;
  }
  const directProps = collectDirectPropReferences(decl);
  for (const root of roots) {
    if (directProps.has(root)) {
      return root;
    }
    // A bare reference in a variant condition (e.g. `browser`) is a genuine prop;
    // the imported condition uses member access (`browser.isTouchDevice`) and is
    // excluded by requiring the root not be followed by `.` or another word char.
    const bareRef = new RegExp(`(?:^|[^\\w.])${escapeRegex(root)}(?:$|[^\\w.])`);
    if (variantWhens.some((when) => bareRef.test(when))) {
      return root;
    }
  }
  return null;
}

/**
 * Returns true when the component declares both a logical scroll longhand
 * (e.g. `scroll-padding-inline-start`) and a physical scroll side
 * (e.g. `scroll-padding-left`) in the same scroll family. StyleX's
 * logical/physical conflict normalization resolves these to physical sides
 * assuming horizontal-tb LTR, but the logical-to-physical mapping depends on
 * `writing-mode`/`direction` (e.g. `inline-start` is the right side in RTL),
 * so any such mix may silently preserve or override the wrong side — bail.
 */
function hasConflictingLogicalPhysicalScrollProps(decl: StyledDecl): boolean {
  for (const family of SCROLL_FAMILIES) {
    let hasLogical = false;
    let hasPhysical = false;
    for (const rule of decl.rules) {
      for (const declaration of rule.declarations) {
        const prop = declaration.property?.trim();
        if (!prop) {
          continue;
        }
        const camel = kebabToCamel(prop);
        if (!camel.startsWith(family)) {
          continue;
        }
        const side = camel.slice(family.length);
        if (/^(?:Inline|Block)/.test(side)) {
          hasLogical = true;
        } else if (side === "" || /^(?:Top|Right|Bottom|Left)$/.test(side)) {
          // The full `scroll-margin`/`scroll-padding` shorthand (side === "")
          // expands to physical Top/Right/Bottom/Left longhands, so treat it as
          // a physical declaration for this conflict check.
          hasPhysical = true;
        }
      }
    }
    if (hasLogical && hasPhysical) {
      return true;
    }
  }
  return false;
}

const SCROLL_FAMILIES = ["scrollMargin", "scrollPadding"] as const;

function collectDirectPropReferences(decl: StyledDecl): Set<string> {
  const props = new Set<string>();
  const add = (name: string | null | undefined): void => {
    if (name && !name.startsWith("__")) {
      props.add(name);
    }
  };
  for (const name of decl.typeScriptExplicitPropNames ?? []) {
    add(name);
  }
  for (const entry of decl.styleFnFromProps ?? []) {
    add(entry.jsxProp);
    for (const extra of entry.extraCallArgs ?? []) {
      add(extra.jsxProp);
    }
  }
  for (const entry of decl.inlineStyleProps ?? []) {
    add(entry.jsxProp);
  }
  for (const dim of decl.variantDimensions ?? []) {
    add(dim.propName);
    add(dim.namespaceBooleanProp);
  }
  for (const cv of decl.compoundVariants ?? []) {
    add(cv.outerProp);
    add(cv.innerProp);
  }
  const attrs = decl.attrsInfo;
  if (attrs) {
    for (const entry of attrs.defaultAttrs ?? []) {
      add(entry.jsxProp);
    }
    for (const entry of attrs.dynamicAttrs ?? []) {
      add(entry.jsxProp);
    }
    for (const entry of attrs.conditionalAttrs ?? []) {
      add(entry.jsxProp);
    }
    for (const entry of attrs.invertedBoolAttrs ?? []) {
      add(entry.jsxProp);
    }
    for (const entry of attrs.attrsDynamicStyles ?? []) {
      add(entry.jsxProp);
    }
  }
  return props;
}

function kebabToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
