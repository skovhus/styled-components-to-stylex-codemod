/**
 * Step: collect styled declarations and helper mixins.
 * Core concepts: declaration extraction and helper normalization.
 */
import { isAbsolute as isAbsolutePath } from "node:path";
import type { ImportSource, ResolveBaseComponentStaticValue } from "../../adapter.js";
import { assertNoNullNodesInArrays } from "../utilities/ast-safety.js";
import { collectStyledDecls } from "../collect-styled-decls.js";
import type { CssRuleIR } from "../css-ir.js";
import { extractStyledCallArgs } from "../extract-styled-call-args.js";
import { formatOutput } from "../utilities/format-output.js";
import { CONTINUE, returnResult, type StepResult } from "../transform-types.js";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { toSuffixFromProp } from "../transform/helpers.js";
import { TransformContext } from "../transform-context.js";
import { readStaticJsxLiteral } from "./jsx-static-literal.js";

/**
 * Collects styled declarations and merges extracted css helper declarations.
 */
export function collectStyledDeclsStep(ctx: TransformContext): StepResult {
  const { styledImports, root, j, cssLocal } = ctx;
  if (!styledImports) {
    return CONTINUE;
  }

  // We can have styled-components usage without a default import (e.g. only `keyframes` or `css`).
  // Don't early-return; instead apply what we can.
  const styledDefaultSpecifier = styledImports.find(j.ImportDefaultSpecifier).nodes()[0];
  const styledDefaultImport =
    styledDefaultSpecifier?.local?.type === "Identifier"
      ? styledDefaultSpecifier.local.name
      : undefined;
  ctx.styledDefaultImport = styledDefaultImport;

  // Pre-process: extract CallExpression arguments from styled() calls into separate variables.
  // This transforms patterns like styled(motion.create(Component)) into:
  //   const MotionComponent = motion.create(Component);
  //   styled(MotionComponent)
  // which can then be handled by the normal styled(Identifier) collection path.
  if (extractStyledCallArgs({ root, j, styledDefaultImport })) {
    ctx.markChanged();
  }

  const collected = collectStyledDecls({
    root,
    j,
    styledDefaultImport,
    cssLocal,
  });

  const styledDecls = collected.styledDecls;
  let hasUniversalSelectors = collected.hasUniversalSelectors;
  let universalSelectorLoc = collected.universalSelectorLoc;

  const cssHelpers = ctx.cssHelpers;
  if (cssHelpers?.cssHelperDecls?.length > 0) {
    styledDecls.push(...cssHelpers.cssHelperDecls);
    styledDecls.sort((a: any, b: any) => {
      const aIdx = a.declIndex ?? Number.POSITIVE_INFINITY;
      const bIdx = b.declIndex ?? Number.POSITIVE_INFINITY;
      if (aIdx !== bIdx) {
        return aIdx - bIdx;
      }
      return 0;
    });
  }

  applyBaseComponentResolution(ctx, styledDecls);

  ctx.styledDecls = styledDecls;

  // Check for unparseable shouldForwardProp - bail to avoid semantic changes
  const unparseableSfpDecl = styledDecls.find((d) => d.hasUnparseableShouldForwardProp);
  if (unparseableSfpDecl) {
    ctx.warnings.push({
      severity: "warning",
      type: "Unsupported shouldForwardProp pattern (only !prop.startsWith(), ![].includes(prop), and prop !== are supported)",
      loc: unparseableSfpDecl.loc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  // If we didn't find any styled declarations but performed other edits (e.g. keyframes conversion),
  // we'll still emit output without injecting StyleX styles.
  if (styledDecls.length === 0) {
    return returnResult(
      {
        code: ctx.hasChanges
          ? formatOutput(
              (assertNoNullNodesInArrays(root.get().node),
              root.toSource({
                quote: "double",
                trailingComma: true,
                reuseWhitespace: false,
              })),
            )
          : null,
        warnings: ctx.warnings,
      },
      "skip",
    );
  }

  if (cssHelpers?.cssHelperHasUniversalSelectors) {
    hasUniversalSelectors = true;
    if (!universalSelectorLoc) {
      universalSelectorLoc = cssHelpers.cssHelperUniversalSelectorLoc;
    }
  }

  ctx.hasUniversalSelectors = hasUniversalSelectors;
  ctx.universalSelectorLoc = universalSelectorLoc;

  // Universal selectors (`*`) are currently unsupported (too many edge cases to map to StyleX safely).
  // Skip transforming the entire file to avoid producing incorrect output.
  if (hasUniversalSelectors) {
    ctx.warnings.push({
      severity: "warning",
      type: "Universal selectors (`*`) are currently unsupported",
      loc: universalSelectorLoc,
    });
    return returnResult({ code: null, warnings: ctx.warnings }, "bail");
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

type JsxPropResolutionOutcome =
  | { kind: "ok"; propsByUsage: Array<Record<string, ResolveBaseComponentStaticValue>> }
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
    const baseResult = resolveBaseComponent({
      importSource: importSourceForAdapter,
      importedName: importInfo.importedName,
      staticProps: baseStaticProps,
    });
    if (!baseResult || !isValidBaseResolutionResult(baseResult)) {
      continue;
    }

    const consumedProps = [...new Set(baseResult.consumedProps)];
    const variantDimensions = buildInlineResolverVariantDimensions({
      ctx,
      decl,
      consumedProps,
      baseStaticProps,
      baseResult,
      importSource: importSourceForAdapter,
      importedName: importInfo.importedName,
    });
    if (variantDimensions === "bail") {
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
      variantDimensions,
    });
  }
}

function canResolveBaseFromAttrs(attrsInfo: StyledDecl["attrsInfo"]): boolean {
  if (!attrsInfo) {
    return true;
  }
  if (attrsInfo.sourceKind === "function") {
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
  sx?: Record<string, string>;
  mixins?: Array<{ importSource: string; importName: string; styleKey: string }>;
}): boolean {
  if (typeof result.tagName !== "string" || result.tagName.trim() === "") {
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
}): VariantDimension[] | "bail" {
  const { ctx, decl, consumedProps, baseStaticProps, baseResult, importSource, importedName } =
    args;
  if (consumedProps.length === 0) {
    return [];
  }

  const usageResult = collectStaticConsumedJsxProps({
    root: ctx.root,
    j: ctx.j,
    localName: decl.localName,
    consumedProps,
  });
  if (usageResult.kind === "bail") {
    return "bail";
  }
  if (usageResult.propsByUsage.length === 0) {
    return [];
  }

  const resolveBaseComponent = ctx.resolveBaseComponent;
  if (!resolveBaseComponent) {
    return [];
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

    const siteResult = resolveBaseComponent({
      importSource,
      importedName,
      staticProps: mergedProps,
    });
    if (!siteResult || !isValidBaseResolutionResult(siteResult)) {
      return "bail";
    }
    if (siteResult.tagName !== baseResult.tagName) {
      return "bail";
    }

    const siteMixins = siteResult.mixins ?? [];
    const siteMixinKeys = new Set(siteMixins.map(toMixinKey));
    for (const baseMixin of baseMixinKeys) {
      if (!siteMixinKeys.has(baseMixin)) {
        return "bail";
      }
    }
    for (const siteMixin of siteMixinKeys) {
      if (!baseMixinKeys.has(siteMixin)) {
        // Per-site mixin diffs require conditional props args; keep v1 conservative.
        return "bail";
      }
    }

    const sxDiff = diffSx(baseSx, siteResult.sx ?? {});
    if (sxDiff === "bail") {
      return "bail";
    }
    const changedProps = getChangedConsumedProps(baseStaticProps, siteProps, consumedProps);
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
      return "bail";
    }

    const propName = changedProps[0]!;
    const value = siteProps[propName];
    if (!isStaticLiteral(value)) {
      return "bail";
    }
    const variantKey = String(value);
    const byValue = bucketsByProp.get(propName) ?? new Map<string, Record<string, unknown>>();
    const existing = byValue.get(variantKey);
    if (existing && serializeObject(existing) !== serializeObject(sxDiff)) {
      return "bail";
    }
    byValue.set(variantKey, sxDiff);
    bucketsByProp.set(propName, byValue);
  }

  const dimensions: VariantDimension[] = [];
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
    dimensions.push({
      propName,
      variantObjectName: `${decl.styleKey}${toSuffixFromProp(propName)}Variants`,
      variants,
    });
  }

  return dimensions;
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
  } = args;

  const sxRule = createRuleFromStylexDeclarations(baseResult.sx);
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
    const existing = new Set(decl.shouldForwardProp?.dropProps ?? []);
    for (const prop of consumedProps) {
      existing.add(prop);
    }
    decl.shouldForwardProp = {
      ...(decl.shouldForwardProp?.dropPrefix
        ? { dropPrefix: decl.shouldForwardProp.dropPrefix }
        : {}),
      dropProps: [...existing],
    };
  }

  decl.base = { kind: "intrinsic", tagName: baseResult.tagName };
  if (variantDimensions.length > 0) {
    decl.variantDimensions = [...(decl.variantDimensions ?? []), ...variantDimensions];
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
