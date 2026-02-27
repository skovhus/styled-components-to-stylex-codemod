/**
 * Step: resolve and inline eligible styled(ImportedComponent) bases.
 * Core concepts: adapter-driven base resolution and conservative bailout behavior.
 */
import { isAbsolute as isAbsolutePath } from "node:path";
import type { ImportSource, ResolveBaseComponentStaticValue } from "../../adapter.js";
import type { CssRuleIR } from "../css-ir.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { toSuffixFromProp } from "../transform/helpers.js";
import { TransformContext } from "../transform-context.js";
import { readStaticJsxLiteral } from "./jsx-static-literal.js";

export function resolveBaseComponentsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls || styledDecls.length === 0) {
    return CONTINUE;
  }

  applyBaseComponentResolution(ctx, styledDecls);
  return CONTINUE;
}

// --- Non-exported helpers ---

type JsxPropResolutionOutcome =
  | { kind: "ok"; propsByUsage: Array<Record<string, ResolveBaseComponentStaticValue>> }
  | { kind: "bail" };
type InlineResolverVariantsOutcome =
  | {
      kind: "ok";
      variantDimensions: VariantDimension[];
      hasLocalCallsites: boolean;
      /** Subset of consumedProps that were actually passed at local call sites. */
      usedConsumedPropsAtCallSites: Set<string>;
      /**
       * Styles from consumed props whose single constant value was folded into the base.
       * These are merged into the base rule rather than creating a variant object.
       */
      foldedBaseSx: Record<string, string>;
      /**
       * Consumed props that were folded into base. Their JSX attributes are stripped
       * from all call sites — they no longer appear in the component's props.
       */
      bakedInConsumedProps: string[];
      /**
       * Single-key boolean variant styles for partial call sites (prop not passed at
       * every call site). These become entries in the main `styles` object with a
       * boolean condition guard, rather than a separate lookup object.
       */
      staticBooleanVariants: Array<{
        propName: string;
        styleKey: string;
        styles: Record<string, unknown>;
      }>;
    }
  | { kind: "bail" };

function applyBaseComponentResolution(ctx: TransformContext, styledDecls: StyledDecl[]): void {
  const resolveBaseComponent = ctx.resolveBaseComponent;
  if (!resolveBaseComponent) {
    return;
  }
  const importMap = ctx.importMap;
  if (!importMap) {
    return;
  }

  for (const decl of styledDecls) {
    if (decl.base.kind !== "component") {
      continue;
    }

    const importInfo = importMap.get(decl.base.ident);
    if (!importInfo) {
      continue;
    }

    const attrsInfo = decl.attrsInfo;
    if (!canResolveBaseFromAttrs(attrsInfo)) {
      continue;
    }

    const baseStaticProps = pickStaticLiteralProps(attrsInfo?.staticAttrs ?? {});
    const importSourceForAdapter = importSourceToString(importInfo.source);
    const baseResult = callResolveBaseComponentSafely({
      ctx,
      decl,
      resolveBaseComponent,
      importSource: importSourceForAdapter,
      importedName: importInfo.importedName,
      staticProps: baseStaticProps,
      phase: "base",
    });
    if (!baseResult || !isValidBaseResolutionResult(baseResult)) {
      continue;
    }

    const consumedProps = [...new Set(baseResult.consumedProps)];
    const variantOutcome = buildInlineResolverVariantDimensions({
      ctx,
      decl,
      consumedProps,
      baseStaticProps,
      baseResult,
      importSource: importSourceForAdapter,
      importedName: importInfo.importedName,
    });
    if (variantOutcome.kind === "bail") {
      continue;
    }

    inlineResolvedBaseComponent({
      ctx,
      decl,
      baseStaticProps,
      importSource: importSourceForAdapter,
      importedName: importInfo.importedName,
      baseResult,
      consumedProps,
      variantDimensions: variantOutcome.variantDimensions,
      hasLocalCallsites: variantOutcome.hasLocalCallsites,
      usedConsumedPropsAtCallSites: variantOutcome.usedConsumedPropsAtCallSites,
      foldedBaseSx: variantOutcome.foldedBaseSx,
      bakedInConsumedProps: variantOutcome.bakedInConsumedProps,
      staticBooleanVariants: variantOutcome.staticBooleanVariants,
    });
  }
}

function canResolveBaseFromAttrs(attrsInfo: StyledDecl["attrsInfo"]): boolean {
  if (!attrsInfo) {
    return true;
  }
  if (attrsInfo.sourceKind === "unknown") {
    return false;
  }
  if (attrsInfo.sourceKind === "function") {
    return false;
  }
  if (attrsInfo.sourceKind !== "object") {
    return false;
  }
  if (attrsInfo.hasUnsupportedValues) {
    return false;
  }
  if ((attrsInfo.defaultAttrs?.length ?? 0) > 0) {
    return false;
  }
  if ((attrsInfo.conditionalAttrs?.length ?? 0) > 0) {
    return false;
  }
  if ((attrsInfo.invertedBoolAttrs?.length ?? 0) > 0) {
    return false;
  }
  return true;
}

function pickStaticLiteralProps(
  staticAttrs: Record<string, unknown>,
): Record<string, ResolveBaseComponentStaticValue> {
  const out: Record<string, ResolveBaseComponentStaticValue> = {};
  for (const [key, value] of Object.entries(staticAttrs)) {
    if (isStaticLiteral(value)) {
      out[key] = value;
    }
  }
  return out;
}

function isStaticLiteral(value: unknown): value is ResolveBaseComponentStaticValue {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function importSourceToString(source: ImportSource): string {
  return source.value;
}

function isValidBaseResolutionResult(result: {
  tagName: string;
  consumedProps?: unknown;
  sx?: Record<string, string>;
  mixins?: Array<{ importSource: string; importName: string; styleKey: string }>;
}): result is {
  tagName: string;
  consumedProps: string[];
  sx?: Record<string, string>;
  mixins?: Array<{ importSource: string; importName: string; styleKey: string }>;
} {
  if (typeof result.tagName !== "string" || result.tagName.trim() === "") {
    return false;
  }
  if (
    !Array.isArray(result.consumedProps) ||
    result.consumedProps.some((prop) => typeof prop !== "string")
  ) {
    return false;
  }
  const hasSx = !!result.sx && Object.keys(result.sx).length > 0;
  const hasMixins = !!result.mixins && result.mixins.length > 0;
  return hasSx || hasMixins;
}

function buildInlineResolverVariantDimensions(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  consumedProps: string[];
  baseStaticProps: Record<string, ResolveBaseComponentStaticValue>;
  baseResult: {
    tagName: string;
    sx?: Record<string, string>;
    mixins?: Array<{ importSource: string; importName: string; styleKey: string }>;
  };
  importSource: string;
  importedName: string;
}): InlineResolverVariantsOutcome {
  const { ctx, decl, consumedProps, baseStaticProps, baseResult, importSource, importedName } =
    args;
  if (consumedProps.length === 0) {
    return {
      kind: "ok",
      variantDimensions: [],
      hasLocalCallsites: false,
      usedConsumedPropsAtCallSites: new Set(),
      foldedBaseSx: {},
      bakedInConsumedProps: [],
      staticBooleanVariants: [],
    };
  }

  const usageResult = collectStaticConsumedJsxProps({
    root: ctx.root,
    j: ctx.j,
    localName: decl.localName,
    consumedProps,
  });
  if (usageResult.kind === "bail") {
    return { kind: "bail" };
  }
  const hasLocalCallsites = usageResult.propsByUsage.length > 0;

  // Collect which consumed props actually appear at call sites (may be a strict subset).
  const usedConsumedPropsAtCallSites = new Set<string>();
  for (const siteProps of usageResult.propsByUsage) {
    for (const key of Object.keys(siteProps)) {
      usedConsumedPropsAtCallSites.add(key);
    }
  }

  if (usageResult.propsByUsage.length === 0) {
    // If all known resolver-driving values are from static attrs, we can still
    // inline the base declaration and skip per-callsite variant generation.
    if (canInlineWithoutLocalCallsites(consumedProps, baseStaticProps)) {
      return {
        kind: "ok",
        variantDimensions: [],
        hasLocalCallsites: false,
        usedConsumedPropsAtCallSites,
        foldedBaseSx: {},
        bakedInConsumedProps: [],
        staticBooleanVariants: [],
      };
    }
    return { kind: "bail" };
  }

  const resolveBaseComponent = ctx.resolveBaseComponent;
  if (!resolveBaseComponent) {
    return {
      kind: "ok",
      variantDimensions: [],
      hasLocalCallsites,
      usedConsumedPropsAtCallSites,
      foldedBaseSx: {},
      bakedInConsumedProps: [],
      staticBooleanVariants: [],
    };
  }

  const baseSx = baseResult.sx ?? {};
  const baseMixins = baseResult.mixins ?? [];
  const baseMixinKeys = new Set(baseMixins.map(toMixinKey));
  const resolvedByPropsKey = new Map<
    string,
    {
      siteProps: Record<string, ResolveBaseComponentStaticValue>;
      sxDiff: Record<string, unknown>;
      changedProps: string[];
    }
  >();

  for (const siteProps of usageResult.propsByUsage) {
    const mergedProps: Record<string, ResolveBaseComponentStaticValue> = {
      ...baseStaticProps,
      ...siteProps,
    };
    const propsKey = serializeStaticProps(mergedProps);
    if (resolvedByPropsKey.has(propsKey)) {
      continue;
    }

    const siteResult = callResolveBaseComponentSafely({
      ctx,
      decl,
      resolveBaseComponent,
      importSource,
      importedName,
      staticProps: mergedProps,
      phase: "site",
    });
    if (!siteResult || !isValidBaseResolutionResult(siteResult)) {
      return { kind: "bail" };
    }
    const changedProps = getChangedConsumedProps(baseStaticProps, siteProps, consumedProps);

    const siteMixins = siteResult.mixins ?? [];
    const siteMixinKeys = new Set(siteMixins.map(toMixinKey));
    for (const baseMixin of baseMixinKeys) {
      if (!siteMixinKeys.has(baseMixin)) {
        return { kind: "bail" };
      }
    }
    for (const siteMixin of siteMixinKeys) {
      if (!baseMixinKeys.has(siteMixin)) {
        // Per-site mixin diffs require conditional props args; keep v1 conservative.
        return { kind: "bail" };
      }
    }

    const sxDiff = diffSx(baseSx, siteResult.sx ?? {});
    if (sxDiff === "bail") {
      return { kind: "bail" };
    }

    if (siteResult.tagName !== baseResult.tagName) {
      return { kind: "bail" };
    }

    resolvedByPropsKey.set(propsKey, {
      siteProps,
      sxDiff,
      changedProps,
    });
  }

  const bucketsByProp = new Map<string, Map<string, Record<string, unknown>>>();
  for (const { siteProps, sxDiff, changedProps } of resolvedByPropsKey.values()) {
    if (changedProps.length === 0) {
      continue;
    }
    if (changedProps.length > 1) {
      // Ambiguous multi-prop interactions are out of scope for the simple resolver pass.
      return { kind: "bail" };
    }

    const propName = changedProps[0]!;
    const value = siteProps[propName];
    if (!isStaticLiteral(value)) {
      return { kind: "bail" };
    }
    const variantKey = String(value);
    const byValue = bucketsByProp.get(propName) ?? new Map<string, Record<string, unknown>>();
    const existing = byValue.get(variantKey);
    if (existing && serializeObject(existing) !== serializeObject(sxDiff)) {
      return { kind: "bail" };
    }
    byValue.set(variantKey, sxDiff);
    bucketsByProp.set(propName, byValue);
  }

  const dimensions: VariantDimension[] = [];
  const foldedBaseSx: Record<string, string> = {};
  const bakedInConsumedProps: string[] = [];
  const staticBooleanVariants: Array<{
    propName: string;
    styleKey: string;
    styles: Record<string, unknown>;
  }> = [];

  const totalCallSites = usageResult.propsByUsage.length;

  for (const [propName, byValue] of bucketsByProp) {
    const variants: Record<string, Record<string, unknown>> = {};
    for (const [valueKey, styles] of byValue) {
      if (Object.keys(styles).length === 0) {
        continue;
      }
      variants[valueKey] = styles;
    }
    if (Object.keys(variants).length === 0) {
      continue;
    }

    const variantKeys = Object.keys(variants);
    // Only block singleton folding when template expressions contain prop-referencing
    // functions (ArrowFunctionExpression / FunctionExpression). Static references like
    // `${SomeComponent.HEIGHT}` (MemberExpression) are constants that don't interact
    // with consumed props and should NOT prevent folding.
    const hasPropReferencingTemplateExpressions = (decl.templateExpressions ?? []).some((expr) => {
      const type = (expr as { type?: string })?.type;
      return type === "ArrowFunctionExpression" || type === "FunctionExpression";
    });

    if (variantKeys.length === 1 && !hasPropReferencingTemplateExpressions) {
      const callSitesWithProp = usageResult.propsByUsage.filter(
        (siteProps) => propName in siteProps,
      ).length;

      if (callSitesWithProp === totalCallSites) {
        // Every call site uses the same constant value — bake it into the base style.
        // The prop attribute is stripped from all call sites by inlineResolvedBaseComponent.
        const [, singleVariantStyles] = Object.entries(variants)[0]!;
        for (const [cssKey, cssVal] of Object.entries(singleVariantStyles)) {
          foldedBaseSx[cssKey] = String(cssVal);
        }
        bakedInConsumedProps.push(propName);
        continue;
      }

      // Single variant key, partial call sites: emit as a boolean conditional style
      // in the main `styles` object rather than a separate lookup object.
      // Only the boolean `true` key maps cleanly to a truthy condition (`prop &&`).
      const [singleKey, singleVariantStyles] = Object.entries(variants)[0]!;
      if (singleKey === "true") {
        staticBooleanVariants.push({
          propName,
          styleKey: `${decl.styleKey}${toSuffixFromProp(propName)}`,
          styles: singleVariantStyles,
        });
        continue;
      }
    }

    dimensions.push({
      propName,
      variantObjectName: `${decl.styleKey}${toSuffixFromProp(propName)}Variants`,
      variants,
      // Base-component-resolved props have no explicit type in the styled declaration, so
      // the emitter falls back to `any`. We need `as keyof typeof` to satisfy TypeScript,
      // and `isOptional` to emit the null guard (the prop may not be passed).
      isOptional: true,
      needsKeyofCast: true,
    });
  }

  return {
    kind: "ok",
    variantDimensions: dimensions,
    hasLocalCallsites,
    usedConsumedPropsAtCallSites,
    foldedBaseSx,
    bakedInConsumedProps,
    staticBooleanVariants,
  };
}

/**
 * Removes specific JSX prop attributes from every call site of a component.
 * Used when a prop has been folded into the base style (baked in) and no
 * longer needs to be passed at the call site.
 */
function stripBakedPropsFromCallSites(args: {
  root: any;
  j: any;
  localName: string;
  propsToStrip: Set<string>;
}): void {
  const { root, j, localName, propsToStrip } = args;
  const stripAttr = (attr: any): boolean => {
    if (!attr || attr.type !== "JSXAttribute") {
      return true;
    }
    if (attr.name?.type !== "JSXIdentifier") {
      return true;
    }
    return !propsToStrip.has(attr.name.name);
  };
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: "JSXIdentifier", name: localName } },
    } as any)
    .forEach((path: any) => {
      path.node.openingElement.attributes = path.node.openingElement.attributes.filter(stripAttr);
    });
  root
    .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
    .forEach((path: any) => {
      path.node.attributes = path.node.attributes.filter(stripAttr);
    });
}

function collectStaticConsumedJsxProps(args: {
  root: any;
  j: any;
  localName: string;
  consumedProps: string[];
}): JsxPropResolutionOutcome {
  const { root, j, localName, consumedProps } = args;
  const consumedSet = new Set(consumedProps);
  const propsByUsage: Array<Record<string, ResolveBaseComponentStaticValue>> = [];

  const collectFromAttributes = (attributes: any[] | undefined): "ok" | "bail" => {
    const siteProps: Record<string, ResolveBaseComponentStaticValue> = {};
    for (const attr of attributes ?? []) {
      if (!attr) {
        continue;
      }
      if (attr.type === "JSXSpreadAttribute") {
        return "bail";
      }
      if (attr.type !== "JSXAttribute" || attr.name?.type !== "JSXIdentifier") {
        continue;
      }
      const propName = attr.name.name;
      if (!consumedSet.has(propName)) {
        continue;
      }
      const literal = readStaticJsxLiteral(attr);
      if (literal === undefined) {
        return "bail";
      }
      siteProps[propName] = literal;
    }
    propsByUsage.push(siteProps);
    return "ok";
  };

  let shouldBail = false;
  root
    .find(j.JSXElement, {
      openingElement: {
        name: { type: "JSXIdentifier", name: localName },
      },
    } as any)
    .forEach((path: any) => {
      if (shouldBail) {
        return;
      }
      if (collectFromAttributes(path.node.openingElement?.attributes) === "bail") {
        shouldBail = true;
      }
    });
  root
    .find(j.JSXSelfClosingElement, { name: { type: "JSXIdentifier", name: localName } } as any)
    .forEach((path: any) => {
      if (shouldBail) {
        return;
      }
      if (collectFromAttributes(path.node.attributes) === "bail") {
        shouldBail = true;
      }
    });

  if (shouldBail) {
    return { kind: "bail" };
  }
  return { kind: "ok", propsByUsage };
}

function getChangedConsumedProps(
  baseStaticProps: Record<string, ResolveBaseComponentStaticValue>,
  siteProps: Record<string, ResolveBaseComponentStaticValue>,
  consumedProps: string[],
): string[] {
  const changed: string[] = [];
  for (const prop of consumedProps) {
    if (!(prop in siteProps)) {
      continue;
    }
    if (!(prop in baseStaticProps) || baseStaticProps[prop] !== siteProps[prop]) {
      changed.push(prop);
    }
  }
  return changed;
}

function diffSx(
  baseSx: Record<string, string>,
  siteSx: Record<string, string>,
): Record<string, unknown> | "bail" {
  const out: Record<string, unknown> = {};
  for (const [prop, baseValue] of Object.entries(baseSx)) {
    if (!(prop in siteSx)) {
      return "bail";
    }
    if (siteSx[prop] !== baseValue) {
      out[prop] = siteSx[prop]!;
    }
  }
  for (const [prop, value] of Object.entries(siteSx)) {
    if (!(prop in baseSx)) {
      out[prop] = value;
    }
  }
  return out;
}

function serializeStaticProps(props: Record<string, ResolveBaseComponentStaticValue>): string {
  const ordered = Object.keys(props)
    .sort()
    .map((key) => [key, props[key]]);
  return JSON.stringify(ordered);
}

function serializeObject(value: Record<string, unknown>): string {
  const ordered = Object.keys(value)
    .sort()
    .map((key) => [key, value[key]]);
  return JSON.stringify(ordered);
}

function inlineResolvedBaseComponent(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  baseStaticProps: Record<string, ResolveBaseComponentStaticValue>;
  importSource: string;
  importedName: string;
  baseResult: {
    tagName: string;
    consumedProps: string[];
    sx?: Record<string, string>;
    mixins?: Array<{ importSource: string; importName: string; styleKey: string }>;
  };
  consumedProps: string[];
  variantDimensions: VariantDimension[];
  hasLocalCallsites: boolean;
  usedConsumedPropsAtCallSites: Set<string>;
  foldedBaseSx: Record<string, string>;
  bakedInConsumedProps: string[];
  staticBooleanVariants: Array<{
    propName: string;
    styleKey: string;
    styles: Record<string, unknown>;
  }>;
}): void {
  const {
    ctx,
    decl,
    baseStaticProps,
    importSource,
    importedName,
    baseResult,
    consumedProps,
    variantDimensions,
    hasLocalCallsites,
    usedConsumedPropsAtCallSites,
    foldedBaseSx,
    bakedInConsumedProps,
    staticBooleanVariants,
  } = args;

  // Merge folded styles from singleton variants into the base sx
  const effectiveBaseSx =
    Object.keys(foldedBaseSx).length > 0 ? { ...baseResult.sx, ...foldedBaseSx } : baseResult.sx;
  const sxRule = createRuleFromStylexDeclarations(effectiveBaseSx);
  if (sxRule) {
    decl.rules = [sxRule, ...decl.rules];
  }

  if (baseResult.mixins && baseResult.mixins.length > 0) {
    const propsArgs = decl.extraStylexPropsArgs ?? [];
    const order = decl.mixinOrder ?? [];
    for (const mixin of baseResult.mixins) {
      const exprAst = ctx.parseExpr(`${mixin.importName}.${mixin.styleKey}`);
      if (!exprAst) {
        continue;
      }
      propsArgs.push({ expr: exprAst as any });
      order.push("propsArg");
      const importSpec = {
        from: stringToImportSource(mixin.importSource),
        names: [{ imported: mixin.importName }],
      };
      ctx.resolverImports.set(JSON.stringify(importSpec), importSpec);
    }
    if (propsArgs.length > 0) {
      decl.extraStylexPropsArgs = propsArgs;
      decl.mixinOrder = order;
    }
  }

  if (consumedProps.length > 0) {
    if (decl.attrsInfo) {
      for (const prop of consumedProps) {
        delete decl.attrsInfo.staticAttrs[prop];
      }
    }

    // Strip baked props from call sites: since every call site passes the same constant
    // value, the prop is redundant and can be removed from JSX entirely.
    if (bakedInConsumedProps.length > 0) {
      stripBakedPropsFromCallSites({
        root: ctx.root,
        j: ctx.j,
        localName: decl.localName,
        propsToStrip: new Set(bakedInConsumedProps),
      });
    }

    if (hasLocalCallsites) {
      // Only drop props that are actually passed at local call sites (excluding baked props,
      // which have been stripped from call sites entirely). Props not present at any call site
      // will never appear in `props` at runtime, so there is nothing to filter from `...rest`.
      const bakedSet = new Set(bakedInConsumedProps);
      const existing = new Set(decl.shouldForwardProp?.dropProps ?? []);
      for (const prop of consumedProps) {
        if (usedConsumedPropsAtCallSites.has(prop) && !bakedSet.has(prop)) {
          existing.add(prop);
        }
      }
      if (existing.size > 0) {
        decl.shouldForwardProp = {
          ...(decl.shouldForwardProp?.dropPrefix
            ? { dropPrefix: decl.shouldForwardProp.dropPrefix }
            : {}),
          dropProps: [...existing],
        };
      }
    }
  }

  decl.base = { kind: "intrinsic", tagName: baseResult.tagName };
  if (variantDimensions.length > 0) {
    decl.variantDimensions = [...(decl.variantDimensions ?? []), ...variantDimensions];
  }
  if (staticBooleanVariants.length > 0) {
    decl.staticBooleanVariants = [...(decl.staticBooleanVariants ?? []), ...staticBooleanVariants];
  }
  decl.inlinedBaseComponent = {
    importSource,
    importedName,
    baseResult,
    baseStaticProps,
    hasInlineJsxVariants: variantDimensions.length > 0,
  };
}

function createRuleFromStylexDeclarations(
  sx: Record<string, string> | undefined,
): CssRuleIR | undefined {
  if (!sx || Object.keys(sx).length === 0) {
    return undefined;
  }
  const declarations = Object.entries(sx).map(([property, value]) => ({
    property,
    value: { kind: "static" as const, value },
    important: false,
    valueRaw: value,
  }));
  return {
    selector: "&",
    atRuleStack: [],
    declarations,
  };
}

function stringToImportSource(importSource: string): ImportSource {
  if (isAbsolutePath(importSource)) {
    return { kind: "absolutePath", value: importSource };
  }
  return { kind: "specifier", value: importSource };
}

function toMixinKey(mixin: { importSource: string; importName: string; styleKey: string }): string {
  return `${mixin.importSource}::${mixin.importName}::${mixin.styleKey}`;
}

function callResolveBaseComponentSafely(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  resolveBaseComponent: NonNullable<TransformContext["resolveBaseComponent"]>;
  importSource: string;
  importedName: string;
  staticProps: Record<string, ResolveBaseComponentStaticValue>;
  phase: "base" | "site";
}): ReturnType<NonNullable<TransformContext["resolveBaseComponent"]>> {
  const { ctx, decl, resolveBaseComponent, importSource, importedName, staticProps, phase } = args;
  try {
    return resolveBaseComponent({
      importSource,
      importedName,
      staticProps,
      filePath: ctx.file.path,
    });
  } catch (error) {
    ctx.warnings.push({
      severity: "warning",
      type: "Adapter resolveBaseComponent threw an error",
      loc: decl.loc,
      context: {
        phase,
        componentName: decl.localName,
        importSource,
        importedName,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return undefined;
  }
}

function canInlineWithoutLocalCallsites(
  consumedProps: string[],
  baseStaticProps: Record<string, ResolveBaseComponentStaticValue>,
): boolean {
  if (consumedProps.length === 0) {
    return true;
  }
  const staticConsumedCount = consumedProps.filter((prop) =>
    Object.hasOwn(baseStaticProps, prop),
  ).length;
  return staticConsumedCount > 0;
}
