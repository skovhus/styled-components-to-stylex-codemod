/**
 * Step: resolve and inline eligible styled(ImportedComponent) bases.
 * Core concepts: adapter-driven base resolution and conservative bailout behavior.
 */
import { isAbsolute as isAbsolutePath } from "node:path";
import type { ImportSource, ResolveBaseComponentStaticValue } from "../../adapter.js";
import type { CssRuleIR } from "../css-ir.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import type {
  CallSiteCombinedStyle,
  StaticBooleanVariant,
  StyledDecl,
  VariantDimension,
} from "../transform-types.js";
import { toStyleKey, toSuffixFromProp } from "../transform/helpers.js";
import { TransformContext } from "../transform-context.js";
import { readStaticJsxLiteral } from "./jsx-static-literal.js";

export function resolveBaseComponentsStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls as StyledDecl[] | undefined;
  if (!styledDecls) {
    return CONTINUE;
  }

  if (styledDecls.length > 0) {
    applyBaseComponentResolution(ctx, styledDecls);
  }
  resolveDirectJsxUsages(ctx, styledDecls);
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
      staticBooleanVariants: StaticBooleanVariant[];
      /**
       * Combined per-call-site styles for direct JSX resolution. Merges individual
       * single-key variant styles into one entry per unique prop combination.
       */
      callSiteCombinedStyles: CallSiteCombinedStyle[];
    }
  | { kind: "bail" };

/**
 * Checks whether a styled component will have external interface support
 * (className/style props + `{...rest}` spread). When true, external callers
 * can pass arbitrary props, making singleton folding unsafe.
 *
 * Mirrors the logic in `analyzeBeforeEmitStep` for determining
 * `supportsExternalStyles`, but evaluated earlier in the pipeline.
 */
function willHaveExternalInterface(
  ctx: TransformContext,
  decl: StyledDecl,
  styledDecls: StyledDecl[],
): boolean {
  // 1. Extended by another styled component in the same file → always has external styles
  const isExtendedBy = styledDecls.some(
    (d) => d !== decl && d.base.kind === "component" && d.base.ident === decl.localName,
  );
  if (isExtendedBy) {
    return true;
  }

  // 2. Not exported → no external interface
  const exportInfo = findExportInfo(ctx, decl.localName);
  if (!exportInfo) {
    return false;
  }

  // 3. Exported → query adapter
  const result = ctx.adapter.externalInterface({
    filePath: ctx.file.path,
    componentName: decl.localName,
    exportName: exportInfo.exportName,
    isDefaultExport: exportInfo.isDefault,
  });
  return result.styles || result.as;
}

/** Finds export info for a local name, or undefined if not exported. */
function findExportInfo(
  ctx: TransformContext,
  localName: string,
): { exportName: string; isDefault: boolean } | undefined {
  const { root, j } = ctx;
  let result: { exportName: string; isDefault: boolean } | undefined;
  root.find(j.ExportNamedDeclaration).forEach((p) => {
    if (result) {
      return;
    }
    const decl = p.node.declaration;
    if (decl?.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.type === "VariableDeclarator" && (d.id as { name?: string })?.name === localName) {
          result = { exportName: localName, isDefault: false };
        }
      }
    }
    for (const spec of p.node.specifiers ?? []) {
      if (
        spec.type === "ExportSpecifier" &&
        (spec.local as { name?: string })?.name === localName
      ) {
        const exportedName = (spec.exported as { name?: string })?.name ?? localName;
        result = { exportName: exportedName, isDefault: false };
      }
    }
  });
  if (!result) {
    root.find(j.ExportDefaultDeclaration).forEach((p) => {
      if ((p.node.declaration as { name?: string })?.name === localName) {
        result = { exportName: "default", isDefault: true };
      }
    });
  }
  return result;
}

/** Constructs an "ok" InlineResolverVariantsOutcome with no variants and empty defaults. */
function emptyOkVariantOutcome(
  hasLocalCallsites: boolean,
  usedConsumedPropsAtCallSites: Set<string>,
): InlineResolverVariantsOutcome {
  return {
    kind: "ok",
    variantDimensions: [],
    hasLocalCallsites,
    usedConsumedPropsAtCallSites,
    foldedBaseSx: {},
    bakedInConsumedProps: [],
    staticBooleanVariants: [],
    callSiteCombinedStyles: [],
  };
}

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
      styledDecls,
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
      callSiteCombinedStyles: variantOutcome.callSiteCombinedStyles,
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
  styledDecls: StyledDecl[];
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
  const {
    ctx,
    decl,
    styledDecls,
    consumedProps,
    baseStaticProps,
    baseResult,
    importSource,
    importedName,
  } = args;
  if (consumedProps.length === 0) {
    return emptyOkVariantOutcome(false, new Set());
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
      return emptyOkVariantOutcome(false, usedConsumedPropsAtCallSites);
    }
    return { kind: "bail" };
  }

  const resolveBaseComponent = ctx.resolveBaseComponent;
  if (!resolveBaseComponent) {
    return emptyOkVariantOutcome(hasLocalCallsites, usedConsumedPropsAtCallSites);
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
    const propsKey = serializeRecord(mergedProps);
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
  // Track which props have only boolean values (not string "true"/"false").
  // Used to distinguish `<Comp flag />` (boolean true) from `<Comp mode="true" />` (string).
  const booleanOnlyProps = new Set<string>();
  for (const { siteProps, sxDiff, changedProps } of resolvedByPropsKey.values()) {
    if (changedProps.length === 0) {
      continue;
    }

    // Decompose multi-prop diffs into independent per-prop entries.
    // Single-prop case is handled inline (no decomposition call needed).
    let perPropEntries: Array<{ propName: string; propSxDiff: Record<string, unknown> }>;
    if (changedProps.length === 1) {
      perPropEntries = [{ propName: changedProps[0]!, propSxDiff: sxDiff }];
    } else {
      const decomposed = decomposeMultiPropSxDiff({
        ctx,
        decl,
        resolveBaseComponent,
        importSource,
        importedName,
        baseStaticProps,
        baseSx,
        baseMixinKeys,
        baseTagName: baseResult.tagName,
        siteProps,
        changedProps,
        combinedSxDiff: sxDiff,
      });
      if (decomposed === "bail") {
        return { kind: "bail" };
      }
      perPropEntries = decomposed;
    }

    for (const { propName, propSxDiff } of perPropEntries) {
      const value = siteProps[propName];
      if (!isStaticLiteral(value)) {
        return { kind: "bail" };
      }
      if (typeof value === "boolean") {
        if (!bucketsByProp.has(propName)) {
          booleanOnlyProps.add(propName);
        }
      } else {
        booleanOnlyProps.delete(propName);
      }
      const variantKey = String(value);
      const byValue = bucketsByProp.get(propName) ?? new Map<string, Record<string, unknown>>();
      const existing = byValue.get(variantKey);
      if (existing && serializeRecord(existing) !== serializeRecord(propSxDiff)) {
        return { kind: "bail" };
      }
      byValue.set(variantKey, propSxDiff);
      bucketsByProp.set(propName, byValue);
    }
  }

  const dimensions: VariantDimension[] = [];
  const foldedBaseSx: Record<string, string> = {};
  const bakedInConsumedProps: string[] = [];
  const staticBooleanVariants: StaticBooleanVariant[] = [];

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

    // Singleton folding (bake-in / boolean conditional) requires complete callsite
    // visibility. Components with external interface (className/style + rest spread)
    // may receive different prop values from external callers, so skip folding.
    // Exported components WITHOUT external interface have narrow, controlled props,
    // so folding is safe — the consumed prop is removed from the type entirely.
    const hasCompleteCallsiteVisibility =
      !willHaveExternalInterface(ctx, decl, styledDecls) && !decl.usedAsValue;

    if (variantKeys.length === 1 && !hasPropReferencingTemplateExpressions) {
      // Baking in requires complete callsite visibility — we remove the prop
      // entirely, so external callers must not be able to pass different values.
      if (hasCompleteCallsiteVisibility) {
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
      }

      // Single variant key, partial call sites: emit as a conditional style
      // in the main `styles` object rather than a separate lookup object.
      // We emit `prop ? styles.x : undefined`, so this is only safe when:
      //  1. The prop is boolean (any truthy value means the same thing), OR
      //  2. We have complete callsite visibility (no external callers can pass
      //     a different truthy value that would incorrectly match the guard).
      // Without these guarantees, a string prop like `direction="column"` would
      // also match for `direction="row"`, applying the wrong styles.
      const [singleKey, singleVariantStyles] = Object.entries(variants)[0]!;
      const isBooleanProp = booleanOnlyProps.has(propName);
      if (
        (isBooleanProp || hasCompleteCallsiteVisibility) &&
        isSingleVariantKeyTruthy(singleKey, isBooleanProp)
      ) {
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
      // Base-component-resolved props have no explicit type in the styled declaration.
      // Derive the prop type from the variant object (`keyof typeof`) so the emitter
      // produces precise types and no runtime cast is needed.
      isOptional: true,
      propTypeFromKeyof: true,
    });
  }

  // For direct JSX resolution with complete callsite visibility, merge individual
  // single-key variant styles into combined per-call-site entries. This reduces
  // N separate style entries (one per consumed prop) to M entries (one per unique
  // prop combination), and produces fewer stylex.props() arguments.
  const effectiveBaseSx: Record<string, string> = {
    ...baseResult.sx,
    ...foldedBaseSx,
  };
  const callSiteCombinedStyles = buildCallSiteCombinedStyles({
    decl,
    staticBooleanVariants,
    dimensions,
    baseSx: effectiveBaseSx,
    propsByUsage: usageResult.propsByUsage,
    hasCompleteCallsiteVisibility:
      !willHaveExternalInterface(ctx, decl, styledDecls) && !decl.usedAsValue,
    hasPropReferencingTemplateExpressions: (decl.templateExpressions ?? []).some((expr) => {
      const type = (expr as { type?: string })?.type;
      return type === "ArrowFunctionExpression" || type === "FunctionExpression";
    }),
  });

  if (callSiteCombinedStyles) {
    return {
      kind: "ok",
      variantDimensions: dimensions,
      hasLocalCallsites,
      usedConsumedPropsAtCallSites,
      foldedBaseSx,
      bakedInConsumedProps,
      staticBooleanVariants: [],
      callSiteCombinedStyles,
    };
  }

  return {
    kind: "ok",
    variantDimensions: dimensions,
    hasLocalCallsites,
    usedConsumedPropsAtCallSites,
    foldedBaseSx,
    bakedInConsumedProps,
    staticBooleanVariants,
    callSiteCombinedStyles: [],
  };
}

/**
 * Removes specific JSX prop attributes from every call site of a component.
 * Used when a prop has been folded into the base style (baked in) and no
 * longer needs to be passed at the call site.
 */
function stripBakedPropsFromCallSites(
  ctx: TransformContext,
  localName: string,
  propsToStrip: Set<string>,
): void {
  const { root, j } = ctx;
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

/**
 * Attempts to decompose a multi-prop sx diff into independent per-prop diffs.
 *
 * For each changed prop, creates a single-prop probe (baseStaticProps + just that prop),
 * resolves it, and computes its individual sx diff. Then verifies:
 * 1. Each probe has the same tagName and mixin set as the base
 * 2. CSS key independence (no overlap between per-prop diffs)
 * 3. Additivity (union of per-prop diffs === the combined diff)
 *
 * Returns the per-prop entries on success, or "bail" if any check fails.
 */
function decomposeMultiPropSxDiff(args: {
  ctx: TransformContext;
  decl: StyledDecl;
  resolveBaseComponent: NonNullable<TransformContext["resolveBaseComponent"]>;
  importSource: string;
  importedName: string;
  baseStaticProps: Record<string, ResolveBaseComponentStaticValue>;
  baseSx: Record<string, string>;
  baseMixinKeys: Set<string>;
  baseTagName: string;
  siteProps: Record<string, ResolveBaseComponentStaticValue>;
  changedProps: string[];
  combinedSxDiff: Record<string, unknown>;
}): Array<{ propName: string; propSxDiff: Record<string, unknown> }> | "bail" {
  const {
    ctx,
    decl,
    resolveBaseComponent,
    importSource,
    importedName,
    baseStaticProps,
    baseSx,
    baseMixinKeys,
    baseTagName,
    siteProps,
    changedProps,
    combinedSxDiff,
  } = args;

  const perPropDiffs: Array<{ propName: string; propSxDiff: Record<string, unknown> }> = [];
  const allCssKeys = new Set<string>();

  for (const prop of changedProps) {
    // Single-prop probe: base props + just this one changed prop
    const probeProps: Record<string, ResolveBaseComponentStaticValue> = {
      ...baseStaticProps,
      [prop]: siteProps[prop]!,
    };

    const probeResult = callResolveBaseComponentSafely({
      ctx,
      decl,
      resolveBaseComponent,
      importSource,
      importedName,
      staticProps: probeProps,
      phase: "site",
    });
    if (!probeResult || !isValidBaseResolutionResult(probeResult)) {
      return "bail";
    }

    // Verify same tagName
    if (probeResult.tagName !== baseTagName) {
      return "bail";
    }

    // Verify same mixin set
    const probeMixinKeys = new Set((probeResult.mixins ?? []).map(toMixinKey));
    if (probeMixinKeys.size !== baseMixinKeys.size) {
      return "bail";
    }
    for (const key of baseMixinKeys) {
      if (!probeMixinKeys.has(key)) {
        return "bail";
      }
    }

    const propDiff = diffSx(baseSx, probeResult.sx ?? {});
    if (propDiff === "bail") {
      return "bail";
    }

    // Check CSS key independence: no overlap with any previously seen keys
    for (const cssKey of Object.keys(propDiff)) {
      if (allCssKeys.has(cssKey)) {
        return "bail";
      }
      allCssKeys.add(cssKey);
    }

    perPropDiffs.push({ propName: prop, propSxDiff: propDiff });
  }

  // Verify additivity: union of per-prop diffs must equal the combined diff
  const combinedKeys = Object.keys(combinedSxDiff).sort();
  const unionKeys = [...allCssKeys].sort();
  if (combinedKeys.length !== unionKeys.length) {
    return "bail";
  }
  for (let i = 0; i < combinedKeys.length; i++) {
    if (combinedKeys[i] !== unionKeys[i]) {
      return "bail";
    }
  }
  // Verify values match
  for (const { propSxDiff } of perPropDiffs) {
    for (const [cssKey, cssVal] of Object.entries(propSxDiff)) {
      if (combinedSxDiff[cssKey] !== cssVal) {
        return "bail";
      }
    }
  }

  return perPropDiffs;
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

/**
 * For direct JSX resolution, merges individual single-key variant styles into
 * combined per-call-site entries. Returns the combined styles, or null if
 * combining is not applicable (e.g., multi-key variants, wrapper components).
 */
function buildCallSiteCombinedStyles(args: {
  decl: StyledDecl;
  staticBooleanVariants: StaticBooleanVariant[];
  dimensions: VariantDimension[];
  baseSx: Record<string, string>;
  propsByUsage: Array<Record<string, ResolveBaseComponentStaticValue>>;
  hasCompleteCallsiteVisibility: boolean;
  hasPropReferencingTemplateExpressions: boolean;
}): CallSiteCombinedStyle[] | null {
  const {
    decl,
    staticBooleanVariants,
    dimensions,
    baseSx,
    propsByUsage,
    hasCompleteCallsiteVisibility,
    hasPropReferencingTemplateExpressions,
  } = args;

  if (
    !decl.isDirectJsxResolution ||
    !hasCompleteCallsiteVisibility ||
    hasPropReferencingTemplateExpressions ||
    staticBooleanVariants.length < 2 ||
    dimensions.length > 0
  ) {
    return null;
  }

  const variantsByProp = new Map(staticBooleanVariants.map((v) => [v.propName, v]));

  // Group call sites by their set of consumed props that have variants
  const combinationGroups = new Map<
    string,
    { propNames: string[]; styles: Record<string, unknown> }
  >();
  for (const siteProps of propsByUsage) {
    const matchingPropNames = Object.keys(siteProps)
      .filter((p) => variantsByProp.has(p))
      .sort();
    if (matchingPropNames.length === 0) {
      continue;
    }
    const groupKey = matchingPropNames.join(",");
    if (combinationGroups.has(groupKey)) {
      continue;
    }
    // Merge base sx + per-prop variant styles into a complete style entry
    // so each call site uses exactly one style reference (no base + override).
    const mergedStyles: Record<string, unknown> = { ...baseSx };
    for (const propName of matchingPropNames) {
      const variant = variantsByProp.get(propName)!;
      Object.assign(mergedStyles, variant.styles);
    }
    combinationGroups.set(groupKey, { propNames: matchingPropNames, styles: mergedStyles });
  }

  if (combinationGroups.size === 0 || combinationGroups.size >= staticBooleanVariants.length) {
    return null;
  }

  const result: CallSiteCombinedStyle[] = [];
  for (const [, { propNames, styles }] of combinationGroups) {
    const suffix = propNames.map((p) => toSuffixFromProp(p)).join("");
    result.push({
      propNames,
      styleKey: `${decl.styleKey}${suffix}`,
      styles,
    });
  }
  return result;
}

/**
 * Checks whether a single variant key represents a value that is truthy at runtime.
 * For boolean props, only `"true"` is truthy (`false` is falsy).
 * For non-boolean props (numbers, strings), "0" and "" are falsy; everything else is truthy.
 * Falsy values cannot use the truthy-guard pattern (`prop && styles.key`) safely.
 */
function isSingleVariantKeyTruthy(key: string, isBooleanProp: boolean): boolean {
  if (isBooleanProp) {
    return key === "true";
  }
  return key !== "0" && key !== "";
}

function serializeRecord(record: Record<string, unknown>): string {
  const ordered = Object.keys(record)
    .sort()
    .map((key) => [key, record[key]]);
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
  staticBooleanVariants: StaticBooleanVariant[];
  callSiteCombinedStyles: CallSiteCombinedStyle[];
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
    callSiteCombinedStyles,
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
      stripBakedPropsFromCallSites(ctx, decl.localName, new Set(bakedInConsumedProps));
    }

    if (hasLocalCallsites) {
      // Drop consumed props that appear at local call sites (excluding baked props) from
      // `...rest` to prevent forwarding non-DOM props to the intrinsic element. Baked
      // props are excluded because their JSX attributes have been stripped from all local
      // call sites and cannot leak to the DOM. (Exported components never reach this path
      // with baked props because singleton folding is gated on complete callsite visibility.)
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
  if (callSiteCombinedStyles.length > 0) {
    decl.callSiteCombinedStyles = [
      ...(decl.callSiteCombinedStyles ?? []),
      ...callSiteCombinedStyles,
    ];
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

/**
 * Resolves direct JSX usages of imported components (e.g. `<Flex gap={8}>`)
 * that the adapter's `resolveBaseComponent` can resolve to an intrinsic element + StyleX styles.
 * Creates synthetic StyledDecl objects that flow through the existing pipeline.
 */
function resolveDirectJsxUsages(ctx: TransformContext, styledDecls: StyledDecl[]): void {
  const resolveBaseComponent = ctx.resolveBaseComponent;
  if (!resolveBaseComponent) {
    return;
  }
  const importMap = ctx.importMap;
  if (!importMap) {
    return;
  }

  const styledDeclNames = new Set(styledDecls.map((d) => d.localName));
  const usedStyleKeys = new Set(styledDecls.map((d) => d.styleKey));

  const jsxComponentNames = collectJsxImportedComponentNames(ctx, importMap);

  for (const name of jsxComponentNames) {
    if (styledDeclNames.has(name)) {
      continue;
    }
    if (isUsedAsNonJsxValue(ctx, name)) {
      continue;
    }
    if (hasSpreadInJsxForComponent(ctx, name)) {
      continue;
    }

    const importInfo = importMap.get(name);
    if (!importInfo) {
      continue;
    }

    const importSourceStr = importSourceToString(importInfo.source);
    const baseStaticProps: Record<string, ResolveBaseComponentStaticValue> = {};

    const syntheticDecl: StyledDecl = {
      localName: name,
      base: { kind: "component", ident: name },
      styleKey: deduplicateStyleKey(toStyleKey(name), usedStyleKeys),
      rules: [],
      templateExpressions: [],
      isDirectJsxResolution: true,
    };

    const baseResult = callResolveBaseComponentSafely({
      ctx,
      decl: syntheticDecl,
      resolveBaseComponent,
      importSource: importSourceStr,
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
      decl: syntheticDecl,
      styledDecls,
      consumedProps,
      baseStaticProps,
      baseResult,
      importSource: importSourceStr,
      importedName: importInfo.importedName,
    });
    if (variantOutcome.kind === "bail") {
      continue;
    }

    inlineResolvedBaseComponent({
      ctx,
      decl: syntheticDecl,
      baseStaticProps,
      importSource: importSourceStr,
      importedName: importInfo.importedName,
      baseResult,
      consumedProps,
      variantDimensions: variantOutcome.variantDimensions,
      hasLocalCallsites: variantOutcome.hasLocalCallsites,
      usedConsumedPropsAtCallSites: variantOutcome.usedConsumedPropsAtCallSites,
      foldedBaseSx: variantOutcome.foldedBaseSx,
      bakedInConsumedProps: variantOutcome.bakedInConsumedProps,
      staticBooleanVariants: variantOutcome.staticBooleanVariants,
      callSiteCombinedStyles: variantOutcome.callSiteCombinedStyles,
    });

    usedStyleKeys.add(syntheticDecl.styleKey);
    styledDecls.push(syntheticDecl);
  }
}

/** Scans JSX elements for uppercase identifiers that exist in importMap. */
function collectJsxImportedComponentNames(
  ctx: TransformContext,
  importMap: Map<string, { importedName: string; source: ImportSource }>,
): Set<string> {
  const { root, j } = ctx;
  const names = new Set<string>();

  root.find(j.JSXElement).forEach((p: any) => {
    const openingName = p.node.openingElement?.name;
    if (openingName?.type === "JSXIdentifier") {
      const n = openingName.name as string;
      if (/^[A-Z]/.test(n) && importMap.has(n)) {
        names.add(n);
      }
    }
  });
  root.find(j.JSXSelfClosingElement).forEach((p: any) => {
    const n = p.node.name;
    if (n?.type === "JSXIdentifier") {
      const nm = n.name as string;
      if (/^[A-Z]/.test(nm) && importMap.has(nm)) {
        names.add(nm);
      }
    }
  });

  return names;
}

/** Checks if an identifier is used outside JSX/import/styled() contexts. */
function isUsedAsNonJsxValue(ctx: TransformContext, localName: string): boolean {
  const { root, j } = ctx;
  return (
    root
      .find(j.Identifier, { name: localName })
      .filter((p) => {
        const parentType = p.parentPath?.node?.type;
        // Skip JSX element names
        if (parentType === "JSXOpeningElement" || parentType === "JSXClosingElement") {
          return false;
        }
        // Skip JSX member expressions
        if (parentType === "JSXMemberExpression" && (p.parentPath.node as any).object === p.node) {
          return false;
        }
        // Skip import specifiers
        if (
          parentType === "ImportSpecifier" ||
          parentType === "ImportDefaultSpecifier" ||
          parentType === "ImportNamespaceSpecifier"
        ) {
          return false;
        }
        // Skip styled(Component) calls
        if (parentType === "CallExpression") {
          const callee = (p.parentPath.node as any).callee;
          if (callee?.type === "Identifier" && callee.name === ctx.styledDefaultImport) {
            return false;
          }
          if (
            callee?.type === "MemberExpression" &&
            callee.object?.type === "CallExpression" &&
            callee.object.callee?.type === "Identifier" &&
            callee.object.callee.name === ctx.styledDefaultImport
          ) {
            return false;
          }
        }
        // Skip TaggedTemplateExpression tags
        if (parentType === "TaggedTemplateExpression") {
          return false;
        }
        // Skip styled(Component) call in TaggedTemplateExpression
        if (
          parentType === "CallExpression" &&
          p.parentPath.parentPath?.node?.type === "TaggedTemplateExpression"
        ) {
          return false;
        }
        // Skip template literal interpolations
        if (parentType === "TemplateLiteral") {
          return false;
        }
        return true;
      })
      .size() > 0
  );
}

/** Returns true if any JSX call site of `localName` has a spread attribute. */
function hasSpreadInJsxForComponent(ctx: TransformContext, localName: string): boolean {
  const { root, j } = ctx;
  let found = false;
  const checkAttrs = (attributes: unknown[] | undefined): void => {
    if (found) {
      return;
    }
    for (const attr of attributes ?? []) {
      if ((attr as { type?: string }).type === "JSXSpreadAttribute") {
        found = true;
        return;
      }
    }
  };
  root
    .find(j.JSXElement, {
      openingElement: { name: { type: "JSXIdentifier", name: localName } },
    } as object)
    .forEach((p: any) => checkAttrs(p.node.openingElement?.attributes));
  root
    .find(j.JSXSelfClosingElement, {
      name: { type: "JSXIdentifier", name: localName },
    } as object)
    .forEach((p: any) => checkAttrs(p.node.attributes));
  return found;
}

/** Returns a styleKey that doesn't collide with existing keys. */
function deduplicateStyleKey(base: string, usedKeys: Set<string>): string {
  if (!usedKeys.has(base)) {
    return base;
  }
  let i = 1;
  while (usedKeys.has(`${base}${i}`)) {
    i += 1;
  }
  return `${base}${i}`;
}
