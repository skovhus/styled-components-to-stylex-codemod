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
import {
  buildStyleFnConditionExpr,
  cloneAstNode,
  collectIdentifiers,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind, WrapperPropDefaults } from "./types.js";
import { collectBooleanPropNames } from "./type-helpers.js";
import {
  collectConditionProps,
  makeConditionalStyleExpr,
  parseVariantWhenToAst,
} from "./variant-condition.js";
import type { StatementKind, WrapperEmitter } from "./wrapper-emitter.js";

// ---------------------------------------------------------------------------
// keyof typeof cast helper
// ---------------------------------------------------------------------------

/**
 * Builds `propId as keyof typeof variantObjectName` — used when the prop type
 * is inferred as `any` and TypeScript rejects the computed index access.
 */
function buildKeyofTypeofCast(
  j: JSCodeshift,
  propId: ExpressionKind,
  variantObjectName: string,
): ExpressionKind {
  return j.tsAsExpression(propId, {
    type: "TSTypeOperator",
    operator: "keyof",
    typeAnnotation: j.tsTypeQuery(j.identifier(variantObjectName)),
  } as any);
}

// ---------------------------------------------------------------------------
// Base style member expression
// ---------------------------------------------------------------------------

/**
 * Returns the `styles.{styleKey}` member expression for the base style,
 * or an empty array when the key is a dynamic function (no static styles).
 * Suitable for spreading into `styleArgs`.
 */
export function baseStyleExpr(
  j: JSCodeshift,
  stylesIdentifier: string,
  d: StyledDecl,
): ExpressionKind[] {
  if (d.skipBaseStyleRef) {
    return [];
  }
  return [styleRef(j, stylesIdentifier, d.styleKey)];
}

/**
 * Builds a `styles.key` member expression for accessing a named style key.
 */
export function styleRef(j: JSCodeshift, stylesIdentifier: string, key: string): ExpressionKind {
  return j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)) as ExpressionKind;
}

/**
 * When a style function uses a `props` object parameter, wraps the raw call
 * argument in `{ [propsObjectKey]: rawArg }`. Returns `rawArg` unchanged when
 * `propsObjectKey` is not set.
 */
export function wrapCallArgForPropsObject(
  j: JSCodeshift,
  rawArg: ExpressionKind,
  propsObjectKey: string | undefined,
): ExpressionKind {
  if (!propsObjectKey) {
    return rawArg;
  }
  const prop = j.property("init", j.identifier(propsObjectKey), rawArg) as ReturnType<
    typeof j.property
  > & { shorthand?: boolean };
  if (rawArg.type === "Identifier" && rawArg.name === propsObjectKey) {
    prop.shorthand = true;
  }
  return j.objectExpression([prop]) as unknown as ExpressionKind;
}

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
    const expr = styleRef(j, stylesIdentifier, key);
    if (afterBaseKeys.has(key)) {
      afterBase.push(expr);
    } else {
      beforeBase.push(expr);
    }
  }
  return { beforeBase, afterBase };
}

/**
 * Builds interleaved before-base, after-base, and after-variants style args
 * using mixinOrder to correctly interleave extra style keys and extra
 * stylex.props args.
 *
 * When mixinOrder is present, it dictates the precise ordering of both
 * style keys and props args. The afterBase flag on props args determines
 * whether they appear before or after the base style. The afterVariants
 * flag places entries after all variant conditional styles (for CSS cascade).
 */
export function buildInterleavedExtraStyleArgs(
  j: JSCodeshift,
  stylesIdentifier: string,
  d: StyledDecl,
  propsArgExprs: ExpressionKind[],
): {
  beforeBase: ExpressionKind[];
  afterBase: ExpressionKind[];
  afterVariants: ExpressionKind[];
} {
  const mixinOrder = d.mixinOrder;
  const afterBaseKeys = new Set(d.extraStyleKeysAfterBase ?? []);
  const extraStyleKeys = d.extraStyleKeys ?? [];
  const propsArgs = d.extraStylexPropsArgs ?? [];

  if (!mixinOrder || mixinOrder.length === 0) {
    // No mixinOrder: fall back to legacy behavior
    const { beforeBase, afterBase } = splitExtraStyleArgs(j, stylesIdentifier, d);
    // Legacy: propsArgs go after base, unless afterVariants
    const afterVariants: ExpressionKind[] = [];
    for (let i = 0; i < propsArgExprs.length; i++) {
      if (propsArgs[i]?.afterVariants) {
        afterVariants.push(propsArgExprs[i]!);
      } else {
        afterBase.push(propsArgExprs[i]!);
      }
    }
    return { beforeBase, afterBase, afterVariants };
  }

  const beforeBase: ExpressionKind[] = [];
  const afterBase: ExpressionKind[] = [];
  const afterVariants: ExpressionKind[] = [];
  let styleKeyIdx = 0;
  let propsArgIdx = 0;

  for (const entry of mixinOrder) {
    if (entry === "styleKey" && styleKeyIdx < extraStyleKeys.length) {
      const key = extraStyleKeys[styleKeyIdx]!;
      styleKeyIdx++;
      const expr = styleRef(j, stylesIdentifier, key);
      if (afterBaseKeys.has(key)) {
        afterBase.push(expr);
      } else {
        beforeBase.push(expr);
      }
    } else if (entry === "propsArg" && propsArgIdx < propsArgExprs.length) {
      const arg = propsArgs[propsArgIdx];
      const argExpr = propsArgExprs[propsArgIdx]!;
      propsArgIdx++;
      if (arg?.afterVariants) {
        afterVariants.push(argExpr);
      } else if (arg?.afterBase) {
        afterBase.push(argExpr);
      } else {
        beforeBase.push(argExpr);
      }
    }
  }

  // Append any remaining items not covered by mixinOrder
  for (; styleKeyIdx < extraStyleKeys.length; styleKeyIdx++) {
    const key = extraStyleKeys[styleKeyIdx]!;
    const expr = styleRef(j, stylesIdentifier, key);
    if (afterBaseKeys.has(key)) {
      afterBase.push(expr);
    } else {
      beforeBase.push(expr);
    }
  }
  for (; propsArgIdx < propsArgExprs.length; propsArgIdx++) {
    const arg = propsArgs[propsArgIdx];
    if (arg?.afterVariants) {
      afterVariants.push(propsArgExprs[propsArgIdx]!);
    } else {
      afterBase.push(propsArgExprs[propsArgIdx]!);
    }
  }

  return { beforeBase, afterBase, afterVariants };
}

// ---------------------------------------------------------------------------
// Attrs-info / static-className splitting
// ---------------------------------------------------------------------------

/**
 * Build a static className expression combining an optional literal string
 * and/or a bridge class variable identifier.
 *
 * Returns `undefined` when neither is provided.
 */
export function buildStaticClassNameExpr(
  j: JSCodeshift,
  staticClassName: string | undefined,
  bridgeClassVar: string | undefined,
): ExpressionKind | undefined {
  if (staticClassName && bridgeClassVar) {
    const raw = escapeTemplateRaw(`${staticClassName} `);
    return j.templateLiteral(
      [
        j.templateElement({ raw, cooked: `${staticClassName} ` }, false),
        j.templateElement({ raw: "", cooked: "" }, true),
      ],
      [j.identifier(bridgeClassVar)],
    );
  }
  if (bridgeClassVar) {
    return j.identifier(bridgeClassVar);
  }
  if (staticClassName) {
    return j.literal(staticClassName) as ExpressionKind;
  }
  return undefined;
}

/**
 * Extracts a static className value (if present) from attrsInfo.staticAttrs
 * so it can be passed to the style merger separately, and returns the
 * remaining attrsInfo without that className entry.
 *
 * When `bridgeClassVar` is provided, it is used as an identifier expression
 * for the bridge class name. If a static className also exists, a template
 * literal combining both is produced.
 */
export function splitAttrsInfo(
  j: JSCodeshift,
  attrsInfo: StyledDecl["attrsInfo"],
  bridgeClassVar?: string,
): {
  attrsInfo: StyledDecl["attrsInfo"];
  staticClassNameExpr?: ExpressionKind;
} {
  const className = attrsInfo?.staticAttrs?.className;
  if (!attrsInfo) {
    return {
      attrsInfo,
      staticClassNameExpr: buildStaticClassNameExpr(j, undefined, bridgeClassVar),
    };
  }
  const normalized = {
    ...attrsInfo,
    staticAttrs: attrsInfo.staticAttrs ?? {},
    conditionalAttrs: attrsInfo.conditionalAttrs ?? [],
  };
  const hasStaticClassName = typeof className === "string";
  if (!hasStaticClassName && !bridgeClassVar) {
    return { attrsInfo: normalized, staticClassNameExpr: undefined };
  }

  const strippedAttrsInfo = hasStaticClassName
    ? (() => {
        const { className: _omit, ...rest } = normalized.staticAttrs;
        return { ...normalized, staticAttrs: rest };
      })()
    : normalized;

  return {
    attrsInfo: strippedAttrsInfo,
    staticClassNameExpr: buildStaticClassNameExpr(
      j,
      hasStaticClassName ? (className as string) : undefined,
      bridgeClassVar,
    ),
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
    propDefaults?: WrapperPropDefaults;
    namespaceBooleanProps?: string[];
    orderedEntries?: OrderedStyleEntry[];
  },
): void {
  const { dimensions, styleArgs, destructureProps, propDefaults, namespaceBooleanProps } = args;

  /** Push a style expression to orderedEntries (if source order available) or styleArgs. */
  const pushExpr = (expr: ExpressionKind, dim: VariantDimension): void => {
    if (args.orderedEntries && dim.sourceOrder !== undefined) {
      args.orderedEntries.push({ order: dim.sourceOrder, expr });
    } else {
      styleArgs.push(expr);
    }
  };

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

    // Boolean-only variant (isBooleanProp + single "true" key): emit `prop && variants.true`
    // Use dim.isBooleanProp to distinguish actual boolean props from string props
    // whose value happens to be "true" — the latter must use a computed lookup.
    const variantKeys = Object.keys(dim.variants);
    const isBooleanOnly =
      dim.isBooleanProp && variantKeys.length === 1 && variantKeys[0] === "true";

    if (isBooleanOnly) {
      const lookup = j.memberExpression(variantsId, j.identifier("true"));
      if (dim.isOptional) {
        pushExpr(j.logicalExpression("&&", propId, lookup), dim);
      } else {
        pushExpr(lookup, dim);
      }
    } else if (dim.defaultValue === "default") {
      const castProp = buildKeyofTypeofCast(j, propId, dim.variantObjectName);
      const lookup = j.memberExpression(variantsId, castProp, true /* computed */);
      const defaultAccess = j.memberExpression(
        j.identifier(dim.variantObjectName),
        j.identifier("default"),
      );
      pushExpr(j.logicalExpression("??", lookup, defaultAccess), dim);
    } else {
      if (dim.defaultValue && dim.isOptional && propDefaults) {
        propDefaults.set(dim.propName, dim.defaultValue);
      }
      const lookup = j.memberExpression(variantsId, propId, true /* computed */);
      // Guard optional props without defaults to avoid `undefined` index type error
      if (dim.isOptional && !dim.defaultValue) {
        const guard = j.binaryExpression("!=", j.identifier(dim.propName), j.literal(null));
        pushExpr(j.logicalExpression("&&", guard, lookup), dim);
      } else {
        pushExpr(lookup, dim);
      }
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
        pushExpr(lookup, dim);
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

    pushExpr(j.conditionalExpression(boolPropId, disabledLookup, enabledLookup), enabled);
  }
}

// ---------------------------------------------------------------------------
// Style-function expressions from props
// ---------------------------------------------------------------------------

/** Entry with a source-order tag for CSS cascade interleaving. */
export type OrderedStyleEntry = { order: number; expr: ExpressionKind };

/**
 * Sort ordered entries by source order and append them to styleArgs.
 * Used to merge variant and styleFn entries while preserving CSS cascade order.
 */
export function mergeOrderedEntries(
  orderedEntries: OrderedStyleEntry[],
  styleArgs: ExpressionKind[],
): void {
  if (orderedEntries.length === 0) {
    return;
  }
  orderedEntries.sort((a, b) => a.order - b.order);
  for (const entry of orderedEntries) {
    styleArgs.push(entry.expr);
  }
}

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
 * @param args.orderedEntries - When provided, entries with sourceOrder are pushed here instead
 *   of styleArgs. The caller is responsible for sorting and merging them into styleArgs.
 */
export function buildStyleFnExpressions(
  emitter: WrapperEmitter,
  args: {
    d: StyledDecl;
    styleArgs: ExpressionKind[];
    destructureProps?: string[];
    propExprBuilder?: (jsxProp: string) => ExpressionKind;
    propsIdentifier?: ExpressionKind;
    orderedEntries?: OrderedStyleEntry[];
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

  const booleanProps = collectBooleanPropNames(d);

  for (const p of styleFnPairs) {
    const propExpr = p.jsxProp === "__props" ? propsId : propExprBuilder(p.jsxProp);
    const rawCallArg = p.callArg ?? propExpr;
    const callArg = wrapCallArgForPropsObject(j, rawCallArg, p.propsObjectKey);
    const call = j.callExpression(styleRef(j, stylesIdentifier, p.fnKey), [callArg]);

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

    /** Push a style expression to orderedEntries (if source order available) or styleArgs. */
    const pushExpr = (expr: ExpressionKind): void => {
      if (args.orderedEntries && p.sourceOrder !== undefined) {
        args.orderedEntries.push({ order: p.sourceOrder, expr });
      } else {
        styleArgs.push(expr);
      }
    };

    // Handle conditional style based on conditionWhen
    if (p.conditionWhen) {
      const { cond, isBoolean } = collectConditionProps(j, {
        when: p.conditionWhen,
        destructureProps,
        booleanProps,
      });
      pushExpr(makeConditionalStyleExpr(j, { cond, expr: call, isBoolean }));
      continue;
    }

    const isRequired =
      p.jsxProp === "__props" || emitter.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
    pushExpr(
      buildStyleFnConditionExpr({
        j,
        condition: p.condition,
        propExpr,
        call,
        isRequired,
      }),
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

// ---------------------------------------------------------------------------
// Template literal escaping
// ---------------------------------------------------------------------------

/** Escape characters that are special inside template literal quasi strings. */
function escapeTemplateRaw(s: string): string {
  return s.replace(/\\|`|\$\{/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Theme boolean & pseudo style-arg helpers
// ---------------------------------------------------------------------------

/**
 * Appends conditional style args driven by theme boolean props (e.g., `theme.isDark`).
 * Returns `true` if the hook is needed (and calls `markNeedsUseThemeImport`).
 */
export function appendThemeBooleanStyleArgs(
  hooks: StyledDecl["needsUseThemeHook"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
  markNeedsUseThemeImport: () => void,
): boolean {
  if (!hooks || hooks.length === 0) {
    return false;
  }
  markNeedsUseThemeImport();
  for (const entry of hooks) {
    // Skip entries used only for triggering useTheme import/declaration
    // (e.g., when the theme conditional uses inline styles instead of style buckets)
    if (!entry.trueStyleKey && !entry.falseStyleKey) {
      continue;
    }
    const trueExpr = entry.trueStyleKey
      ? styleRef(j, stylesIdentifier, entry.trueStyleKey)
      : (j.identifier("undefined") as ExpressionKind);
    const falseExpr = entry.falseStyleKey
      ? styleRef(j, stylesIdentifier, entry.falseStyleKey)
      : (j.identifier("undefined") as ExpressionKind);
    const condition = entry.conditionExpr
      ? (cloneAstNode(entry.conditionExpr) as ExpressionKind)
      : j.memberExpression(j.identifier("theme"), j.identifier(entry.themeProp));
    styleArgs.push(j.conditionalExpression(condition, trueExpr, falseExpr));
  }
  return true;
}

/**
 * Shared logic for appending style args with optional guard wrapping.
 * Each entry is mapped to an expression via `buildExpr`, then optionally
 * wrapped in a conditional if the entry has a `guard`.
 */
function appendGuardedStyleArgs<T extends { guard?: { when: string } }>(
  entries: T[],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  buildExpr: (entry: T) => ExpressionKind,
  booleanProps?: ReadonlySet<string>,
): string[] {
  const guardProps: string[] = [];
  for (const entry of entries) {
    const expr = buildExpr(entry);
    if (entry.guard) {
      const parsed = parseVariantWhenToAst(j, entry.guard.when, booleanProps);
      for (const p of parsed.props) {
        if (p && !guardProps.includes(p)) {
          guardProps.push(p);
        }
      }
      styleArgs.push(
        makeConditionalStyleExpr(j, {
          cond: parsed.cond,
          expr,
          isBoolean: parsed.isBoolean,
        }),
      );
    } else {
      styleArgs.push(expr);
    }
  }
  return guardProps;
}

/**
 * Appends pseudo-alias style args to `styleArgs`.
 *
 * Emits `selectorExpr({ active: styles.keyActive, hover: styles.keyHover })` as a single arg.
 * When the entry has a `guard`, the call is wrapped: `cond && selectorExpr(...)`.
 *
 * Returns the list of guard prop names that need destructuring.
 */
function appendPseudoAliasStyleArgs(
  entries: StyledDecl["pseudoAliasSelectors"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
): string[] {
  if (!entries?.length) {
    return [];
  }
  return appendGuardedStyleArgs(entries, styleArgs, j, (entry) => {
    const properties = entry.pseudoNames.map((name, i) =>
      j.property(
        "init",
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? j.identifier(name) : j.literal(name),
        styleRef(j, stylesIdentifier, entry.styleKeys[i]!),
      ),
    );
    return j.callExpression(cloneAstNode(entry.styleSelectorExpr) as ExpressionKind, [
      j.objectExpression(properties),
    ]) as ExpressionKind;
  });
}

/**
 * Appends pseudo-expand style args as static `styles.key` references.
 * When the entry has a `guard`, the ref is wrapped: `cond && styles.key`.
 *
 * Returns the list of guard prop names that need destructuring.
 */
function appendPseudoExpandStyleArgs(
  entries: StyledDecl["pseudoExpandSelectors"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
): string[] {
  if (!entries?.length) {
    return [];
  }
  return appendGuardedStyleArgs(
    entries,
    styleArgs,
    j,
    (entry) =>
      j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(entry.styleKey),
      ) as ExpressionKind,
  );
}

/**
 * Appends both pseudo-alias and pseudo-expand style args, deduplicating guard props.
 * Returns the combined list of guard prop names that need destructuring.
 */
export function appendAllPseudoStyleArgs(
  d: Pick<StyledDecl, "pseudoAliasSelectors" | "pseudoExpandSelectors">,
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
): string[] {
  const guardProps = appendPseudoAliasStyleArgs(
    d.pseudoAliasSelectors,
    styleArgs,
    j,
    stylesIdentifier,
  );
  for (const gp of appendPseudoExpandStyleArgs(
    d.pseudoExpandSelectors,
    styleArgs,
    j,
    stylesIdentifier,
  )) {
    if (!guardProps.includes(gp)) {
      guardProps.push(gp);
    }
  }
  return guardProps;
}

/** Builds a `const theme = useTheme();` variable declaration. */
export function buildUseThemeDeclaration(
  j: JSCodeshift,
  themeHookFunctionName: string,
): StatementKind {
  return j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier("theme"),
      j.callExpression(j.identifier(themeHookFunctionName), []),
    ),
  ]);
}
