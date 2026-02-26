/**
 * Step: resolve and inline base components via adapter.resolveBaseComponent().
 * Core concepts: adapter-driven component resolution, style inlining, and prop consumption.
 */
import type { ResolveBaseComponentContext, ResolveBaseComponentResult } from "../../adapter.js";
import type { CssRuleIR } from "../css-ir.js";
import { TransformContext } from "../transform-context.js";
import {
  CONTINUE,
  type StepResult,
  type StyledDecl,
  type VariantDimension,
} from "../transform-types.js";
import { toStyleKey } from "../transform/helpers.js";

export { resolveBaseComponentsStep, sxToCssRules };

type ResolveBaseComponentFn = NonNullable<TransformContext["adapter"]["resolveBaseComponent"]>;

type StaticPropValue = string | number | boolean;

/**
 * Resolves base components (`styled(Flex)`) via the adapter and inlines their styles.
 *
 * Two-level resolution:
 * 1. Base resolution (attrs only): converts base to intrinsic, prepends CSS rules
 * 2. Per-site resolution (attrs + JSX props): creates variant dimensions for varying consumed props
 */
function resolveBaseComponentsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  const resolveBaseComponent = ctx.adapter.resolveBaseComponent;
  if (!styledDecls || !resolveBaseComponent || !ctx.importMap) {
    return CONTINUE;
  }

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }

    const importInfo = ctx.importMap.get(decl.base.ident);
    if (!importInfo) {
      continue;
    }

    const staticProps = extractStaticPropsFromAttrs(decl);
    if (staticProps === null) {
      continue;
    }

    const importSource =
      importInfo.source.kind === "specifier" ? importInfo.source.value : importInfo.source.value;

    const baseResult = resolveBaseComponent({
      importSource,
      importedName: importInfo.importedName,
      staticProps,
    });

    if (!baseResult) {
      continue;
    }

    applyResolution(decl, baseResult, ctx);

    resolvePerSiteProps({
      ctx,
      decl,
      baseResult,
      baseStaticProps: staticProps,
      resolveBaseComponent,
      resolveCtx: {
        importSource,
        importedName: importInfo.importedName,
        staticProps,
      },
    });
  }

  return CONTINUE;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract static props from `.attrs({...})`. Returns null if attrs are a function
 * (dynamic) or contain non-literal values for any prop — bail conditions.
 */
function extractStaticPropsFromAttrs(
  decl: StyledDecl,
): Record<string, string | number | boolean> | null {
  const attrs = decl.attrsInfo;
  if (!attrs) {
    return {};
  }

  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attrs.staticAttrs)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    }
    // Skip undefined/null values — they're not consumed by the resolver
  }

  return result;
}

/**
 * Apply the resolver result to a StyledDecl:
 * - Change base to intrinsic
 * - Prepend sx declarations as CSS rules (before template CSS, so template wins)
 * - Store mixin references as extraStylexPropsArgs
 * - Remove consumed props from staticAttrs
 * - Add consumed props to shouldForwardProp.dropProps
 * - Store result for downstream steps
 */
function applyResolution(
  decl: StyledDecl,
  result: ResolveBaseComponentResult,
  ctx: TransformContext,
): void {
  decl.base = { kind: "intrinsic", tagName: result.tagName };

  if (result.sx) {
    const sxRules = sxToCssRules(result.sx);
    decl.rules = [...sxRules, ...decl.rules];
  }

  if (result.mixins && result.mixins.length > 0) {
    const mixinArgs = result.mixins.map((mixin) => {
      const expr = ctx.parseExpr(`${mixin.importName}.${mixin.styleKey}`);

      ctx.resolverImports.set(
        JSON.stringify({ source: mixin.importSource, name: mixin.importName }),
        {
          from: { kind: "specifier", value: mixin.importSource },
          names: [{ imported: mixin.importName }],
        },
      );

      return { expr, afterBase: false };
    });

    decl.extraStylexPropsArgs = [...mixinArgs, ...(decl.extraStylexPropsArgs ?? [])];
  }

  removeConsumedPropsFromAttrs(decl, result.consumedProps);
  addConsumedPropsToDropList(decl, result.consumedProps);

  decl.inlinedBaseComponent = result;
}

/**
 * Convert a flat `sx` record (camelCase CSS prop → value) to CssRuleIR entries.
 * These go into the root `&` selector with no at-rule stack.
 */
function sxToCssRules(sx: Record<string, string>): CssRuleIR[] {
  const declarations = Object.entries(sx).map(([prop, value]) => ({
    property: camelToKebab(prop),
    value: { kind: "static" as const, value },
    important: false,
    valueRaw: value,
  }));

  if (declarations.length === 0) {
    return [];
  }

  return [{ selector: "&", atRuleStack: [], declarations }];
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Remove consumed props from the static attrs so they aren't forwarded to the DOM.
 */
function removeConsumedPropsFromAttrs(decl: StyledDecl, consumedProps: string[]): void {
  if (!decl.attrsInfo) {
    return;
  }
  const consumed = new Set(consumedProps);
  const remaining: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(decl.attrsInfo.staticAttrs)) {
    if (!consumed.has(key)) {
      remaining[key] = value;
    }
  }
  decl.attrsInfo.staticAttrs = remaining;
}

/**
 * Add consumed props to shouldForwardProp.dropProps so they're stripped from JSX
 * and destructured out of `{...rest}` in wrappers.
 */
function addConsumedPropsToDropList(decl: StyledDecl, consumedProps: string[]): void {
  if (consumedProps.length === 0) {
    return;
  }
  const existing = decl.shouldForwardProp?.dropProps ?? [];
  const existingSet = new Set(existing);
  const newProps = consumedProps.filter((p) => !existingSet.has(p));
  if (newProps.length === 0) {
    return;
  }
  decl.shouldForwardProp = {
    ...decl.shouldForwardProp,
    dropProps: [...existing, ...newProps],
  };
}

// ── Per-Site Resolution ──────────────────────────────────────────────────────

/**
 * Scans JSX usages of an inlined component, collects consumed prop values at each site,
 * and creates variant dimensions for props that vary across sites.
 *
 * Bail conditions (skip per-site resolution, keep base resolution only):
 * - Any JSX site has a spread attribute
 * - Any consumed prop at any JSX site has a non-literal value
 */
function resolvePerSiteProps(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  baseResult: ResolveBaseComponentResult;
  baseStaticProps: Record<string, StaticPropValue>;
  resolveBaseComponent: ResolveBaseComponentFn;
  resolveCtx: ResolveBaseComponentContext;
}): void {
  const { ctx, decl, baseResult, baseStaticProps, resolveBaseComponent, resolveCtx } = args;
  const { root, j } = ctx;
  const consumedPropNames = new Set(baseResult.consumedProps);

  const jsxSites = root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: decl.localName },
      },
    })
    .paths();

  if (jsxSites.length === 0) {
    return;
  }

  const siteProps = collectSiteConsumedProps(jsxSites, consumedPropNames);
  if (!siteProps) {
    return;
  }

  const varyingPropNames = findVaryingProps(siteProps, baseStaticProps, consumedPropNames);
  if (varyingPropNames.length === 0) {
    return;
  }

  const uniqueValueSets = collectUniqueValueSets(siteProps, varyingPropNames);
  if (uniqueValueSets.size === 0) {
    return;
  }

  const dimensions = buildVariantDimensions({
    decl,
    baseResult,
    baseStaticProps,
    resolveBaseComponent,
    resolveCtx,
    varyingPropNames,
    uniqueValueSets,
  });

  if (dimensions.length > 0) {
    decl.variantDimensions = [...(decl.variantDimensions ?? []), ...dimensions];
    decl.needsWrapperComponent = true;
  }
}

/**
 * Collect consumed prop values at each JSX site.
 * Returns null if any site has a spread or a non-literal consumed prop (bail).
 */
function collectSiteConsumedProps(
  jsxSites: Array<{ node: { openingElement: { attributes?: unknown[] } } }>,
  consumedPropNames: Set<string>,
): Array<Record<string, StaticPropValue>> | null {
  const result: Array<Record<string, StaticPropValue>> = [];

  for (const site of jsxSites) {
    const attrs = (site.node.openingElement.attributes ?? []) as Array<{
      type: string;
      name?: { type: string; name: string };
      value?: unknown;
    }>;

    if (attrs.some((a) => a.type === "JSXSpreadAttribute")) {
      return null;
    }

    const siteValues: Record<string, StaticPropValue> = {};
    for (const attr of attrs) {
      if (attr.type !== "JSXAttribute" || attr.name?.type !== "JSXIdentifier") {
        continue;
      }
      const name = attr.name.name;
      if (!consumedPropNames.has(name)) {
        continue;
      }

      const literalValue = extractJsxLiteralValue(attr.value);
      if (literalValue === undefined) {
        return null;
      }
      siteValues[name] = literalValue;
    }

    result.push(siteValues);
  }

  return result;
}

/**
 * Extract a literal value from a JSX attribute value node.
 * Returns undefined for non-literal (dynamic) values.
 */
function extractJsxLiteralValue(value: unknown): StaticPropValue | undefined {
  if (value === null || value === undefined) {
    return true;
  }

  const v = value as { type: string; value?: unknown; expression?: unknown };

  if (v.type === "StringLiteral" || (v.type === "Literal" && typeof v.value === "string")) {
    return v.value as string;
  }

  if (v.type === "JSXExpressionContainer") {
    const expr = v.expression as { type: string; value?: unknown };
    if (
      expr.type === "NumericLiteral" ||
      (expr.type === "Literal" && typeof expr.value === "number")
    ) {
      return expr.value as number;
    }
    if (
      expr.type === "BooleanLiteral" ||
      (expr.type === "Literal" && typeof expr.value === "boolean")
    ) {
      return expr.value as boolean;
    }
    if (
      expr.type === "StringLiteral" ||
      (expr.type === "Literal" && typeof expr.value === "string")
    ) {
      return expr.value as string;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Identify consumed props that vary across JSX sites (different values at different sites,
 * or present at some sites but not others).
 */
function findVaryingProps(
  siteProps: Array<Record<string, StaticPropValue>>,
  baseStaticProps: Record<string, StaticPropValue>,
  consumedPropNames: Set<string>,
): string[] {
  const varying: string[] = [];

  for (const propName of consumedPropNames) {
    if (propName in baseStaticProps) {
      continue;
    }

    const values = siteProps.map((site) => site[propName]);
    const allSame = values.every(
      (v) => v === values[0] || (v === undefined && values[0] === undefined),
    );
    if (!allSame || values.some((v) => v !== undefined)) {
      if (!allSame) {
        varying.push(propName);
      } else if (values[0] !== undefined) {
        varying.push(propName);
      }
    }
  }

  return varying;
}

/**
 * Collect unique value sets for varying props across sites.
 * Returns a map from serialized key to the value record.
 */
function collectUniqueValueSets(
  siteProps: Array<Record<string, StaticPropValue>>,
  varyingPropNames: string[],
): Map<string, Record<string, StaticPropValue>> {
  const uniqueSets = new Map<string, Record<string, StaticPropValue>>();

  for (const site of siteProps) {
    const subset: Record<string, StaticPropValue> = {};
    for (const name of varyingPropNames) {
      if (name in site) {
        subset[name] = site[name]!;
      }
    }
    if (Object.keys(subset).length > 0) {
      uniqueSets.set(JSON.stringify(subset), subset);
    }
  }

  return uniqueSets;
}

/**
 * Build variant dimensions from per-site resolution.
 * For each varying consumed prop, creates a VariantDimension with entries
 * for each unique value seen across JSX sites.
 */
function buildVariantDimensions(args: {
  decl: StyledDecl;
  baseResult: ResolveBaseComponentResult;
  baseStaticProps: Record<string, StaticPropValue>;
  resolveBaseComponent: ResolveBaseComponentFn;
  resolveCtx: ResolveBaseComponentContext;
  varyingPropNames: string[];
  uniqueValueSets: Map<string, Record<string, StaticPropValue>>;
}): VariantDimension[] {
  const { decl, baseResult, baseStaticProps, resolveBaseComponent, resolveCtx, varyingPropNames } =
    args;

  const perPropValues = new Map<string, Set<string>>();
  for (const propName of varyingPropNames) {
    perPropValues.set(propName, new Set());
  }

  for (const [, valueSet] of args.uniqueValueSets) {
    for (const propName of varyingPropNames) {
      if (propName in valueSet) {
        perPropValues.get(propName)!.add(String(valueSet[propName]));
      }
    }
  }

  const dimensions: VariantDimension[] = [];

  for (const propName of varyingPropNames) {
    const uniqueValues = perPropValues.get(propName);
    if (!uniqueValues || uniqueValues.size === 0) {
      continue;
    }

    const variants: Record<string, Record<string, unknown>> = {};

    for (const value of uniqueValues) {
      const mergedProps: Record<string, StaticPropValue> = {
        ...baseStaticProps,
        [propName]: coerceStringToOriginalType(value),
      };

      const perSiteResult = resolveBaseComponent({
        ...resolveCtx,
        staticProps: mergedProps,
      });

      if (!perSiteResult?.sx) {
        continue;
      }

      const additiveSx = diffSx(baseResult.sx ?? {}, perSiteResult.sx);
      if (Object.keys(additiveSx).length > 0) {
        variants[value] = additiveSx;
      }
    }

    if (Object.keys(variants).length > 0) {
      dimensions.push({
        propName,
        variantObjectName: `${toStyleKey(decl.localName)}${capitalize(propName)}Variants`,
        variants,
        isOptional: true,
      });
    }
  }

  return dimensions;
}

/**
 * Diff per-site sx against base sx. Returns properties in perSite that are not in base
 * or have different values.
 */
function diffSx(
  baseSx: Record<string, string>,
  perSiteSx: Record<string, string>,
): Record<string, string> {
  const diff: Record<string, string> = {};
  for (const [key, value] of Object.entries(perSiteSx)) {
    if (baseSx[key] !== value) {
      diff[key] = value;
    }
  }
  return diff;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function coerceStringToOriginalType(value: string): StaticPropValue {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") {
    return num;
  }
  return value;
}
