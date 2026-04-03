/**
 * Builds shared state for the lower-rules pipeline.
 * Core concepts: resolver wiring, precomputed mixin values, and shared tracking maps.
 */
import { type ImportSource, isDirectionalResult } from "../../adapter.js";
import { resolveCallFromMapping, CALL_MAPPING_NO_MATCH } from "../call-mapping-resolver.js";
import {
  resolveCssVariableFromMapping,
  CSS_VARIABLE_MAPPING_NO_MATCH,
} from "../css-variable-mapping-resolver.js";
import { resolveThemeFromMapping, THEME_MAPPING_NO_MATCH } from "../theme-mapping-resolver.js";
import type { InternalHandlerContext } from "../builtin-handlers/types.js";
import type { TransformContext } from "../transform-context.js";
import type { CrossFileSelectorUsage, StyledDecl } from "../transform-types.js";
import type { WarningType } from "../logger.js";
import { createCssHelperResolver } from "./css-helper.js";
import { createThemeResolvers } from "./theme.js";
import {
  addStyleKeyMixin,
  computeDeclBasePropValues,
  trackMixinPropertyValues,
} from "./precompute.js";
import { createImportResolver } from "./import-resolution.js";
import { literalToStaticValue } from "./types.js";
import { buildEnumValueMap, cloneAstNode } from "../utilities/jscodeshift-utils.js";

export type RelationOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
  /** Additional style keys (from composed mixins) to search for base values */
  childExtraStyleKeys?: string[];
  /** When true, this override involves a cross-file component and uses defineMarker() */
  crossFile?: boolean;
  /** Variable name of the marker for cross-file overrides (e.g. "ButtonMarker") */
  markerVarName?: string;
  /** Local name of the imported cross-file component (child in forward, parent in reverse) */
  crossFileComponentLocalName?: string;
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
    keyframesNames,
    parseExpr,
    rewriteCssVarsInStyleObject,
  } = ctx;
  const filePath = file.path;
  const resolveValue = ctx.resolveValueSafe;
  const resolveValueDirectional = ctx.resolveValueDirectionalSafe;
  const resolveCall = ctx.resolveCallSafe;
  // Non-bailing versions: call the adapter directly without triggering the global bail flag.
  // Used for speculative/optional resolution (e.g., prop-arg helper remapping, theme branch probing).
  const resolveValueOptional: InternalHandlerContext["resolveValueOptional"] = (rvCtx) => {
    // Check declarative themeMapping first (same precedence as resolveValueCore)
    if (rvCtx.kind === "theme" && ctx.adapter.themeMapping) {
      const mapped = resolveThemeFromMapping(ctx.adapter.themeMapping, rvCtx);
      if (mapped !== THEME_MAPPING_NO_MATCH) {
        if (mapped && isDirectionalResult(mapped)) {
          return undefined;
        }
        return mapped ?? undefined;
      }
    }
    // Check declarative cssVariableMapping
    if (rvCtx.kind === "cssVariable" && ctx.adapter.cssVariableMapping) {
      const mapped = resolveCssVariableFromMapping(ctx.adapter.cssVariableMapping, rvCtx);
      if (mapped !== CSS_VARIABLE_MAPPING_NO_MATCH) {
        return mapped;
      }
    }
    const res = ctx.adapter.resolveValue(rvCtx);
    if (res && isDirectionalResult(res)) {
      return undefined;
    }
    return res;
  };
  const resolveCallOptional: InternalHandlerContext["resolveCallOptional"] = (callCtx) => {
    if (ctx.adapter.callMapping) {
      const mapped = resolveCallFromMapping(ctx.adapter.callMapping, callCtx);
      if (mapped !== CALL_MAPPING_NO_MATCH) {
        return mapped;
      }
    }
    return ctx.adapter.resolveCall(callCtx);
  };
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
    inlineStyleProps: Array<{ prop: string; expr: unknown }>,
  ): void => {
    addStyleKeyMixin(decl, helperDecl.styleKey, { afterBase: true });
    trackMixinPropertyValues(cssHelperValuesByKey.get(helperDecl.styleKey), cssHelperPropValues);
    if (helperDecl.inlineStyleProps?.length) {
      for (const p of helperDecl.inlineStyleProps) {
        inlineStyleProps.push({
          prop: p.prop,
          expr: cloneAstNode(p.expr),
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
        const staticValue = literalToStaticValue(expr.right);
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

  const { resolveImportInScope, resolveImportForExpr } = createImportResolver({
    root,
    j,
    importMap,
  });

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
    j,
  });

  const enumValueMap = buildEnumValueMap(root, j);

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
    parseExpr,
    rewriteCssVarsInStyleObject,
    resolveValue,
    resolveValueOptional,
    resolveValueDirectional,
    resolveCall,
    resolveCallOptional,
    resolveThemeCall,
    resolveSelector,
    importMap,
    styledDecls,
    cssHelperNames,
    cssHelperObjectMembers,
    cssHelperFunctions,
    stringMappingFns,
    resolvedStyleObjects,
    declByLocalName,
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
    enumValueMap,
    crossFileSelectorsByLocal,
    inlineKeyframeNameMap: undefined as Map<string, string> | undefined,
    bail: false,
    markBail: () => {
      state.bail = true;
    },
    bailUnsupported: (decl: StyledDecl, type: WarningType): void => {
      warnings.push({
        severity: "error",
        type,
        loc: decl.loc,
        context: { localName: decl.localName },
      });
      state.bail = true;
    },
  };

  return state;
}
