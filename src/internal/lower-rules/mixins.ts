import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";

export type CssValueToJs = (value: unknown, important?: boolean, propName?: string) => unknown;

export function computeDeclBasePropValues(args: {
  decl: StyledDecl;
  cssValueToJs: CssValueToJs;
}): Map<string, unknown> {
  const { decl, cssValueToJs } = args;
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
}

export function isSimpleMixin(decl: StyledDecl): boolean {
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
}

export function addStyleKeyMixin(decl: StyledDecl, styleKey: string): boolean {
  const extras = decl.extraStyleKeys ?? [];
  const order = decl.mixinOrder ?? [];
  if (extras.includes(styleKey)) {
    return false;
  }
  extras.push(styleKey);
  order.push("styleKey");
  decl.extraStyleKeys = extras;
  decl.mixinOrder = order;
  return true;
}

export function trackMixinPropertyValues(
  valuesMap: Map<string, unknown> | undefined,
  targetMap: Map<string, unknown>,
): void {
  if (valuesMap) {
    for (const [prop, value] of valuesMap) {
      targetMap.set(prop, value);
    }
  }
}
