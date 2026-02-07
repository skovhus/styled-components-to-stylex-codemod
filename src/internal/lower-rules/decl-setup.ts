/**
 * Builds per-declaration processing context for lower-rules.
 * Core concepts: per-component style buckets, helper factories, and resolver wiring.
 */
import { compile } from "stylis";
import type { StyledDecl } from "../transform-types.js";
import type { InternalHandlerContext } from "../builtin-handlers.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { normalizeStylisAstToIR } from "../css-ir.js";
import { createCssHelperHandlers } from "./css-helper-handlers.js";
import type { ExpressionKind, StyleFnFromPropsEntry, TestInfo } from "./decl-types.js";
import { createTypeInferenceHelpers, ensureShouldForwardPropDrop } from "./types.js";
import { createCssHelperConditionalHandler } from "./css-helper-conditional.js";
import { createValuePatternHandlers } from "./value-patterns.js";
import { createVariantApplier } from "./variant-utils.js";
import type { LowerRulesState } from "./state.js";
import { extractRootAndPath } from "../utilities/jscodeshift-utils.js";
import { cssValueToJs, toStyleKey, type ComputedKeyEntry } from "../transform/helpers.js";

export type DeclProcessingState = ReturnType<typeof createDeclProcessingState>;

export function createDeclProcessingState(state: LowerRulesState, decl: StyledDecl) {
  const {
    api,
    j,
    root,
    filePath,
    warnings,
    resolverImports,
    parseExpr,
    resolveValue,
    resolveCall,
    importMap,
    cssHelperFunctions,
    stringMappingFns,
    hasLocalThemeBinding,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    resolveImportInScope,
    usedCssHelperFunctions,
    markBail,
  } = state;

  const styleObj: Record<string, unknown> = {};
  const perPropPseudo: Record<string, Record<string, unknown>> = {};
  const perPropMedia: Record<string, Record<string, unknown>> = {};
  // Track computed media keys (from adapter.resolveSelector) separately
  // Map<prop, { defaultValue: unknown, entries: ComputedKeyEntry[] }>
  const perPropComputedMedia = new Map<
    string,
    { defaultValue: unknown; entries: ComputedKeyEntry[] }
  >();
  const nestedSelectors: Record<string, Record<string, unknown>> = {};
  const variantBuckets = new Map<string, Record<string, unknown>>();
  const variantStyleKeys: Record<string, string> = {};
  const extraStyleObjects = new Map<string, Record<string, unknown>>();
  const styleFnFromProps: StyleFnFromPropsEntry[] = [];
  const styleFnDecls = new Map<string, any>();
  const attrBuckets = new Map<string, Record<string, unknown>>();
  const inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; jsxProp?: string }> = [];
  const localVarValues = new Map<string, string>();
  // Track properties defined by composed css helpers along with their values
  // so we can set proper default values for pseudo selectors.
  const cssHelperPropValues = new Map<string, unknown>();

  const resolveComposedDefaultValue = (helperVal: unknown, propName: string): unknown => {
    if (helperVal === undefined) {
      return null;
    }
    if (helperVal && typeof helperVal === "object" && "__cssHelperDynamicValue" in helperVal) {
      // Dynamic value - look up from already-resolved css helper
      const helperDecl = (helperVal as Record<string, unknown>).decl as StyledDecl | undefined;
      if (helperDecl) {
        const resolvedHelper = state.resolvedStyleObjects.get(toStyleKey(helperDecl.localName));
        if (resolvedHelper && typeof resolvedHelper === "object") {
          return (resolvedHelper as Record<string, unknown>)[propName] ?? null;
        }
      }
      return null;
    }
    return helperVal;
  };
  const getComposedDefaultValue = (propName: string): unknown =>
    resolveComposedDefaultValue(cssHelperPropValues.get(propName), propName);

  const {
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    isJsxPropOptional,
  } = createTypeInferenceHelpers({
    root,
    j,
    decl,
  });

  const applyVariant = createVariantApplier({
    decl,
    variantBuckets,
    variantStyleKeys,
  });

  const dropAllTestInfoProps = (testInfo: TestInfo): void => {
    const propsToCheck = testInfo.allPropNames ?? (testInfo.propName ? [testInfo.propName] : []);
    for (const prop of propsToCheck) {
      if (prop && !prop.startsWith("$")) {
        ensureShouldForwardPropDrop(decl, prop);
      }
    }
  };

  // Shared fields from LowerRulesState used by multiple handler factories
  const sharedFromState = {
    j,
    filePath,
    warnings,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    markBail,
  };

  const {
    tryHandleMappedFunctionColor,
    tryHandleLogicalOrDefault,
    tryHandleConditionalPropCoalesceWithTheme,
    tryHandleEnumIfChainValue,
    tryHandleThemeIndexedLookup,
  } = createValuePatternHandlers({
    ...sharedFromState,
    api,
    decl,
    styleObj,
    variantBuckets,
    variantStyleKeys,
    styleFnFromProps,
    styleFnDecls,
    stringMappingFns,
    hasLocalThemeBinding,
    annotateParamFromJsxProp,
    findJsxPropTsType,
  });

  // Build reusable handler context for resolveDynamicNode calls
  const handlerContext: InternalHandlerContext = {
    api,
    filePath,
    resolveValue,
    resolveCall,
    resolveImport: resolveImportInScope,
    hasImportIgnoringShadowing: (localName: string) => importMap.has(localName),
  };

  // Build component info for resolveDynamicNode calls
  const withConfig = decl.shouldForwardProp ? { shouldForwardProp: true } : undefined;
  const componentInfo =
    decl.base.kind === "intrinsic"
      ? {
          localName: decl.localName,
          base: "intrinsic" as const,
          tagOrIdent: decl.base.tagName,
          withConfig,
        }
      : {
          localName: decl.localName,
          base: "component" as const,
          tagOrIdent: decl.base.ident,
          withConfig,
        };

  const { tryHandlePropertyTernaryTemplateLiteral, tryHandleCssHelperFunctionSwitchBlock } =
    createCssHelperHandlers({
      ...sharedFromState,
      decl,
      styleObj,
      variantBuckets,
      variantStyleKeys,
      cssHelperFunctions,
      usedCssHelperFunctions,
      applyVariant,
      dropAllTestInfoProps,
      componentInfo,
      handlerContext,
    });

  const resolveStaticCssBlock = (rawCss: string): Record<string, unknown> | null => {
    const wrappedRawCss = `& { ${rawCss} }`;
    const stylisAst = compile(wrappedRawCss);
    const rules = normalizeStylisAstToIR(stylisAst, [], {
      rawCss: wrappedRawCss,
    });
    const out: Record<string, unknown> = {};
    for (const rule of rules) {
      if (rule.atRuleStack.length > 0) {
        return null;
      }
      const selector = (rule.selector ?? "").trim();
      if (selector !== "&") {
        return null;
      }
      for (const d of rule.declarations) {
        if (!d.property) {
          return null;
        }
        if (d.value.kind !== "static") {
          return null;
        }
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          let value = cssValueToJs(mapped.value, d.important, mapped.prop);
          if (mapped.prop === "content" && typeof value === "string") {
            const m = value.match(/^['"]([\s\S]*)['"]$/);
            if (m) {
              value = `"${m[1]}"`;
            } else if (!value.startsWith('"') && !value.endsWith('"')) {
              value = `"${value}"`;
            }
          }
          out[mapped.prop] = value;
        }
      }
    }
    return out;
  };

  const isPlainTemplateLiteral = (node: ExpressionKind | null | undefined): boolean =>
    !!node && typeof node === "object" && (node as { type?: string }).type === "TemplateLiteral";

  // Helper to detect if a conditional test expression accesses theme.* (e.g., props.theme.isDark)
  // StyleX doesn't have runtime theme access, so we need to bail out with a warning.
  const isThemeAccessTest = (test: ExpressionKind, paramName: string | null): boolean => {
    const check = (node: ExpressionKind): boolean => {
      const info = extractRootAndPath(node);
      if (info && paramName && info.rootName === paramName && info.path[0] === "theme") {
        return true;
      }
      // Check UnaryExpression: !props.theme.isDark
      if (node.type === "UnaryExpression" && node.operator === "!" && node.argument) {
        return check(node.argument as ExpressionKind);
      }
      // Check BinaryExpression: props.theme.mode === "dark"
      if (node.type === "BinaryExpression") {
        return check(node.left as ExpressionKind) || check(node.right as ExpressionKind);
      }
      // Check LogicalExpression: props.theme.isDark && props.enabled
      if (node.type === "LogicalExpression") {
        return check(node.left as ExpressionKind) || check(node.right as ExpressionKind);
      }
      return false;
    };
    return check(test);
  };

  const tryHandleCssHelperConditionalBlock = createCssHelperConditionalHandler({
    ...sharedFromState,
    decl,
    componentInfo,
    handlerContext,
    styleObj,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    resolveStaticCssBlock,
    isPlainTemplateLiteral,
    isThemeAccessTest,
    applyVariant,
    dropAllTestInfoProps,
    annotateParamFromJsxProp,
    findJsxPropTsType, isJsxPropOptional,
    extraStyleObjects,
    resolvedStyleObjects: state.resolvedStyleObjects,
  });

  return {
    state,
    decl,
    styleObj,
    perPropPseudo,
    perPropMedia,
    perPropComputedMedia,
    nestedSelectors,
    variantBuckets,
    variantStyleKeys,
    extraStyleObjects,
    styleFnFromProps,
    styleFnDecls,
    attrBuckets,
    inlineStyleProps,
    localVarValues,
    cssHelperPropValues,
    resolveComposedDefaultValue,
    getComposedDefaultValue,
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    isJsxPropOptional,
    applyVariant,
    dropAllTestInfoProps,
    tryHandleMappedFunctionColor,
    tryHandleLogicalOrDefault,
    tryHandleConditionalPropCoalesceWithTheme,
    tryHandleEnumIfChainValue,
    tryHandleThemeIndexedLookup,
    handlerContext,
    componentInfo,
    tryHandlePropertyTernaryTemplateLiteral,
    tryHandleCssHelperFunctionSwitchBlock,
    resolveStaticCssBlock,
    isPlainTemplateLiteral,
    isThemeAccessTest,
    tryHandleCssHelperConditionalBlock,
  };
}
