/**
 * Precompute helpers for mixins and base property values.
 */
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";

export const computeDeclBasePropValues = (
  decl: StyledDecl,
  cssValueToJs: (value: unknown, important?: boolean, propName?: string) => unknown,
): Map<string, unknown> => {
  const propValues = new Map<string, unknown>();
  for (const rule of decl.rules) {
    // Only process top-level rules (selector "&") for base values
    if (rule.selector.trim() !== "&") {
      continue;
    }
    for (const d of rule.declarations) {
      if (d.property && d.value.kind === "static") {
        const stylexDecls = cssDeclarationToStylexDeclarations(d);
        for (const sd of stylexDecls) {
          if (sd.value.kind === "static") {
            propValues.set(sd.prop, cssValueToJs(sd.value, d.important, sd.prop));
          }
        }
      } else if (d.property && d.value.kind === "interpolated") {
        const stylexDecls = cssDeclarationToStylexDeclarations(d);
        for (const sd of stylexDecls) {
          // Store a marker that this property comes from a composed style source
          // but its value is dynamic (resolved later).
          propValues.set(sd.prop, { __cssHelperDynamicValue: true, decl, declaration: d });
        }
      }
    }
  }
  return propValues;
};

/**
 * Determines if a styled component is simple enough to be used as a mixin.
 * Returns true only for components with static styles and no complex features.
 */
export const isSimpleMixin = (decl: StyledDecl): boolean => {
  // Bail if it has dynamic styles dependent on props
  if (decl.styleFnFromProps && decl.styleFnFromProps.length > 0) {
    return false;
  }
  // Bail if it has variant dimensions (prop-based variants)
  if (decl.variantDimensions && decl.variantDimensions.length > 0) {
    return false;
  }
  // Bail if it has enum variants
  if (decl.enumVariant) {
    return false;
  }
  // Bail if it has compound variants
  if (decl.compoundVariants && decl.compoundVariants.length > 0) {
    return false;
  }
  // Bail if it needs a wrapper component
  if (decl.needsWrapperComponent) {
    return false;
  }
  // Bail if it has attrs that affect styling
  if (decl.attrsInfo) {
    const { staticAttrs, conditionalAttrs, defaultAttrs } = decl.attrsInfo;
    if (
      Object.keys(staticAttrs).length > 0 ||
      conditionalAttrs.length > 0 ||
      (defaultAttrs && defaultAttrs.length > 0)
    ) {
      return false;
    }
  }
  // Bail if it has inline style props
  if (decl.inlineStyleProps && decl.inlineStyleProps.length > 0) {
    return false;
  }
  // Bail if it has variant style keys
  if (decl.variantStyleKeys && Object.keys(decl.variantStyleKeys).length > 0) {
    return false;
  }
  // Bail if it has extra stylex props args
  if (decl.extraStylexPropsArgs && decl.extraStylexPropsArgs.length > 0) {
    return false;
  }
  return true;
};

/**
 * Adds a style key to decl.extraStyleKeys and tracks order in decl.mixinOrder.
 * Returns true if the key was added (not already present).
 */
export const addStyleKeyMixin = (
  decl: StyledDecl,
  styleKey: string,
  options?: { afterBase?: boolean },
): boolean => {
  const extras = decl.extraStyleKeys ?? [];
  const order = decl.mixinOrder ?? [];
  if (extras.includes(styleKey)) {
    return false;
  }
  extras.push(styleKey);
  order.push("styleKey");
  decl.extraStyleKeys = extras;
  decl.mixinOrder = order;
  if (options?.afterBase) {
    const afterBase = decl.extraStyleKeysAfterBase ?? [];
    if (!afterBase.includes(styleKey)) {
      afterBase.push(styleKey);
    }
    decl.extraStyleKeysAfterBase = afterBase;
  }
  return true;
};

/**
 * Copies property values from a values map to the tracking map.
 */
export const trackMixinPropertyValues = (
  valuesMap: Map<string, unknown> | undefined,
  targetMap: Map<string, unknown>,
): void => {
  if (valuesMap) {
    for (const [prop, value] of valuesMap) {
      targetMap.set(prop, value);
    }
  }
};
