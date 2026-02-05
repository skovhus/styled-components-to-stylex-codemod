/**
 * Builds style expression arguments for stylex.props() calls in wrapper
 * components.
 *
 * Core concepts: extra style key splitting (before/after base), variant
 * dimension lookups, style-function call expressions from props, and
 * destructure-prop collection from style functions.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { buildStyleFnConditionExpr, collectIdentifiers } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./types.js";
import { collectConditionProps, makeConditionalStyleExpr } from "./variant-condition.js";
import type { WrapperEmitter } from "./wrapper-emitter.js";

// ---------------------------------------------------------------------------
// Extra style key splitting
// ---------------------------------------------------------------------------

/**
 * Splits a declaration's extra style keys into those that appear before and
 * after the base style in stylex.props() argument order.
 */
export function splitExtraStyleArgs(
  j: JSCodeshift,
  stylesIdentifier: string,
  d: StyledDecl,
): {
  beforeBase: ExpressionKind[];
  afterBase: ExpressionKind[];
} {
  const afterBaseKeys = new Set(d.extraStyleKeysAfterBase ?? []);
  const beforeBase: ExpressionKind[] = [];
  const afterBase: ExpressionKind[] = [];
  for (const key of d.extraStyleKeys ?? []) {
    const expr = j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key));
    if (afterBaseKeys.has(key)) {
      afterBase.push(expr);
    } else {
      beforeBase.push(expr);
    }
  }
  return { beforeBase, afterBase };
}

// ---------------------------------------------------------------------------
// Attrs-info / static-className splitting
// ---------------------------------------------------------------------------

/**
 * Extracts a static className value (if present) from attrsInfo.staticAttrs
 * so it can be passed to the style merger separately, and returns the
 * remaining attrsInfo without that className entry.
 */
export function splitAttrsInfo(
  j: JSCodeshift,
  attrsInfo: StyledDecl["attrsInfo"],
): {
  attrsInfo: StyledDecl["attrsInfo"];
  staticClassNameExpr?: ExpressionKind;
} {
  const className = attrsInfo?.staticAttrs?.className;
  if (!attrsInfo) {
    return { attrsInfo, staticClassNameExpr: undefined };
  }
  const normalized = {
    ...attrsInfo,
    staticAttrs: attrsInfo.staticAttrs ?? {},
    conditionalAttrs: attrsInfo.conditionalAttrs ?? [],
  };
  if (typeof className !== "string") {
    return { attrsInfo: normalized, staticClassNameExpr: undefined };
  }
  const { className: _omit, ...rest } = normalized.staticAttrs;
  return {
    attrsInfo: {
      ...normalized,
      staticAttrs: rest,
    },
    staticClassNameExpr: j.literal(className) as ExpressionKind,
  };
}

// ---------------------------------------------------------------------------
// Variant dimension lookups
// ---------------------------------------------------------------------------

/**
 * Build variant dimension lookup expressions for StyleX variants recipe
 * pattern.
 *
 * Generates:
 * - regular: `variantsObj[prop]` OR
 *   `variantsObj[prop as keyof typeof variantsObj] ?? variantsObj.default`
 * - namespace pair: `boolProp ? disabledVariants[prop] : enabledVariants[prop]`
 *
 * Optionally collects:
 * - `destructureProps`: props that must be destructured to use in expressions
 * - `propDefaults`: defaults for optional props (safe destructuring defaults)
 * - `namespaceBooleanProps`: boolean props that should be forwarded to wrapped
 *   components
 */
export function buildVariantDimensionLookups(
  j: JSCodeshift,
  args: {
    dimensions: VariantDimension[];
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propDefaults?: Map<string, string>;
    namespaceBooleanProps?: string[];
  },
): void {
  const { dimensions, styleArgs, destructureProps, propDefaults, namespaceBooleanProps } = args;

  // Group namespace dimensions by their boolean prop and propName
  const namespacePairs = new Map<
    string,
    { enabled?: VariantDimension; disabled?: VariantDimension }
  >();
  const regularDimensions: VariantDimension[] = [];

  for (const dim of dimensions) {
    if (dim.namespaceBooleanProp) {
      const key = `${dim.namespaceBooleanProp}:${dim.propName}`;
      const pair = namespacePairs.get(key) ?? {};
      if (dim.isDisabledNamespace) {
        pair.disabled = dim;
      } else {
        pair.enabled = dim;
      }
      namespacePairs.set(key, pair);
    } else {
      regularDimensions.push(dim);
    }
  }

  // Process regular (non-namespace) dimensions first
  for (const dim of regularDimensions) {
    if (destructureProps && !destructureProps.includes(dim.propName)) {
      destructureProps.push(dim.propName);
    }
    const variantsId = j.identifier(dim.variantObjectName);
    const propId = j.identifier(dim.propName);

    if (dim.defaultValue === "default") {
      const keyofExpr = {
        type: "TSTypeOperator",
        operator: "keyof",
        typeAnnotation: j.tsTypeQuery(j.identifier(dim.variantObjectName)),
      };
      const castProp = j.tsAsExpression(propId, keyofExpr as any);
      const lookup = j.memberExpression(variantsId, castProp, true /* computed */);
      const defaultAccess = j.memberExpression(
        j.identifier(dim.variantObjectName),
        j.identifier("default"),
      );
      styleArgs.push(j.logicalExpression("??", lookup, defaultAccess));
    } else {
      if (dim.defaultValue && dim.isOptional && propDefaults) {
        propDefaults.set(dim.propName, dim.defaultValue);
      }
      const lookup = j.memberExpression(variantsId, propId, true /* computed */);
      styleArgs.push(lookup);
    }
  }

  // Process namespace dimension pairs
  for (const [, pair] of namespacePairs) {
    const { enabled, disabled } = pair;
    if (!enabled || !disabled) {
      // Incomplete pair - emit each dimension separately as fallback
      for (const dim of [enabled, disabled]) {
        if (!dim) {
          continue;
        }
        if (destructureProps && !destructureProps.includes(dim.propName)) {
          destructureProps.push(dim.propName);
        }
        const lookup = j.memberExpression(
          j.identifier(dim.variantObjectName),
          j.identifier(dim.propName),
          true,
        );
        styleArgs.push(lookup);
      }
      continue;
    }

    const namespaceBooleanProp = enabled.namespaceBooleanProp;
    if (!namespaceBooleanProp) {
      // Skip if namespace boolean prop is not set
      continue;
    }

    if (destructureProps) {
      if (!destructureProps.includes(enabled.propName)) {
        destructureProps.push(enabled.propName);
      }
      if (!destructureProps.includes(namespaceBooleanProp)) {
        destructureProps.push(namespaceBooleanProp);
      }
    }

    if (namespaceBooleanProps && !namespaceBooleanProps.includes(namespaceBooleanProp)) {
      namespaceBooleanProps.push(namespaceBooleanProp);
    }

    if (
      enabled.defaultValue &&
      enabled.defaultValue !== "default" &&
      enabled.isOptional &&
      propDefaults
    ) {
      propDefaults.set(enabled.propName, enabled.defaultValue);
    }

    const boolPropId = j.identifier(namespaceBooleanProp);
    const propId = j.identifier(enabled.propName);

    const enabledLookup = j.memberExpression(j.identifier(enabled.variantObjectName), propId, true);
    const disabledLookup = j.memberExpression(
      j.identifier(disabled.variantObjectName),
      propId,
      true,
    );

    styleArgs.push(j.conditionalExpression(boolPropId, disabledLookup, enabledLookup));
  }
}

// ---------------------------------------------------------------------------
// Style-function expressions from props
// ---------------------------------------------------------------------------

/**
 * Build style function call expressions for dynamic prop-based styles.
 * This is a shared helper for handling `styleFnFromProps` consistently across
 * different wrapper types (component wrappers, intrinsic wrappers, etc.).
 *
 * @param emitter - The wrapper emitter instance (for type introspection methods)
 * @param args.d - The styled component declaration
 * @param args.styleArgs - Array to push generated style expressions into
 * @param args.destructureProps - Optional array to track props that need destructuring
 * @param args.propExprBuilder - Function to build the expression for accessing a prop
 * @param args.propsIdentifier - Identifier to use for "props" in __props case (defaults to "props")
 */
export function buildStyleFnExpressions(
  emitter: WrapperEmitter,
  args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propExprBuilder?: (jsxProp: string) => ExpressionKind;
    propsIdentifier?: ExpressionKind;
  },
): void {
  const { j, stylesIdentifier } = emitter;
  const { d, styleArgs, destructureProps } = args;
  const propsId = args.propsIdentifier ?? j.identifier("props");
  const propExprBuilder = args.propExprBuilder ?? ((prop: string) => j.identifier(prop));

  const styleFnPairs = d.styleFnFromProps ?? [];
  const explicitPropNames = d.propsType ? emitter.getExplicitPropNames(d.propsType) : null;

  const inferPropFromCallArg = (expr: ExpressionKind | null | undefined): string | null => {
    if (!expr || typeof expr !== "object") {
      return null;
    }
    const unwrap = (node: ExpressionKind): ExpressionKind => {
      let cur = node;
      while (cur && typeof cur === "object") {
        const t = (cur as { type?: string }).type;
        if (t === "ParenthesizedExpression") {
          cur = (cur as any).expression as ExpressionKind;
          continue;
        }
        if (t === "TSAsExpression" || t === "TSNonNullExpression") {
          cur = (cur as any).expression as ExpressionKind;
          continue;
        }
        if (t === "TemplateLiteral") {
          const exprs = (cur as any).expressions ?? [];
          if (exprs.length === 1) {
            cur = exprs[0] as ExpressionKind;
            continue;
          }
        }
        break;
      }
      return cur;
    };
    const unwrapped = unwrap(expr);
    if (unwrapped?.type === "Identifier") {
      return unwrapped.name;
    }
    if (unwrapped?.type === "ConditionalExpression") {
      const test = (unwrapped as any).test as ExpressionKind;
      if (test?.type === "Identifier") {
        return test.name;
      }
    }
    return null;
  };

  for (const p of styleFnPairs) {
    const propExpr = p.jsxProp === "__props" ? propsId : propExprBuilder(p.jsxProp);
    const callArg = p.callArg ?? propExpr;
    const call = j.callExpression(
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
      [callArg],
    );

    // Track call arg identifier for destructuring if needed
    if (p.callArg?.type === "Identifier") {
      const name = p.callArg.name;
      if (name && destructureProps && !destructureProps.includes(name)) {
        destructureProps.push(name);
      }
    }
    if (p.callArg && destructureProps) {
      const inferred = inferPropFromCallArg(p.callArg);
      if (inferred && !destructureProps.includes(inferred)) {
        destructureProps.push(inferred);
      }
    }
    if (p.callArg && destructureProps && explicitPropNames && explicitPropNames.size > 0) {
      const names = new Set<string>();
      collectIdentifiers(p.callArg, names);
      for (const name of names) {
        if (explicitPropNames.has(name) && !destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }

    // Track prop for destructuring
    if (p.jsxProp !== "__props" && destructureProps && !destructureProps.includes(p.jsxProp)) {
      destructureProps.push(p.jsxProp);
    }

    // Handle conditional style based on conditionWhen
    if (p.conditionWhen) {
      const { cond, isBoolean } = collectConditionProps(j, {
        when: p.conditionWhen,
        destructureProps,
      });
      styleArgs.push(makeConditionalStyleExpr(j, { cond, expr: call, isBoolean }));
      continue;
    }

    const isRequired =
      p.jsxProp === "__props" || emitter.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
    styleArgs.push(
      buildStyleFnConditionExpr({ j, condition: p.condition, propExpr, call, isRequired }),
    );
  }
}

// ---------------------------------------------------------------------------
// Destructure-prop collection from style functions
// ---------------------------------------------------------------------------

/**
 * Collects all props that need to be destructured based on styleFnFromProps,
 * explicit prop names used in styleArgs, and shouldForwardProp.dropProps.
 *
 * This is called after buildStyleFnExpressions to ensure all referenced
 * identifiers are properly destructured in the wrapper function.
 */
export function collectDestructurePropsFromStyleFns(
  emitter: WrapperEmitter,
  args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps: string[];
  },
): void {
  const { j } = emitter;
  const { d, styleArgs, destructureProps } = args;

  // Collect jsxProp and conditionWhen props from styleFnFromProps
  for (const p of d.styleFnFromProps ?? []) {
    if (p.jsxProp && p.jsxProp !== "__props" && !destructureProps.includes(p.jsxProp)) {
      destructureProps.push(p.jsxProp);
    }
    if (p.conditionWhen) {
      collectConditionProps(j, { when: p.conditionWhen, destructureProps });
    }
  }

  // Collect identifiers from styleArgs that match explicit prop names
  if (d.propsType) {
    const explicitProps = emitter.getExplicitPropNames(d.propsType);
    if (explicitProps.size > 0) {
      const used = new Set<string>();
      for (const arg of styleArgs) {
        collectIdentifiers(arg, used);
      }
      for (const name of used) {
        if (explicitProps.has(name) && !destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }
  }

  // Collect props that should be dropped (not forwarded to the element)
  for (const prop of d.shouldForwardProp?.dropProps ?? []) {
    if (prop && !destructureProps.includes(prop)) {
      destructureProps.push(prop);
    }
  }
}
