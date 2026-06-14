/**
 * Per-decl correctness guards run during finalize: detect transforms that would
 * silently change semantics and should bail instead.
 */
import type { StyledDecl } from "../transform-types.js";
import { LOGICAL_TO_PHYSICAL } from "../stylex-shorthands.js";
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
 * (e.g. `scroll-padding-inline-start`) and a physical scroll side it maps to
 * (e.g. `scroll-padding-left`). StyleX's logical/physical conflict
 * normalization resolves these to physical sides assuming horizontal-tb, which
 * silently drops the logical value's RTL/vertical behavior, so bail.
 */
function hasConflictingLogicalPhysicalScrollProps(decl: StyledDecl): boolean {
  const declaredScrollProps = new Set<string>();
  for (const rule of decl.rules) {
    for (const declaration of rule.declarations) {
      const prop = declaration.property?.trim();
      if (prop && /^scroll-(margin|padding)-/.test(prop)) {
        declaredScrollProps.add(kebabToCamel(prop));
      }
    }
  }
  if (declaredScrollProps.size === 0) {
    return false;
  }
  for (const prop of declaredScrollProps) {
    const physicalSides = LOGICAL_TO_PHYSICAL[prop];
    if (physicalSides && physicalSides.some((side) => declaredScrollProps.has(side))) {
      return true;
    }
  }
  return false;
}

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
  return props;
}

function kebabToCamel(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
