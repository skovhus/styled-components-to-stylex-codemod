/**
 * Builds shared state for the lower-rules pipeline.
 * Core concepts: resolver wiring, precomputed mixin values, and shared tracking maps.
 */
import { type ImportSource, isDirectionalResult } from "../../adapter.js";
import type { InternalHandlerContext } from "../builtin-handlers/types.js";
import type { TransformContext } from "../transform-context.js";
import type {
  ComponentPropUsageInfo,
  CrossFileSelectorUsage,
  StyledDecl,
} from "../transform-types.js";
import type { WarningType } from "../logger.js";
import { createCssHelperResolver } from "./css-helper.js";
import { createThemeResolvers } from "./theme.js";
import {
  addStyleKeyMixin,
  computeDeclBasePropValues,
  trackMixinPropertyValues,
} from "./precompute.js";
import { createImportResolver } from "./import-resolution.js";
import { collectExportedComponents } from "../analyze-before-emit/exported-components.js";
import { componentsReferencedAsValue } from "../utilities/component-value-references.js";
import { literalToStaticValue } from "./types.js";
import {
  buildEnumValueMap,
  cloneAstNode,
  collectPatternBindingNames,
} from "../utilities/jscodeshift-utils.js";
import { readStaticJsxLiteral } from "../utilities/jsx-static-literal.js";
import {
  createComponentPropUsageInfo,
  KNOWN_NON_ELEMENT_PROPS,
  mergeComponentPropUsage,
  type ComponentPropUsageCandidate,
} from "../utilities/prop-usage.js";

export type RelationOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
  /** Override applied only when the child is statically proven to be adjacent to a same-style sibling. */
  adjacentOnly?: boolean;
  /** Override applied only when the child is statically proven to be an immediate JSX child. */
  directChildOnly?: boolean;
  /** Additional style keys (from composed mixins) to search for base values */
  childExtraStyleKeys?: string[];
  /** When true, this override involves a cross-file component and uses defineMarker() */
  crossFile?: boolean;
  /** Variable name of the marker for cross-file overrides (e.g. "ButtonMarker") */
  markerVarName?: string;
  /** Local name of the imported cross-file component (child in forward, parent in reverse) */
  crossFileComponentLocalName?: string;
  /**
   * Immutable local names of the same-file decls this override relates, recorded at
   * registration. Style keys can be rewritten after registration (e.g. enum/string-
   * mapping variants rewrite `decl.styleKey` to a derived base key), so post-lowering
   * passes resolve the decls by local name instead of the now-stale style keys.
   */
  childLocalName?: string;
  parentLocalName?: string;
};

export type LowerRulesState = ReturnType<typeof createLowerRulesState>;

export function createLowerRulesState(ctx: TransformContext) {
  const {
    api,
    j,
    root,
    file,
    warnings,
    resolverImports,
    localStylexVars,
    getOrCreateLocalStylexVar,
    keyframesNames,
    keyframesAliases,
    parseExpr,
    rewriteCssVarsInStyleObject,
    rewriteCssVarsInAstNode,
  } = ctx;
  const filePath = file.path;
  const resolveValue = ctx.resolveValueSafe;
  const resolveValueDirectional = ctx.resolveValueDirectionalSafe;
  const resolveCall = ctx.resolveCallSafe;
  // Non-bailing versions: call the adapter directly without triggering the global bail flag.
  // Used for speculative/optional resolution (e.g., prop-arg helper remapping, theme branch probing).
  const resolveValueOptional: InternalHandlerContext["resolveValueOptional"] = (rvCtx) => {
    if (rvCtx.kind === "importedValue" && isStylexFileSource(rvCtx.source)) {
      return resolveValue(rvCtx);
    }
    const res = ctx.adapter.resolveValue(rvCtx);
    if (res && isDirectionalResult(res)) {
      return undefined;
    }
    return res;
  };
  const resolveCallOptional = ctx.adapter.resolveCall.bind(ctx.adapter);
  const resolveThemeCall = ctx.adapter.resolveThemeCall?.bind(ctx.adapter);
  const resolveSelector = ctx.resolveSelectorSafe;
  const importMap =
    ctx.importMap ?? new Map<string, { importedName: string; source: ImportSource }>();
  const styledDecls = ctx.styledDecls as StyledDecl[];
  const cssHelpers = ctx.cssHelpers ?? {
    cssHelperNames: new Set<string>(),
    cssHelperObjectMembers: new Map<string, Map<string, StyledDecl>>(),
    cssHelperFunctions: new Map(),
  };
  const cssHelperNames = cssHelpers.cssHelperNames;
  const cssHelperObjectMembers = cssHelpers.cssHelperObjectMembers;
  const cssHelperFunctions = cssHelpers.cssHelperFunctions;
  const stringMappingFns = ctx.stringMappingFns ?? new Map();

  const resolvedStyleObjects = new Map<string, unknown>();
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  // Public export surface of this file. Components reachable from outside the analyzed set can be
  // rendered by callers we never observe, so optimizations relying on exhaustive local observation
  // (e.g. observed-variant bucketing without a runtime fallback) must bail for these.
  const exportedComponentNames = new Set(
    collectExportedComponents(root, j, declByLocalName).keys(),
  );
  // Components referenced as a value (passed to innerElementType/as/HOC props, aliased, etc.) can be
  // rendered by callers we never observe, so they share the exported components' non-exhaustiveness.
  const componentsUsedAsValue = componentsReferencedAsValue(
    root,
    j,
    new Set(declByLocalName.keys()),
    ctx.styledDefaultImport,
  );
  const relationOverrides: RelationOverride[] = [];
  const ancestorSelectorParents = new Set<string>();
  const siblingMarkerParents = new Set<string>();
  /** Maps styleKey → marker variable name for sibling and descendant-has selectors (e.g. "thing" → "ThingMarker") */
  const siblingMarkerNames = new Map<string, string>();
  /** Maps style key → set of CSS attribute selector strings used in ancestor attribute conditions */
  const ancestorAttrsByStyleKey = new Map<string, Set<string>>();
  // Map<overrideStyleKey, Map<pseudo|null, Record<prop, value>>>
  // null key = base styles, string key = pseudo styles (e.g., ":hover", ":focus-visible")
  const relationOverridePseudoBuckets = new Map<
    string,
    Map<string | null, Record<string, unknown>>
  >();
  // Map<overrideStyleKey, Set<pseudo>> — pseudos that apply to child element, not ancestor.
  // These use regular string literal keys (e.g., ":hover") instead of stylex.when.ancestor().
  const childPseudoMarkers = new Map<string, Set<string>>();

  // Pre-compute properties and values defined by each css helper and mixin from their rules.
  // This allows us to know what properties they provide (and their values) before styled
  // components that use them are processed, which is needed for correct pseudo selector
  // handling (setting proper default values).
  const cssHelperValuesByKey = new Map<string, Map<string, unknown>>();
  const mixinValuesByKey = new Map<string, Map<string, unknown>>();
  for (const decl of styledDecls) {
    const propValues = computeDeclBasePropValues(decl);
    if (decl.isCssHelper) {
      cssHelperValuesByKey.set(decl.styleKey, propValues);
      continue;
    }
    if (propValues.size > 0) {
      mixinValuesByKey.set(decl.styleKey, propValues);
    }
  }

  /**
   * Applies a css helper mixin to a declaration: adds the style key, tracks property values,
   * and copies inline style props.
   */
  const applyCssHelperMixin = (
    decl: StyledDecl,
    helperDecl: StyledDecl,
    cssHelperPropValues: Map<string, unknown>,
    inlineStyleProps: Array<{ prop: string; expr: unknown; keyExpr?: unknown }>,
  ): void => {
    addStyleKeyMixin(decl, helperDecl.styleKey, { afterBase: true });
    trackMixinPropertyValues(cssHelperValuesByKey.get(helperDecl.styleKey), cssHelperPropValues);
    if (helperDecl.inlineStyleProps?.length) {
      for (const p of helperDecl.inlineStyleProps) {
        inlineStyleProps.push({
          prop: p.prop,
          expr: cloneAstNode(p.expr),
          ...(p.keyExpr ? { keyExpr: cloneAstNode(p.keyExpr) } : {}),
        });
      }
    }
    if (helperDecl.extraStyleKeys?.length) {
      for (const key of helperDecl.extraStyleKeys) {
        const afterBase = helperDecl.extraStyleKeysAfterBase?.includes(key) ?? false;
        addStyleKeyMixin(decl, key, { afterBase });
        trackMixinPropertyValues(cssHelperValuesByKey.get(key), cssHelperPropValues);
      }
    }
    if (helperDecl.templateExpressions?.length) {
      for (const expr of helperDecl.templateExpressions as any[]) {
        if (expr?.type !== "Identifier" || !cssHelperNames.has(expr.name)) {
          continue;
        }
        const nestedDecl = declByLocalName.get(expr.name);
        if (!nestedDecl?.isCssHelper) {
          continue;
        }
        addStyleKeyMixin(decl, nestedDecl.styleKey, { afterBase: true });
        trackMixinPropertyValues(
          cssHelperValuesByKey.get(nestedDecl.styleKey),
          cssHelperPropValues,
        );
      }
    }
  };

  // Track static property values: Map<ownerName, Map<propertyName, value>>
  // This allows us to resolve member expressions like Divider.HEIGHT to their literal values.
  const staticPropertyValues = new Map<string, Map<string, string | number | boolean>>();
  const staticIdentifierValues = new Map<string, string | number | boolean>();
  root.find(j.VariableDeclarator).forEach((p) => {
    if (!isTopLevelConstDeclarator(p)) {
      return;
    }
    const node = p.node as { id?: { type?: string; name?: string }; init?: unknown };
    if (node.id?.type !== "Identifier" || !node.id.name) {
      return;
    }
    // Reject function-valued constants (e.g. `const BASE = () => 8`): coercing
    // their body would let arithmetic/value resolution treat a function object
    // as a static literal, silently mistransforming the runtime semantics.
    const staticValue = literalToStaticValue(node.init, { allowStaticArrowFunctions: false });
    if (staticValue !== null) {
      staticIdentifierValues.set(node.id.name, staticValue);
    }
  });
  // Drop names that are also bound in a nested scope (function params or
  // non-top-level declarations). The fold map is keyed purely by name with no
  // scope information, so a same-named local binding could otherwise shadow the
  // top-level value at the point of use and be mis-folded (e.g. `const gap = 8`
  // shadowed by a `gap` parameter). Dropping them is safe: worst case we skip an
  // optimization rather than emit wrong output.
  if (staticIdentifierValues.size > 0) {
    const shadowingNames = new Set<string>();
    root.find(j.Function).forEach((fnPath) => {
      collectPatternBindingNames((fnPath.node as { params?: unknown }).params, shadowingNames);
      // A named function declaration/expression binds its own name in a scope
      // that can shadow a top-level const (e.g. a nested `function gap() {}`).
      const fnId = (fnPath.node as { id?: { name?: string } }).id;
      if (fnId?.name) {
        shadowingNames.add(fnId.name);
      }
    });
    root.find(j.ClassDeclaration).forEach((classPath) => {
      const classId = (classPath.node as { id?: { name?: string } }).id;
      if (classId?.name) {
        shadowingNames.add(classId.name);
      }
    });
    root.find(j.VariableDeclarator).forEach((declPath) => {
      if (!isTopLevelConstDeclarator(declPath)) {
        collectPatternBindingNames((declPath.node as { id?: unknown }).id, shadowingNames);
      }
    });
    for (const name of shadowingNames) {
      staticIdentifierValues.delete(name);
    }
  }
  root
    .find(j.ExpressionStatement, {
      expression: {
        type: "AssignmentExpression",
        operator: "=",
        left: {
          type: "MemberExpression",
          object: { type: "Identifier" },
          property: { type: "Identifier" },
        },
      },
    } as any)
    .forEach((p) => {
      const expr = p.node.expression as {
        left?: { object?: { name?: string }; property?: { name?: string } };
        right?: unknown;
      };
      const ownerName = expr.left?.object?.name;
      const propName = expr.left?.property?.name;
      if (ownerName && propName) {
        const staticValue = literalToStaticValue(expr.right, { allowStaticArrowFunctions: false });
        let ownerMap = staticPropertyValues.get(ownerName);
        if (!ownerMap) {
          ownerMap = new Map();
          staticPropertyValues.set(ownerName, ownerMap);
        }
        if (staticValue !== null) {
          ownerMap.set(propName, staticValue);
        }
      }
    });

  const warnPropInlineStyle = (
    decl: StyledDecl,
    type: WarningType,
    propName: string | null | undefined,
    loc: { line: number; column: number } | null | undefined,
  ): void => {
    const propLabel = propName ?? "unknown";
    warnings.push({
      severity: "warning",
      type,
      loc,
      context: {
        localName: decl.localName,
        propLabel,
      },
    });
  };

  const { hasLocalThemeBinding, resolveThemeValue, resolveThemeValueFromFn } = createThemeResolvers(
    {
      root,
      j,
      filePath,
      resolveValue,
      resolveValueDirectional,
      parseExpr,
      resolverImports,
    },
  );

  const { resolveImportInScope, resolveImportForExpr, isIdentifierShadowed } = createImportResolver(
    {
      root,
      j,
      importMap,
    },
  );

  const { isCssHelperTaggedTemplate, resolveCssHelperTemplate } = createCssHelperResolver({
    importMap,
    filePath,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolveSelector,
    parseExpr,
    resolverImports,
    warnings,
    keyframesNames,
    inlineKeyframeNameMap: (ctx.inlineKeyframeNameMap ??= new Map()),
    j,
  });

  const enumValueMap = buildEnumValueMap(root, j);
  const propUsageByComponent = collectPropUsageByComponent(ctx, styledDecls);

  // Build cross-file selector lookup: localName → usage info
  const crossFileSelectorsByLocal = new Map<string, CrossFileSelectorUsage>();
  if (ctx.crossFileSelectorUsages) {
    for (const usage of ctx.crossFileSelectorUsages) {
      crossFileSelectorsByLocal.set(usage.localName, usage);
    }
  }

  const state = {
    api,
    j,
    root,
    file,
    filePath,
    warnings,
    resolverImports,
    keyframesNames,
    keyframesAliases,
    parseExpr,
    rewriteCssVarsInStyleObject,
    rewriteCssVarsInAstNode,
    resolveValue,
    resolveValueOptional,
    resolveValueDirectional,
    resolveCall,
    resolveCallOptional,
    resolveThemeCall,
    resolveBaseComponent: ctx.resolveBaseComponent,
    resolveSelector,
    localStylexVars,
    getOrCreateLocalStylexVar,
    importMap,
    styledDecls,
    cssHelperNames,
    cssHelperObjectMembers,
    cssHelperFunctions,
    stringMappingFns,
    resolvedStyleObjects,
    declByLocalName,
    exportedComponentNames,
    componentsUsedAsValue,
    relationOverrides,
    ancestorSelectorParents,
    siblingMarkerParents,
    siblingMarkerNames,
    ancestorAttrsByStyleKey,
    relationOverridePseudoBuckets,
    childPseudoMarkers,
    cssHelperValuesByKey,
    mixinValuesByKey,
    staticPropertyValues,
    staticIdentifierValues,
    usedCssHelperFunctions: new Set<string>(),
    warnPropInlineStyle,
    applyCssHelperMixin,
    hasLocalThemeBinding,
    resolveThemeValue,
    resolveThemeValueFromFn,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    resolveImportInScope,
    resolveImportForExpr,
    isIdentifierShadowed,
    enumValueMap,
    crossFileSelectorsByLocal,
    propUsageByComponent,
    inlineKeyframeNameMap: undefined as Map<string, string> | undefined,
    /**
     * File-level bail flag. Used only for bails that cannot be scoped to a single
     * declaration (e.g. invariant violations before per-decl processing begins).
     * Per-decl bails set `currentDecl.skipTransform = true` instead so the file
     * can still be partially transformed.
     */
    bail: false,
    /**
     * Set at the start of each decl's processing loop iteration. When a handler
     * calls markBail/bailUnsupported, this is the decl that gets marked skipped.
     * When null, markBail falls back to the file-level bail flag.
     */
    currentDecl: null as StyledDecl | null,
    markBail: () => {
      if (state.currentDecl) {
        state.currentDecl.skipTransform = true;
        return;
      }
      state.bail = true;
    },
    bailUnsupported: (decl: StyledDecl, type: WarningType): void => {
      warnings.push({
        severity: "error",
        type,
        loc: decl.loc,
        context: { localName: decl.localName },
      });
      decl.skipTransform = true;
    },
  };

  return state;
}

function collectPropUsageByComponent(
  ctx: TransformContext,
  styledDecls: StyledDecl[],
): Map<string, ComponentPropUsageInfo> {
  const byComponent = clonePropUsageByComponent(ctx.propUsageByComponent);
  const localNames = new Set(styledDecls.map((decl) => decl.localName));

  const recordOpening = (opening: unknown): void => {
    if (!opening || typeof opening !== "object") {
      return;
    }
    const openingRecord = opening as { name?: unknown; attributes?: unknown[] };
    const name = getJsxIdentifierName(openingRecord.name);
    if (!name || !localNames.has(name)) {
      return;
    }

    const usage = collectOpeningPropUsage(openingRecord.attributes);
    let info = byComponent.get(name);
    if (!info) {
      info = createComponentPropUsageInfo(name);
      byComponent.set(name, info);
    }
    mergeComponentPropUsage(info, usage);
  };

  ctx.root.find(ctx.j.JSXElement).forEach((path) => {
    recordOpening(path.node.openingElement);
  });
  ctx.root.find(ctx.j.JSXSelfClosingElement).forEach((path) => {
    recordOpening(path.node);
  });

  return byComponent;
}

function clonePropUsageByComponent(
  source: TransformContext["propUsageByComponent"],
): Map<string, ComponentPropUsageInfo> {
  const cloned = new Map<string, ComponentPropUsageInfo>();
  for (const [name, info] of source ?? []) {
    cloned.set(name, {
      componentName: info.componentName,
      usageCount: info.usageCount,
      hasUnknownUsage: info.hasUnknownUsage,
      props: Object.fromEntries(
        Object.entries(info.props).map(([propName, propInfo]) => [
          propName,
          {
            values: [...propInfo.values],
            hasUnknown: propInfo.hasUnknown,
            usageCount: propInfo.usageCount,
            omittedCount: propInfo.omittedCount,
          },
        ]),
      ),
    });
  }
  return cloned;
}

function isTopLevelConstDeclarator(path: { parentPath?: unknown }): boolean {
  const declarationPath = path.parentPath as
    | { node?: { type?: string; kind?: string }; parentPath?: unknown }
    | undefined;
  if (!declarationPath) {
    return false;
  }
  const declaration = declarationPath?.node;
  if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
    return false;
  }
  let current = declarationPath.parentPath as
    | { node?: { type?: string }; parentPath?: unknown }
    | undefined;
  while (current?.node) {
    const type = current.node.type;
    if (type === "Program") {
      return true;
    }
    if (type !== "VariableDeclaration" && type !== "ExportNamedDeclaration") {
      return false;
    }
    current = current.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
  }
  return false;
}

function collectOpeningPropUsage(attributes: unknown[] | undefined): ComponentPropUsageCandidate {
  const props: ComponentPropUsageCandidate["props"] = {};
  let hasSpread = false;

  for (const attr of attributes ?? []) {
    if (!attr || typeof attr !== "object") {
      continue;
    }
    const attrRecord = attr as { type?: string; name?: unknown };
    if (attrRecord.type === "JSXSpreadAttribute") {
      hasSpread = true;
      continue;
    }
    if (attrRecord.type !== "JSXAttribute") {
      continue;
    }
    const propName = getJsxIdentifierName(attrRecord.name);
    if (!propName || KNOWN_NON_ELEMENT_PROPS.has(propName)) {
      continue;
    }
    const value = readStaticJsxLiteral(attr);
    props[propName] = value === undefined ? { kind: "unknown" } : { kind: "static", value };
  }

  return { props, hasSpread };
}

function getJsxIdentifierName(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const record = node as { type?: string; name?: unknown };
  return record.type === "JSXIdentifier" && typeof record.name === "string" ? record.name : null;
}

const STYLEX_FILE_RE = /\.stylex(\.\w+)?$/;

function isStylexFileSource(source: ImportSource): boolean {
  return STYLEX_FILE_RE.test(source.value);
}
