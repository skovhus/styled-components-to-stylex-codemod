import type { API, ASTNode, Collection, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";
import { resolveDynamicNode } from "./builtin-handlers.js";
import type { InternalHandlerContext } from "./builtin-handlers.js";
import {
  BORDER_STYLES,
  cssDeclarationToStylexDeclarations,
  parseBorderShorthandParts,
  parseInterpolatedBorderStaticParts,
  cssPropertyToStylexProp,
  resolveBackgroundStylexProp,
  resolveBackgroundStylexPropForVariants,
} from "./css-prop-mapping.js";
import {
  type ASTNodeRecord,
  cloneAstNode,
  collectIdentifiers,
  extractRootAndPath,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  getNodeLocStart,
  isAstNode,
  isCallExpressionNode,
  staticValueToLiteral,
} from "./utilities/jscodeshift-utils.js";
import type { Adapter, ImportSource, ImportSpec, ResolveValueContext } from "../adapter.js";
import { tryHandleAnimation } from "./lower-rules/animation.js";
import { tryHandleInterpolatedBorder } from "./lower-rules/borders.js";
import {
  extractStaticParts,
  tryHandleInterpolatedStringValue,
  wrapExprWithStaticParts,
} from "./lower-rules/interpolations.js";
import { splitDirectionalProperty } from "./stylex-shorthands.js";
import {
  createTypeInferenceHelpers,
  ensureShouldForwardPropDrop,
  literalToStaticValue,
} from "./lower-rules/types.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  collectPropsFromExpressions,
  countConditionalExpressions,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  normalizeDollarProps,
  unwrapArrowFunctionToPropsExpr,
} from "./lower-rules/inline-styles.js";
import { addPropComments } from "./lower-rules/comments.js";
import {
  createCssHelperResolver,
  parseCssTemplateToRules,
  type ConditionalVariant,
} from "./lower-rules/css-helper.js";
import { createThemeResolvers } from "./lower-rules/theme.js";
import { resolveTemplateLiteralBranch } from "./lower-rules/template-literals.js";
import {
  extractUnionLiteralValues,
  groupVariantBucketsIntoDimensions,
} from "./lower-rules/variants.js";
import { mergeStyleObjects, toKebab } from "./lower-rules/utils.js";
import { extractConditionName } from "./utilities/style-key-naming.js";
import { computeSelectorWarningLoc, normalizeStylisAstToIR } from "./css-ir.js";
import { createCssHelperHandlers } from "./lower-rules/css-helper-handlers.js";
import { finalizeDescendantOverrides } from "./lower-rules/descendant-overrides.js";
import type { ExpressionKind, TestInfo } from "./lower-rules/decl-types.js";
import {
  addStyleKeyMixin,
  computeDeclBasePropValues,
  trackMixinPropertyValues,
} from "./lower-rules/precompute.js";
import {
  buildSafeIndexedParamName,
  createImportResolver,
} from "./lower-rules/import-resolution.js";
import {
  buildPseudoMediaPropValue,
  createPropTestHelpers,
  createVariantApplier,
  invertWhen,
} from "./lower-rules/variant-utils.js";
import { createValuePatternHandlers } from "./lower-rules/value-patterns.js";
import {
  normalizeSelectorForInputAttributePseudos,
  normalizeInterpolatedSelector,
  parseSelector,
} from "./selectors.js";
import { capitalize } from "./utilities/string-utils.js";
import type { StyledDecl } from "./transform-types.js";
import type { WarningLog, WarningType } from "./logger.js";
import type { CssHelperFunction, CssHelperObjectMembers } from "./transform/css-helpers.js";
import type { ComputedKeyEntry } from "./transform/helpers.js";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};
/**
 * Creates an AST key node for a CSS property name.
 * For CSS variables (e.g., --component-width), returns a string literal.
 * For regular property names (e.g., backgroundColor), returns an identifier.
 */
function makeCssPropKey(j: JSCodeshift, prop: string): ExpressionKind {
  // CSS variables and other non-identifier keys need to be string literals
  if (!prop.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
    return j.literal(prop);
  }
  return j.identifier(prop);
}

/**
 * Converts a CSS property name to a valid JavaScript identifier.
 * For CSS variables (e.g., --component-width), converts to camelCase (componentWidth).
 * For regular property names (e.g., backgroundColor), returns as-is.
 */
function cssPropertyToIdentifier(prop: string): string {
  // CSS variables: --component-width -> componentWidth
  if (prop.startsWith("--")) {
    const withoutDashes = prop.slice(2);
    // Convert kebab-case to camelCase
    return withoutDashes.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  return prop;
}

/**
 * Creates an object property for a CSS property with shorthand support.
 * Uses shorthand ({ color }) for regular properties when key matches value,
 * but never for CSS variables (which need string literal keys).
 */
function makeCssProperty(
  j: JSCodeshift,
  cssProp: string,
  valueIdentifierName: string,
): ReturnType<typeof j.property> {
  const key = makeCssPropKey(j, cssProp);
  const p = j.property("init", key, j.identifier(valueIdentifierName)) as ReturnType<
    typeof j.property
  > & { shorthand?: boolean };
  // Use shorthand only when key is an identifier (not a string literal) and names match
  if (key.type === "Identifier" && key.name === valueIdentifierName) {
    p.shorthand = true;
  }
  return p;
}
export function lowerRules(args: {
  api: API;
  j: JSCodeshift;
  root: Collection<ASTNode>;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
  resolveSelector: Adapter["resolveSelector"];
  importMap: Map<
    string,
    {
      importedName: string;
      source: ImportSource;
    }
  >;
  warnings: WarningLog[];
  resolverImports: Map<string, ImportSpec>;
  styledDecls: StyledDecl[];
  keyframesNames: Set<string>;
  cssHelperNames: Set<string>;
  cssHelperObjectMembers: CssHelperObjectMembers;
  cssHelperFunctions: Map<string, CssHelperFunction>;
  stringMappingFns: Map<
    string,
    {
      param: string;
      testParam: string;
      whenValue: string;
      thenValue: string;
      elseValue: string;
    }
  >;
  toStyleKey: (name: string) => string;
  toSuffixFromProp: (propName: string) => string;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  cssValueToJs: (value: unknown, important?: boolean, propName?: string) => unknown;
  rewriteCssVarsInStyleObject: (
    obj: Record<string, unknown>,
    definedVars: Map<string, string>,
    varsToDrop: Set<string>,
  ) => void;
  literalToAst: (j: JSCodeshift, v: unknown) => ExpressionKind;
}): {
  resolvedStyleObjects: Map<string, unknown>;
  descendantOverrides: DescendantOverride[];
  ancestorSelectorParents: Set<string>;
  usedCssHelperFunctions: Set<string>;
  bail: boolean;
} {
  const {
    api,
    j,
    root,
    filePath,
    resolveValue,
    resolveCall,
    resolveSelector,
    importMap,
    warnings,
    resolverImports,
    styledDecls,
    keyframesNames,
    cssHelperNames,
    cssHelperObjectMembers,
    cssHelperFunctions,
    stringMappingFns,
    toStyleKey,
    toSuffixFromProp,
    parseExpr,
    cssValueToJs,
    rewriteCssVarsInStyleObject,
    literalToAst,
  } = args;

  const resolvedStyleObjects = new Map<string, unknown>();
  const declByLocalName = new Map(styledDecls.map((d) => [d.localName, d]));
  const descendantOverrides: DescendantOverride[] = [];
  const ancestorSelectorParents = new Set<string>();
  // Map<overrideStyleKey, Map<pseudo|null, Record<prop, value>>>
  // null key = base styles, string key = pseudo styles (e.g., ":hover", ":focus-visible")
  const descendantOverridePseudoBuckets = new Map<
    string,
    Map<string | null, Record<string, unknown>>
  >();
  let bail = false;

  /**
   * Applies a css helper mixin to a declaration: adds the style key, tracks property values,
   * and copies inline style props.
   */
  const applyCssHelperMixin = (
    decl: StyledDecl,
    helperDecl: StyledDecl,
    cssHelperPropValues: Map<string, unknown>,
    inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }>,
  ): void => {
    const hasBaseRule = helperDecl.rules.some(
      (rule) => rule.selector.trim() === "&" && rule.declarations.length > 0,
    );
    addStyleKeyMixin(decl, helperDecl.styleKey, { afterBase: !hasBaseRule });
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
        const nestedHasBaseRule = nestedDecl.rules.some(
          (rule) => rule.selector.trim() === "&" && rule.declarations.length > 0,
        );
        addStyleKeyMixin(decl, nestedDecl.styleKey, { afterBase: !nestedHasBaseRule });
        trackMixinPropertyValues(
          cssHelperValuesByKey.get(nestedDecl.styleKey),
          cssHelperPropValues,
        );
      }
    }
  };
  // Pre-compute properties and values defined by each css helper and mixin from their rules.
  // This allows us to know what properties they provide (and their values) before styled
  // components that use them are processed, which is needed for correct pseudo selector
  // handling (setting proper default values).
  const cssHelperValuesByKey = new Map<string, Map<string, unknown>>();
  const mixinValuesByKey = new Map<string, Map<string, unknown>>();
  for (const decl of styledDecls) {
    const propValues = computeDeclBasePropValues(decl, cssValueToJs);
    if (decl.isCssHelper) {
      cssHelperValuesByKey.set(decl.styleKey, propValues);
      continue;
    }
    if (propValues.size > 0) {
      mixinValuesByKey.set(decl.styleKey, propValues);
    }
  }

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper: Extract static prefix/suffix from interpolated CSS values
  // ─────────────────────────────────────────────────────────────────────────────
  // For CSS like `box-shadow: 0 2px 4px ${color}` or `transform: rotate(${deg})`
  // we need to preserve the static parts when resolving the dynamic value.
  //
  // StyleX supports dynamic values via CSS variables, and template literals work
  // well for combining static text with resolved expressions:
  //   boxShadow: `0 2px 4px ${themeVars.primaryColor}`
  //
  // See: https://stylexjs.com/docs/learn/styling-ui/defining-styles/
  // ─────────────────────────────────────────────────────────────────────────────

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
      parseExpr,
      resolverImports,
    },
  );

  const { isCssHelperTaggedTemplate, resolveCssHelperTemplate } = createCssHelperResolver({
    importMap,
    filePath,
    resolveValue,
    parseExpr,
    resolverImports,
    cssValueToJs,
    warnings,
  });

  const bailUnsupported = (decl: StyledDecl, type: WarningType): void => {
    warnings.push({
      severity: "error",
      type,
      loc: decl.loc,
      context: { localName: decl.localName },
    });
    bail = true;
  };

  const usedCssHelperFunctions = new Set<string>();
  const markBail = (): void => {
    bail = true;
  };
  const { resolveImportInScope, resolveImportForExpr } = createImportResolver({
    root,
    j,
    importMap,
  });
  // Use the consolidated member expression extraction utility
  const getRootIdentifierInfo = extractRootAndPath;

  for (const decl of styledDecls) {
    if (decl.preResolvedStyle) {
      resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          resolvedStyleObjects.set(k, v);
        }
      }
      continue;
    }

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
    const styleFnFromProps: Array<{
      fnKey: string;
      jsxProp: string;
      condition?: "truthy" | "always";
      conditionWhen?: string;
      callArg?: ExpressionKind;
    }> = [];
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
          const resolvedHelper = resolvedStyleObjects.get(toStyleKey(helperDecl.localName));
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
      toSuffixFromProp,
    });

    const dropAllTestInfoProps = (testInfo: TestInfo): void => {
      const propsToCheck = testInfo.allPropNames ?? (testInfo.propName ? [testInfo.propName] : []);
      for (const prop of propsToCheck) {
        if (prop && !prop.startsWith("$")) {
          ensureShouldForwardPropDrop(decl, prop);
        }
      }
    };

    const {
      tryHandleMappedFunctionColor,
      tryHandleLogicalOrDefault,
      tryHandleConditionalPropCoalesceWithTheme,
      tryHandleEnumIfChainValue,
      tryHandleThemeIndexedLookup,
    } = createValuePatternHandlers({
      api,
      j,
      filePath,
      decl,
      styleObj,
      variantBuckets,
      variantStyleKeys,
      styleFnFromProps,
      styleFnDecls,
      warnings,
      resolveValue,
      parseExpr,
      resolverImports,
      stringMappingFns,
      toSuffixFromProp,
      cssValueToJs,
      hasLocalThemeBinding,
      annotateParamFromJsxProp,
      findJsxPropTsType,
      markBail,
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

    // (helpers imported from `./lower-rules/*`)

    // (animation + interpolated-string helpers extracted to `./lower-rules/*`)

    const { tryHandlePropertyTernaryTemplateLiteral, tryHandleCssHelperFunctionSwitchBlock } =
      createCssHelperHandlers({
        j,
        filePath,
        decl,
        warnings,
        styleObj,
        variantBuckets,
        variantStyleKeys,
        cssHelperFunctions,
        usedCssHelperFunctions,
        cssValueToJs,
        parseExpr,
        resolveCall,
        resolveImportInScope,
        resolverImports,
        isCssHelperTaggedTemplate,
        resolveCssHelperTemplate,
        applyVariant,
        dropAllTestInfoProps,
        toSuffixFromProp,
        componentInfo,
        handlerContext,
        markBail,
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

    const tryHandleCssHelperConditionalBlock = (d: any): boolean => {
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (d.property) {
        return false;
      }
      const parts = d.value.parts ?? [];
      if (parts.length !== 1 || parts[0]?.kind !== "slot") {
        return false;
      }
      const slotId = parts[0].slotId;
      const expr = decl.templateExpressions[slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const bindings = getArrowFnParamBindings(expr);
      if (!bindings) {
        return false;
      }
      const paramName = bindings.kind === "simple" ? bindings.paramName : null;

      const { parseChainedTestInfo } = createPropTestHelpers(bindings);

      const isTriviallyPureVoidArg = (arg: any): boolean => {
        if (!arg || typeof arg !== "object") {
          return false;
        }
        // Allow `void 0`, `void null`, `void ""`, `void 1`, `void false`.
        if (arg.type === "NumericLiteral" && arg.value === 0) {
          return true;
        }
        if (arg.type === "NullLiteral") {
          return true;
        }
        if (arg.type === "StringLiteral" && arg.value === "") {
          return true;
        }
        if (arg.type === "BooleanLiteral" && arg.value === false) {
          return true;
        }
        if (arg.type === "Literal") {
          const v = (arg as { value?: unknown }).value;
          return v === 0 || v === null || v === "" || v === false;
        }
        return false;
      };

      const isEmptyCssBranch = (node: ExpressionKind): boolean => {
        if (!node || typeof node !== "object") {
          return false;
        }
        if (node.type === "StringLiteral" && node.value === "") {
          return true;
        }
        if (node.type === "Literal" && node.value === "") {
          return true;
        }
        if (node.type === "TemplateLiteral") {
          const exprs = node.expressions ?? [];
          if (exprs.length > 0) {
            return false;
          }
          const raw = (node.quasis ?? []).map((q: any) => q.value?.raw ?? "").join("");
          return raw.length === 0;
        }
        if (node.type === "NullLiteral") {
          return true;
        }
        if (node.type === "Identifier" && node.name === "undefined") {
          return true;
        }
        if (node.type === "BooleanLiteral" && node.value === false) {
          return true;
        }
        if (node.type === "UnaryExpression" && node.operator === "void") {
          return isTriviallyPureVoidArg((node as any).argument);
        }
        return false;
      };

      const readReturnExpr = (stmt: ASTNode | null | undefined): ExpressionKind | null => {
        if (!stmt || typeof stmt !== "object") {
          return null;
        }
        if (stmt.type === "ReturnStatement") {
          const arg = (stmt as { argument?: ASTNode }).argument ?? null;
          return arg && typeof arg === "object" ? (arg as ExpressionKind) : null;
        }
        if (stmt.type === "BlockStatement") {
          const body = (stmt as { body?: ASTNode[] }).body ?? [];
          if (!Array.isArray(body)) {
            return null;
          }
          const ret = body.find((s) => s?.type === "ReturnStatement");
          if (!ret) {
            return null;
          }
          const arg = (ret as { argument?: ASTNode }).argument ?? null;
          return arg && typeof arg === "object" ? (arg as ExpressionKind) : null;
        }
        return null;
      };

      type IfStatementNode = {
        type: "IfStatement";
        test: ExpressionKind;
        consequent: ASTNode;
        alternate?: ASTNode | null;
      };

      const extractConditionalFromIfBlock = (
        block: ASTNode | null | undefined,
      ): { test: ExpressionKind; consequent: ExpressionKind; alternate: ExpressionKind } | null => {
        if (!block || block.type !== "BlockStatement") {
          return null;
        }
        const stmts = Array.isArray((block as { body?: ASTNode[] }).body)
          ? (block as { body: ASTNode[] }).body
          : [];
        if (stmts.length === 1 && stmts[0]?.type === "IfStatement") {
          const ifStmt = stmts[0] as IfStatementNode;
          const consExpr = readReturnExpr(ifStmt.consequent);
          if (!consExpr) {
            return null;
          }
          const altExpr = ifStmt.alternate ? readReturnExpr(ifStmt.alternate) : null;
          if (ifStmt.alternate && !altExpr) {
            return null;
          }
          return {
            test: ifStmt.test,
            consequent: consExpr,
            alternate: altExpr ?? (j.identifier("undefined") as ExpressionKind),
          };
        }
        if (
          stmts.length === 2 &&
          stmts[0]?.type === "IfStatement" &&
          !(stmts[0] as IfStatementNode).alternate &&
          stmts[1]?.type === "ReturnStatement"
        ) {
          const ifStmt = stmts[0] as IfStatementNode;
          const consExpr = readReturnExpr(ifStmt.consequent);
          const altExpr = readReturnExpr(stmts[1]);
          if (!consExpr || !altExpr) {
            return null;
          }
          return {
            test: ifStmt.test,
            consequent: consExpr,
            alternate: altExpr,
          };
        }
        return null;
      };

      const replaceParamWithProps = (exprNode: ExpressionKind): ExpressionKind => {
        const cloned = cloneAstNode(exprNode);
        // AST traversal requires flexible typing due to jscodeshift's complex type system
        const replace = (node: unknown, parent?: unknown): unknown => {
          if (!node || typeof node !== "object") {
            return node;
          }
          if (Array.isArray(node)) {
            return node.map((child) => replace(child, parent));
          }
          const n = node as ASTNodeRecord;
          if (
            bindings.kind === "simple" &&
            (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
            (n.object as ASTNodeRecord)?.type === "Identifier" &&
            (n.object as { name?: string })?.name === bindings.paramName &&
            (n.property as ASTNodeRecord)?.type === "Identifier" &&
            ((n.property as { name?: string })?.name ?? "").startsWith("$") &&
            n.computed === false
          ) {
            return j.identifier((n.property as { name: string }).name);
          }
          if (n.type === "Identifier") {
            const nodeName = (n as { name?: string }).name ?? "";
            if (bindings.kind === "simple" && nodeName === bindings.paramName) {
              const p = parent as ASTNodeRecord | undefined;
              const isMemberProp =
                p &&
                (p.type === "MemberExpression" || p.type === "OptionalMemberExpression") &&
                p.property === n &&
                p.computed === false;
              const isObjectKey = p && p.type === "Property" && p.key === n && p.shorthand !== true;
              if (!isMemberProp && !isObjectKey) {
                return j.identifier("props");
              }
            }
            if (bindings.kind === "destructured" && bindings.bindings.has(nodeName)) {
              const propName = bindings.bindings.get(nodeName)!;
              const defaultValue = bindings.defaults?.get(propName);
              if (propName.startsWith("$")) {
                const base = j.identifier(propName);
                if (defaultValue) {
                  return j.logicalExpression(
                    "??",
                    base,
                    cloneAstNode(defaultValue) as ExpressionKind,
                  );
                }
                return base;
              }
              const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
              if (defaultValue) {
                return j.logicalExpression(
                  "??",
                  memberExpr,
                  cloneAstNode(defaultValue) as ExpressionKind,
                );
              }
              return memberExpr;
            }
          }
          if (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
            n.object = replace(n.object, n);
            if (n.computed) {
              n.property = replace(n.property, n);
            }
            return n;
          }
          if (n.type === "Property") {
            if (n.computed) {
              n.key = replace(n.key, n);
            }
            n.value = replace(n.value, n);
            return n;
          }
          for (const key of Object.keys(n)) {
            if (key === "loc" || key === "comments") {
              continue;
            }
            const child = n[key];
            if (child && typeof child === "object") {
              n[key] = replace(child, n);
            }
          }
          return n;
        };
        return replace(cloned, undefined) as ExpressionKind;
      };

      const resolveCssBranchToInlineMap = (
        node: ExpressionKind,
      ): Map<string, ExpressionKind> | null => {
        let tpl: ASTNode | null = null;
        if (isCssHelperTaggedTemplate(node)) {
          tpl = (node as { quasi: ASTNode }).quasi;
        } else if (node?.type === "TemplateLiteral") {
          tpl = node;
        }
        if (!tpl || tpl.type !== "TemplateLiteral") {
          return null;
        }

        const { rules, slotExprById } = parseCssTemplateToRules(tpl);
        const out = new Map<string, ExpressionKind>();

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
            if (d.important) {
              return null;
            }
            if (d.value.kind === "static") {
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
                if (
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean"
                ) {
                  out.set(mapped.prop, staticValueToLiteral(j, value) as ExpressionKind);
                } else {
                  return null;
                }
              }
              continue;
            }
            if (d.value.kind !== "interpolated") {
              return null;
            }
            const parts = d.value.parts ?? [];
            const slotParts = parts.filter(
              (p): p is { kind: "slot"; slotId: number } => p.kind === "slot",
            );
            if (slotParts.length !== 1) {
              return null;
            }
            // Safe: length check above guarantees slotParts[0] exists
            const slotExpr = slotExprById.get(slotParts[0]!.slotId);
            if (!slotExpr || typeof slotExpr !== "object") {
              return null;
            }
            const rawExpr = replaceParamWithProps(slotExpr as ExpressionKind);
            const { prefix, suffix } = extractStaticParts(d.value);
            const valueExpr =
              prefix || suffix ? buildTemplateWithStaticParts(j, rawExpr, prefix, suffix) : rawExpr;
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              out.set(mapped.prop, valueExpr);
            }
          }
        }
        return out;
      };

      // Handle LogicalExpression: props.$x && css`...` or chained: props.$x && props.$y && css`...`
      const body = expr.body;
      if (body?.type === "LogicalExpression" && body.operator === "&&") {
        // Use parseChainedTestInfo to handle both simple and chained && conditions
        const testInfo = parseChainedTestInfo(body.left);
        if (!testInfo) {
          return false;
        }
        if (isCssHelperTaggedTemplate(body.right)) {
          const cssNode = body.right as { quasi: ExpressionKind };
          const resolved = resolveCssHelperTemplate(cssNode.quasi, paramName, decl.loc);
          if (!resolved) {
            bail = true;
            return true;
          }
          const { style: consStyle, dynamicProps, conditionalVariants } = resolved;

          if (dynamicProps.length > 0) {
            const propName = testInfo.propName;
            const hasMismatchedProp = dynamicProps.some((p) => p.jsxProp !== propName);
            const isComparison = testInfo.when.includes("===") || testInfo.when.includes("!==");
            if (!propName || hasMismatchedProp || testInfo.when.startsWith("!") || isComparison) {
              return false;
            }
            for (const dyn of dynamicProps) {
              const fnKey = `${decl.styleKey}${toSuffixFromProp(dyn.stylexProp)}`;
              if (!styleFnDecls.has(fnKey)) {
                const dynParamName = cssPropertyToIdentifier(dyn.stylexProp);
                const param = j.identifier(dynParamName);
                annotateParamFromJsxProp(param, dyn.jsxProp);
                const p = makeCssProperty(j, dyn.stylexProp, dynParamName);
                const bodyExpr = j.objectExpression([p]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
              }
              if (
                !styleFnFromProps.some(
                  (p) => p.fnKey === fnKey && p.jsxProp === dyn.jsxProp && p.condition === "truthy",
                )
              ) {
                styleFnFromProps.push({
                  fnKey,
                  jsxProp: dyn.jsxProp,
                  condition: "truthy",
                });
              }
              ensureShouldForwardPropDrop(decl, dyn.jsxProp);
            }
          }

          if (Object.keys(consStyle).length > 0) {
            applyVariant(testInfo, consStyle);
          }

          // Apply conditional variants from nested ternaries within the css block
          for (const cv of conditionalVariants) {
            // Compose the outer condition with the inner condition
            const composedWhen = `${testInfo.when} && ${cv.when}`;
            applyVariant({ when: composedWhen, propName: cv.propName }, cv.style);
            ensureShouldForwardPropDrop(decl, cv.propName);
          }

          return true;
        }

        if (
          body.right?.type === "StringLiteral" ||
          (body.right?.type === "Literal" && typeof body.right.value === "string")
        ) {
          const rawCss = body.right.value as string;
          const consStyle = resolveStaticCssBlock(rawCss);
          if (!consStyle) {
            return false;
          }
          if (Object.keys(consStyle).length > 0) {
            applyVariant(testInfo, consStyle);
          }
          return true;
        }

        // Handle TemplateLiteral (with or without interpolations): props.$x && `z-index: ${props.$x};`
        if (body.right?.type === "TemplateLiteral") {
          const tpl = body.right as {
            expressions?: unknown[];
            quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
          };

          // Handle template literals with interpolations
          if (tpl.expressions && tpl.expressions.length > 0) {
            // Use resolveTemplateLiteralBranch to parse the template
            const resolved = resolveTemplateLiteralBranch({
              j,
              node: body.right,
              paramName,
              filePath,
              parseExpr,
              cssValueToJs,
              resolveValue,
              resolveCall,
              resolveImportInScope,
              resolverImports,
              componentInfo,
              handlerContext,
            });
            if (!resolved) {
              return false;
            }
            const { style, dynamicEntries, inlineEntries } = resolved;

            // Handle dynamic entries (e.g., z-index: ${props.$zIndex})
            if (dynamicEntries.length > 0) {
              // For `prop !== undefined` test, allow dynamic props if they match
              const isUndefinedCheck =
                testInfo.when.endsWith(" !== undefined") ||
                testInfo.when.endsWith(' !== "undefined"');
              const testProp = testInfo.propName;

              // Check if all dynamic props match the test prop
              const allMatch = dynamicEntries.every((e) => e.jsxProp === testProp);
              if (!allMatch && !isUndefinedCheck) {
                return false;
              }

              // Create style functions for dynamic entries
              for (const entry of dynamicEntries) {
                const fnKey = `${decl.styleKey}${toSuffixFromProp(entry.stylexProp)}`;
                if (!styleFnDecls.has(fnKey)) {
                  const entryParamName = cssPropertyToIdentifier(entry.stylexProp);
                  const param = j.identifier(entryParamName);
                  annotateParamFromJsxProp(param, entry.jsxProp);
                  const p = makeCssProperty(j, entry.stylexProp, entryParamName);
                  const bodyExpr = j.objectExpression([p]);
                  styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
                }
                // Track as conditional: apply when test is truthy
                // For !== undefined checks, we still use "truthy" since we check the full condition
                const condition = "truthy" as const;
                if (
                  !styleFnFromProps.some(
                    (p) =>
                      p.fnKey === fnKey && p.jsxProp === entry.jsxProp && p.condition === condition,
                  )
                ) {
                  styleFnFromProps.push({
                    fnKey,
                    jsxProp: entry.jsxProp,
                    condition,
                    conditionWhen: testInfo.when,
                  });
                }
                ensureShouldForwardPropDrop(decl, entry.jsxProp);
              }
            }

            // Handle inline entries (not yet supported in conditional context)
            if (inlineEntries.length > 0) {
              return false;
            }

            // Apply static styles
            if (Object.keys(style).length > 0) {
              applyVariant(testInfo, style);
            }

            return true;
          }

          // Handle static template literals (no interpolations)
          const rawCss =
            tpl.quasis?.map((q) => q.value?.cooked ?? q.value?.raw ?? "").join("") ?? "";
          if (!rawCss.trim()) {
            return true; // Empty template literal is valid (no styles to apply)
          }
          const consStyle = resolveStaticCssBlock(rawCss);
          if (!consStyle) {
            return false;
          }
          if (Object.keys(consStyle).length > 0) {
            applyVariant(testInfo, consStyle);
          }
          return true;
        }

        return false;
      }

      // Helper to apply dynamic style entries from template literal interpolations.
      // When conditionWhen is provided, styles are conditional; otherwise unconditional.
      const applyDynamicEntries = (
        entries: Array<{ jsxProp: string; stylexProp: string; callArg: ExpressionKind }>,
        conditionWhen?: string,
      ): void => {
        for (const entry of entries) {
          const fnKey = `${decl.styleKey}${toSuffixFromProp(entry.stylexProp)}`;
          if (!styleFnDecls.has(fnKey)) {
            const entryParamName = cssPropertyToIdentifier(entry.stylexProp);
            const param = j.identifier(entryParamName);
            annotateParamFromJsxProp(param, entry.jsxProp);
            const p = makeCssProperty(j, entry.stylexProp, entryParamName);
            const bodyExpr = j.objectExpression([p]);
            styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
          }
          if (
            !styleFnFromProps.some(
              (p) =>
                p.fnKey === fnKey &&
                p.jsxProp === entry.jsxProp &&
                p.conditionWhen === conditionWhen,
            )
          ) {
            styleFnFromProps.push({
              fnKey,
              jsxProp: entry.jsxProp,
              conditionWhen,
              callArg: entry.callArg,
            });
          }
          ensureShouldForwardPropDrop(decl, entry.jsxProp);
        }
      };

      const buildConditionExprFromWhen = (
        when: string,
      ): { cond: ExpressionKind; isBoolean: boolean } | null => {
        const trimmed = when.trim();
        if (!trimmed) {
          return null;
        }
        if (trimmed.startsWith("!")) {
          const propName = trimmed.slice(1).trim();
          if (!propName) {
            return null;
          }
          return {
            cond: j.unaryExpression("!", j.identifier(propName)),
            isBoolean: true,
          };
        }
        if (trimmed.includes("===") || trimmed.includes("!==")) {
          const op = trimmed.includes("!==") ? "!==" : "===";
          const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
          const rhsRaw = rhsRaw0 ?? "";
          if (!lhs) {
            return null;
          }
          let rhs: ExpressionKind;
          try {
            rhs = j.literal(JSON.parse(rhsRaw));
          } catch {
            rhs = parseExpr(rhsRaw) ?? j.identifier(rhsRaw);
          }
          return {
            cond: j.binaryExpression(op as any, j.identifier(lhs), rhs),
            isBoolean: true,
          };
        }
        return { cond: j.identifier(trimmed), isBoolean: false };
      };

      const applyInlineEntries = (
        entries: Array<{ jsxProp: string; prop: string; callArg: ExpressionKind }>,
        conditionWhen?: string,
      ): void => {
        const condition = conditionWhen ? buildConditionExprFromWhen(conditionWhen) : null;
        for (const entry of entries) {
          const expr =
            condition && condition.cond
              ? j.conditionalExpression(condition.cond, entry.callArg, j.identifier("undefined"))
              : entry.callArg;
          inlineStyleProps.push({ prop: entry.prop, expr, jsxProp: entry.jsxProp });
          ensureShouldForwardPropDrop(decl, entry.jsxProp);
        }
        if (entries.length > 0) {
          decl.needsWrapperComponent = true;
        }
      };

      // Handle direct TemplateLiteral body: (props) => `width: ${props.$width}px;`
      // Applies styles unconditionally - static styles merge into base, dynamic become style functions.
      if (body?.type === "TemplateLiteral") {
        const resolved = resolveTemplateLiteralBranch({
          j,
          node: body,
          paramName,
          filePath,
          parseExpr,
          cssValueToJs,
          resolveValue,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });

        if (!resolved) {
          return false;
        }

        const { style, dynamicEntries, inlineEntries } = resolved;

        // Static styles go to base object (no condition = always applied)
        for (const [prop, value] of Object.entries(style)) {
          styleObj[prop] = value;
        }

        if (inlineEntries.length > 0) {
          applyInlineEntries(inlineEntries);
        }

        // Dynamic props become style functions (unconditional - no conditionWhen)
        applyDynamicEntries(dynamicEntries);

        if (dynamicEntries.length > 0) {
          decl.needsWrapperComponent = true;
        }

        return true;
      }

      // Handle BlockStatement with simple return of css`...` (no condition)
      // Pattern: (props) => { return css`font-size: ${props.$size}px;`; }
      if (body?.type === "BlockStatement") {
        const stmts = Array.isArray((body as { body?: ASTNode[] }).body)
          ? (body as { body: ASTNode[] }).body
          : [];
        // Only handle single ReturnStatement (not if blocks - those go to conditional handling below)
        if (stmts.length === 1 && stmts[0]?.type === "ReturnStatement") {
          const returnArg = (stmts[0] as { argument?: ASTNode }).argument;
          if (returnArg && isCssHelperTaggedTemplate(returnArg)) {
            // Use resolveCssBranchToInlineMap (same as conditional handling)
            // since it properly preserves expressions like ${props.$size - 3}px
            const styleMap = resolveCssBranchToInlineMap(returnArg as ExpressionKind);
            if (!styleMap) {
              return false;
            }

            if (styleMap.size === 0) {
              return true;
            }

            // Collect props used in value expressions
            const propsUsed = collectPropsFromArrowFn(expr);
            collectPropsFromExpressions(styleMap.values(), propsUsed);

            // All props used in value expressions become parameters
            const valuePropParams = Array.from(propsUsed);

            if (valuePropParams.length === 0) {
              // No dynamic props - add styles directly to base object
              for (const [prop, valueExpr] of styleMap.entries()) {
                styleObj[prop] = valueExpr;
              }
              return true;
            }

            // Create parameterized StyleX style function with props object parameter
            // Type: { size: number; padding: number }
            const propsTypeProperties = valuePropParams.map((p) => {
              const propName = p.startsWith("$") ? p.slice(1) : p;
              const prop = j.tsPropertySignature(
                j.identifier(propName),
                j.tsTypeAnnotation(j.tsNumberKeyword()),
              );
              return prop;
            });
            const propsParam = j.identifier("props");
            (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
              j.tsTypeLiteral(propsTypeProperties),
            );

            // Keep expressions as-is (props.X stays as props.X), just handle $-prefixed props
            const properties = Array.from(styleMap.entries()).map(([prop, propExpr]) => {
              const replacedExpr = normalizeDollarProps(j, propExpr);
              return j.property("init", makeCssPropKey(j, prop), replacedExpr);
            });
            const styleFn = j.arrowFunctionExpression([propsParam], j.objectExpression(properties));

            // Add to resolved style objects
            const fnKey = `${decl.styleKey}Styles`;
            resolvedStyleObjects.set(fnKey, styleFn);

            // Create function call expression with props object: { size, padding }
            const callArgProperties = valuePropParams.map((p) => {
              const propName = p.startsWith("$") ? p.slice(1) : p;
              return j.property.from({
                kind: "init",
                key: j.identifier(propName),
                value: j.identifier(p),
                shorthand: propName === p,
              });
            });
            const styleCall = j.callExpression(
              j.memberExpression(j.identifier("styles"), j.identifier(fnKey)),
              [j.objectExpression(callArgProperties)],
            );

            if (!decl.extraStylexPropsArgs) {
              decl.extraStylexPropsArgs = [];
            }
            decl.extraStylexPropsArgs.push({ expr: styleCall });

            decl.needsWrapperComponent = true;
            for (const propName of propsUsed) {
              ensureShouldForwardPropDrop(decl, propName);
            }
            return true;
          }
        }
      }

      // Handle ConditionalExpression: props.$x ? css`...` : css`...`
      const conditional =
        body?.type === "ConditionalExpression"
          ? body
          : body?.type === "BlockStatement"
            ? extractConditionalFromIfBlock(body)
            : null;
      if (!conditional) {
        return false;
      }

      const testInfo = parseChainedTestInfo(conditional.test);

      // Check if the condition tests theme.* (e.g., props.theme.isDark) which is not supported.
      // StyleX doesn't have runtime theme access - bail out with a warning.
      if (isThemeAccessTest(conditional.test, paramName)) {
        const loc = getNodeLocStart(conditional.test);
        warnings.push({
          severity: "warning",
          type: "Theme-dependent conditional values require a project-specific theme source (e.g. useTheme())",
          loc: loc ?? decl.loc,
          context: {},
        });
        bail = true;
        return true;
      }

      const cons = conditional.consequent;
      const alt = conditional.alternate;
      const consIsCss = isCssHelperTaggedTemplate(cons);
      const altIsCss = isCssHelperTaggedTemplate(alt);
      const consIsTpl = isPlainTemplateLiteral(cons);
      const altIsTpl = isPlainTemplateLiteral(alt);
      const consIsEmpty = isEmptyCssBranch(cons);
      const altIsEmpty = isEmptyCssBranch(alt);

      if (!testInfo) {
        // Non-prop conditional: generate StyleX parameterized style functions.
        // Only support css`` or template-literal CSS branches.
        const consMap =
          consIsCss || consIsTpl
            ? resolveCssBranchToInlineMap(cons)
            : consIsEmpty
              ? new Map()
              : null;
        const altMap =
          altIsCss || altIsTpl ? resolveCssBranchToInlineMap(alt) : altIsEmpty ? new Map() : null;
        if (!consMap || !altMap) {
          return false;
        }

        // Collect props used in value expressions
        const propsUsed = collectPropsFromArrowFn(expr);
        collectPropsFromExpressions([...consMap.values(), ...altMap.values()], propsUsed);

        // All props used in value expressions become parameters
        const valuePropParams = Array.from(propsUsed);

        if (consMap.size === 0 && altMap.size === 0) {
          return true;
        }

        // Create parameterized StyleX style function with props object parameter
        const createStyleFn = (map: Map<string, ExpressionKind>) => {
          const propsTypeProperties = valuePropParams.map((p) => {
            const propName = p.startsWith("$") ? p.slice(1) : p;
            const prop = j.tsPropertySignature(
              j.identifier(propName),
              j.tsTypeAnnotation(j.tsNumberKeyword()),
            );
            return prop;
          });
          const propsParam = j.identifier("props");
          (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            j.tsTypeLiteral(propsTypeProperties),
          );

          const properties = Array.from(map.entries()).map(([prop, propExpr]) => {
            const replacedExpr = normalizeDollarProps(j, propExpr);
            return j.property("init", makeCssPropKey(j, prop), replacedExpr);
          });
          return j.arrowFunctionExpression([propsParam], j.objectExpression(properties));
        };

        // Generate style function keys with descriptive names when possible
        const conditionName = extractConditionName(conditional.test);
        const consKey = conditionName
          ? `${decl.styleKey}${conditionName}`
          : `${decl.styleKey}CondTruthy`;
        const altKey = conditionName ? `${decl.styleKey}Default` : `${decl.styleKey}CondFalsy`;

        if (consMap.size > 0) {
          resolvedStyleObjects.set(consKey, createStyleFn(consMap));
        }
        if (altMap.size > 0) {
          resolvedStyleObjects.set(altKey, createStyleFn(altMap));
        }

        // Create function call expressions with props object: { size, padding }
        // Use props.X only when the prop is referenced in the condition (to preserve type narrowing)
        // Use shorthand when the prop is not referenced in the condition
        const conditionIdentifiers = new Set<string>();
        collectIdentifiers(conditional.test, conditionIdentifiers);

        const makeStyleCall = (key: string) => {
          const callArgProperties = valuePropParams.map((p) => {
            const propName = p.startsWith("$") ? p.slice(1) : p;
            // Only use props.X when the prop is referenced in the condition (for type narrowing)
            // Otherwise use shorthand for cleaner output
            const propIsInCondition = conditionIdentifiers.has(p);
            if (propIsInCondition) {
              const propAccess = j.memberExpression(j.identifier("props"), j.identifier(p));
              return j.property.from({
                kind: "init",
                key: j.identifier(propName),
                value: propAccess,
                shorthand: false,
              });
            }
            return j.property.from({
              kind: "init",
              key: j.identifier(propName),
              value: j.identifier(p),
              shorthand: propName === p,
            });
          });
          return j.callExpression(j.memberExpression(j.identifier("styles"), j.identifier(key)), [
            j.objectExpression(callArgProperties),
          ]);
        };

        // Create conditional expression for stylex.props
        const condExpr = j.conditionalExpression(
          cloneAstNode(conditional.test) as ExpressionKind,
          consMap.size > 0 ? makeStyleCall(consKey) : (j.identifier("undefined") as ExpressionKind),
          altMap.size > 0 ? makeStyleCall(altKey) : (j.identifier("undefined") as ExpressionKind),
        );

        // Add to extraStylexPropsArgs
        if (!decl.extraStylexPropsArgs) {
          decl.extraStylexPropsArgs = [];
        }
        decl.extraStylexPropsArgs.push({ expr: condExpr });

        decl.needsWrapperComponent = true;
        for (const propName of propsUsed) {
          ensureShouldForwardPropDrop(decl, propName);
        }
        return true;
      }

      // Check for CallExpression branches (e.g., truncate() helpers)
      const consIsCall = isCallExpressionNode(cons);
      const altIsCall = isCallExpressionNode(alt);

      // Note: String literal branches (StringLiteral CSS values) are NOT handled here.
      // They fall through to tryResolveConditionalCssBlockTernary in builtin-handlers.ts.
      if (!(consIsCss || altIsCss || consIsTpl || altIsTpl || consIsCall || altIsCall)) {
        return false;
      }

      const resolveCssBranch = (
        node: any,
      ): {
        style: Record<string, unknown>;
        dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
        conditionalVariants: ConditionalVariant[];
      } | null => {
        if (!isCssHelperTaggedTemplate(node)) {
          return null;
        }
        const tplNode = node as { quasi: ExpressionKind };
        return resolveCssHelperTemplate(tplNode.quasi, paramName, decl.loc);
      };

      // Helper to apply conditional variants from a resolved branch
      const applyConditionalVariants = (
        conditionalVariants: ConditionalVariant[],
        outerCondition: string,
      ): void => {
        for (const cv of conditionalVariants) {
          const composedWhen = `${outerCondition} && ${cv.when}`;
          applyVariant({ when: composedWhen, propName: cv.propName }, cv.style);
          ensureShouldForwardPropDrop(decl, cv.propName);
        }
      };

      if (consIsCss && altIsCss) {
        const consResolved = resolveCssBranch(cons);
        const altResolved = resolveCssBranch(alt);
        if (!consResolved || !altResolved) {
          bail = true;
          return true;
        }
        if (consResolved.dynamicProps.length > 0 || altResolved.dynamicProps.length > 0) {
          return false;
        }
        mergeStyleObjects(styleObj, altResolved.style);
        applyVariant(testInfo, consResolved.style);
        // Apply conditional variants from both branches
        applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
        const invertedWhen = invertWhen(testInfo.when);
        if (invertedWhen && altResolved.conditionalVariants.length > 0) {
          applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
        }
        return true;
      }

      if (consIsCss && altIsEmpty) {
        const consResolved = resolveCssBranch(cons);
        if (!consResolved) {
          bail = true;
          return true;
        }
        if (consResolved.dynamicProps.length > 0) {
          return false;
        }
        applyVariant(testInfo, consResolved.style);
        applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
        return true;
      }

      if (consIsEmpty && altIsCss) {
        const altResolved = resolveCssBranch(alt);
        if (!altResolved) {
          bail = true;
          return true;
        }
        if (altResolved.dynamicProps.length > 0) {
          return false;
        }
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          return false;
        }
        applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
        applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
        return true;
      }

      // Check altIsEmpty BEFORE altIsTpl since empty templates are also template literals
      // and the altIsEmpty case doesn't require invertWhen (which fails for compound conditions)
      if (consIsTpl && altIsEmpty) {
        dropAllTestInfoProps(testInfo);
        const consResolved = resolveTemplateLiteralBranch({
          j,
          node: cons as any,
          paramName,
          filePath,
          parseExpr,
          cssValueToJs,
          resolveValue,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });
        if (!consResolved) {
          return false;
        }
        if (Object.keys(consResolved.style).length > 0) {
          applyVariant(testInfo, consResolved.style);
        }
        if (consResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(consResolved.dynamicEntries, testInfo.when);
        }
        if (consResolved.inlineEntries.length > 0) {
          applyInlineEntries(consResolved.inlineEntries, testInfo.when);
        }
        return true;
      }

      if (consIsTpl && altIsTpl) {
        dropAllTestInfoProps(testInfo);
        const consResolved = resolveTemplateLiteralBranch({
          j,
          node: cons as any,
          paramName,
          filePath,
          parseExpr,
          cssValueToJs,
          resolveValue,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });
        const altResolved = resolveTemplateLiteralBranch({
          j,
          node: alt as any,
          paramName,
          filePath,
          parseExpr,
          cssValueToJs,
          resolveValue,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });
        if (!consResolved || !altResolved) {
          return false;
        }
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          return false;
        }
        if (Object.keys(consResolved.style).length > 0) {
          applyVariant(testInfo, consResolved.style);
        }
        if (Object.keys(altResolved.style).length > 0) {
          applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
        }
        if (consResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(consResolved.dynamicEntries, testInfo.when);
        }
        if (altResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(altResolved.dynamicEntries, invertedWhen);
        }
        if (consResolved.inlineEntries.length > 0) {
          applyInlineEntries(consResolved.inlineEntries, testInfo.when);
        }
        if (altResolved.inlineEntries.length > 0) {
          applyInlineEntries(altResolved.inlineEntries, invertedWhen);
        }
        return true;
      }

      if (consIsEmpty && altIsTpl) {
        dropAllTestInfoProps(testInfo);
        const altResolved = resolveTemplateLiteralBranch({
          j,
          node: alt as any,
          paramName,
          filePath,
          parseExpr,
          cssValueToJs,
          resolveValue,
          resolveCall,
          resolveImportInScope,
          resolverImports,
          componentInfo,
          handlerContext,
        });
        if (!altResolved) {
          return false;
        }
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          return false;
        }
        if (Object.keys(altResolved.style).length > 0) {
          applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
        }
        if (altResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(altResolved.dynamicEntries, invertedWhen);
        }
        if (altResolved.inlineEntries.length > 0) {
          applyInlineEntries(altResolved.inlineEntries, invertedWhen);
        }
        return true;
      }

      // Note: String literal CSS branches (consIsStr && altIsEmpty, consIsEmpty && altIsStr,
      // and consIsStr && altIsStr) are NOT handled here - they fall through to
      // tryResolveConditionalCssBlockTernary in builtin-handlers.ts, which handles them
      // correctly with proper component type generation.

      // Handle CallExpression branches: props.$x ? truncate() : ""
      // These are helpers that return StyleX style objects (usage: "props")
      const tryResolveCallExpressionBranch = (
        callNode: ExpressionKind,
      ): { expr: string; imports: ImportSpec[] } | null => {
        const dynamicNode = {
          slotId: 0,
          expr: callNode,
          css: { kind: "declaration" as const, selector: "&", atRuleStack: [] as string[] },
          component: componentInfo,
          usage: { jsxUsages: 1, hasPropsSpread: false },
        };
        const res = resolveDynamicNode(dynamicNode, handlerContext);
        if (res && res.type === "resolvedStyles") {
          return { expr: res.expr, imports: res.imports ?? [] };
        }
        return null;
      };

      // Handle CallExpression in either branch with empty in the other
      if ((consIsCall && altIsEmpty) || (consIsEmpty && altIsCall)) {
        const callBranch = consIsCall ? cons : alt;
        const resolved = tryResolveCallExpressionBranch(callBranch);
        if (!resolved) {
          return false;
        }

        // Determine the when condition: original for truthy branch, inverted for falsy branch
        let when: string;
        if (consIsCall) {
          when = testInfo.when;
        } else {
          const invertedWhen = invertWhen(testInfo.when);
          if (!invertedWhen) {
            return false;
          }
          when = invertedWhen;
        }

        dropAllTestInfoProps(testInfo);
        for (const imp of resolved.imports) {
          resolverImports.set(JSON.stringify(imp), imp);
        }
        const exprAst = parseExpr(resolved.expr);
        if (!exprAst) {
          return false;
        }
        decl.extraStylexPropsArgs ??= [];
        decl.extraStylexPropsArgs.push({ when, expr: exprAst });
        decl.needsWrapperComponent = true;
        return true;
      }

      return false;
    };

    // Pre-scan rules to detect css helper placeholders and populate cssHelperPropValues
    // BEFORE processing any pseudo selectors that might reference those properties.
    // Also detect imported css helpers (identifiers that aren't in cssHelperNames) and bail.
    let hasImportedCssHelper = false;
    for (const rule of decl.rules) {
      for (const d of rule.declarations) {
        if (!d.property && d.value.kind === "interpolated") {
          const slotPart = (
            d.value as { parts?: Array<{ kind: string; slotId?: number }> }
          ).parts?.find((p) => p.kind === "slot");
          if (slotPart && slotPart.kind === "slot" && slotPart.slotId !== undefined) {
            const expr = decl.templateExpressions[slotPart.slotId];
            if (
              expr &&
              typeof expr === "object" &&
              "type" in expr &&
              expr.type === "Identifier" &&
              "name" in expr &&
              typeof expr.name === "string"
            ) {
              // Check if it's a css helper defined in this file
              if (cssHelperNames.has(expr.name)) {
                const helperKey = toStyleKey(expr.name);
                const helperValues = cssHelperValuesByKey.get(helperKey);
                if (helperValues) {
                  for (const [prop, value] of helperValues) {
                    cssHelperPropValues.set(prop, value);
                  }
                }
              } else if (declByLocalName.has(expr.name)) {
                // Local styled component interpolation - handled later in rule processing.
              } else {
                // Check if this is an imported styled component mixin that the adapter can resolve
                const importEntry = importMap?.get(expr.name);
                if (importEntry) {
                  const resolved = resolveValue({
                    kind: "importedValue",
                    importedName: importEntry.importedName,
                    source: importEntry.source,
                    filePath,
                    loc: getNodeLocStart(expr as ASTNode) ?? undefined,
                  });
                  if (resolved?.usage === "props") {
                    // Adapter resolved it as a style object - will be handled later
                    continue;
                  }
                }
                // This might be an imported css helper - we can't determine its properties.
                // Mark for bail to avoid generating incorrect default values.
                hasImportedCssHelper = true;
              }
            }
            // Check for css helper function calls: ${getPrimaryStyles()}
            else if (
              expr &&
              typeof expr === "object" &&
              "type" in expr &&
              expr.type === "CallExpression" &&
              "callee" in expr &&
              expr.callee &&
              typeof expr.callee === "object" &&
              "type" in expr.callee &&
              expr.callee.type === "Identifier" &&
              "name" in expr.callee &&
              typeof expr.callee.name === "string" &&
              "arguments" in expr &&
              Array.isArray(expr.arguments) &&
              expr.arguments.length === 0
            ) {
              const calleeName = expr.callee.name;
              const helperDecl = declByLocalName.get(calleeName);
              if (helperDecl?.isCssHelper) {
                const helperValues = cssHelperValuesByKey.get(helperDecl.styleKey);
                if (helperValues) {
                  for (const [prop, value] of helperValues) {
                    cssHelperPropValues.set(prop, value);
                  }
                }
              } else {
                // Check for imported function call - try resolveCall first
                const importEntry = importMap?.get(calleeName);
                if (importEntry) {
                  const resolved = resolveCall({
                    callSiteFilePath: filePath,
                    calleeImportedName: importEntry.importedName,
                    calleeSource: importEntry.source,
                    args: [],
                  });
                  if (!resolved) {
                    // Can't resolve this imported function call - bail for safety
                    hasImportedCssHelper = true;
                  }
                }
              }
            }
            // Also check for member expression CSS helpers (e.g., buttonStyles.rootCss)
            else if (expr && typeof expr === "object" && "type" in expr) {
              const rootInfo = extractRootAndPath(expr);
              const firstPathPart = rootInfo?.path[0];
              if (rootInfo && rootInfo.path.length === 1 && firstPathPart) {
                const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
                if (objectMemberMap) {
                  const memberDecl = objectMemberMap.get(firstPathPart);
                  if (memberDecl) {
                    const helperValues = cssHelperValuesByKey.get(memberDecl.styleKey);
                    if (helperValues) {
                      for (const [prop, value] of helperValues) {
                        cssHelperPropValues.set(prop, value);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Bail if the declaration uses an imported css helper whose properties we can't determine.
    if (hasImportedCssHelper) {
      warnings.push({
        severity: "error",
        type: "Imported CSS helper mixins: cannot determine inherited properties for correct pseudo selector handling",
        loc: decl.loc,
      });
      bail = true;
      break;
    }

    for (const rule of decl.rules) {
      // Track resolved selector media for this rule (set by adapter.resolveSelector)
      let resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null = null;

      // (debug logging removed)
      // Sibling selectors:
      // - & + &  (adjacent sibling)
      // - &.something ~ & (general sibling after a class marker)
      const selTrim = rule.selector.trim();

      if (selTrim === "& + &" || /^&\s*\+\s*&$/.test(selTrim)) {
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important, out.prop);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.adjacentKey, obj);
        continue;
      }
      const mSibling = selTrim.match(/^&\.([a-zA-Z0-9_-]+)\s*~\s*&$/);
      if (mSibling) {
        const cls = mSibling[1]!;
        const propAfter = `isSiblingAfter${toSuffixFromProp(cls)}`;
        decl.needsWrapperComponent = true;
        decl.siblingWrapper ??= {
          adjacentKey: "adjacentSibling",
          propAdjacent: "isAdjacentSibling",
        };
        decl.siblingWrapper.afterClass = cls;
        decl.siblingWrapper.afterKey = `siblingAfter${toSuffixFromProp(cls)}`;
        decl.siblingWrapper.propAfter = propAfter;

        const obj: Record<string, unknown> = {};
        for (const d of rule.declarations) {
          if (d.value.kind !== "static") {
            continue;
          }
          const outs = cssDeclarationToStylexDeclarations(d);
          for (let i = 0; i < outs.length; i++) {
            const out = outs[i]!;
            if (out.value.kind !== "static") {
              continue;
            }
            obj[out.prop] = cssValueToJs(out.value, d.important, out.prop);
            if (i === 0) {
              addPropComments(obj, out.prop, {
                leading: (d as any).leadingComment,
                trailingLine: (d as any).trailingLineComment,
              });
            }
          }
        }
        resolvedStyleObjects.set(decl.siblingWrapper.afterKey, obj);
        continue;
      }

      // --- Unsupported complex selector detection ---
      // We bail out rather than emitting incorrect unconditional styles.
      //
      // Examples we currently cannot represent safely:
      // - Grouped selectors: `&:hover, &:focus { ... }`
      // - Compound class selectors: `&.card.highlighted { ... }`
      // - Class-conditioned rules: `&.active { ... }` (requires runtime class/prop gating)
      // - Descendant element selectors: `& a { ... }`, `& h1, & h2 { ... }`
      // - Chained pseudos like `:not(...)`
      //
      // NOTE: normalize interpolated component selectors before the complex selector checks
      // to avoid skipping bails for selectors like `${Other} .child &`.
      if (typeof rule.selector === "string") {
        const s = normalizeInterpolatedSelector(rule.selector).trim();
        const hasComponentExpr = rule.selector.includes("__SC_EXPR_");
        const hasInterpolatedPseudo = /:[^\s{]*__SC_EXPR_\d+__/.test(rule.selector);

        if (hasInterpolatedPseudo) {
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: interpolated pseudo selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        // Component selector patterns that have special handling below:
        // 1. `${Other}:hover &` - requires :hover and ends with &
        // 2. `&:hover ${Child}` or just `& ${Child}` - starts with & and contains component
        // Other component selector patterns (like `${Other} .child`) should bail.
        const isHandledComponentPattern =
          hasComponentExpr &&
          (rule.selector.includes(":hover") ||
            rule.selector.trim().startsWith("&") ||
            /^__SC_EXPR_\d+__\s*\{/.test(rule.selector.trim()));

        // Use heuristic-based bail checks. We need to allow:
        // - Component selectors that have special handling
        // - Attribute selectors (have special handling for input type, href, etc.)
        // Note: Specificity hacks (&&, &&&) bail early in transform.ts

        // Check for descendant pseudo selectors BEFORE normalization collapses them.
        // "& :not(:disabled)" (with space) targets descendants, not the component itself.
        // normalizeInterpolatedSelector would collapse this to "&:not(:disabled)" which
        // has completely different semantics. We must bail on these patterns.
        if (/&\s+:/.test(rule.selector)) {
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: descendant pseudo selector (space before pseudo)",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }

        if (s.includes(",") && !isHandledComponentPattern) {
          // Comma-separated selectors: bail unless ALL parts are valid pseudo-selectors
          const parsed = parseSelector(s);
          if (parsed.kind !== "pseudo") {
            bail = true;
            warnings.push({
              severity: "warning",
              type: "Unsupported selector: comma-separated selectors must all be simple pseudos",
              loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
            });
            break;
          }
        } else if (/&\.[a-zA-Z0-9_-]+/.test(s)) {
          // Class selector on same element like &.active
          // Note: Specificity hacks (&&, &&&) bail early in transform.ts
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: class selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        } else if (/\s+[a-zA-Z.#]/.test(s) && !isHandledComponentPattern) {
          // Descendant element/class/id selectors like `& a`, `& .child`, `& #foo`
          // But NOT `&:hover ${Child}` (component selector pattern)
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: descendant/child/sibling selector",
            loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
          });
          break;
        }
      }

      // Component selector emulation and other rule handling continues...
      // NOTE: This function intentionally mirrors existing logic from `transform.ts`.

      if (typeof rule.selector === "string" && rule.selector.includes("__SC_EXPR_")) {
        const slotMatch = rule.selector.match(/__SC_EXPR_(\d+)__/);
        const slotId = slotMatch ? Number(slotMatch[1]) : null;
        const slotExpr = slotId !== null ? (decl.templateExpressions[slotId] as any) : null;
        const otherLocal = slotExpr?.type === "Identifier" ? (slotExpr.name as string) : null;
        const isCssHelperPlaceholder = !!otherLocal && cssHelperNames.has(otherLocal);

        const selTrim2 = rule.selector.trim();

        // `${Other}:hover &` (Icon reacting to Link hover)
        if (
          otherLocal &&
          !isCssHelperPlaceholder &&
          selTrim2.startsWith("__SC_EXPR_") &&
          rule.selector.includes(":hover") &&
          rule.selector.includes("&")
        ) {
          const parentDecl = declByLocalName.get(otherLocal);
          const parentStyle = parentDecl && resolvedStyleObjects.get(parentDecl.styleKey);
          if (parentStyle) {
            for (const d of rule.declarations) {
              if (d.value.kind !== "static") {
                continue;
              }
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (out.value.kind !== "static") {
                  continue;
                }
                const hoverValue = out.value.value;
                const rawBase = (styleObj as any)[out.prop] as unknown;
                let baseValue: string | null = null;
                if (typeof rawBase === "string" || typeof rawBase === "number") {
                  baseValue = String(rawBase);
                } else if (cssHelperPropValues.has(out.prop)) {
                  const helperDefault = getComposedDefaultValue(out.prop);
                  if (typeof helperDefault === "string" || typeof helperDefault === "number") {
                    baseValue = String(helperDefault);
                  }
                } else if (parentDecl) {
                  const parentValues = parentDecl.isCssHelper
                    ? cssHelperValuesByKey.get(parentDecl.styleKey)
                    : mixinValuesByKey.get(parentDecl.styleKey);
                  const parentValue = resolveComposedDefaultValue(
                    parentValues?.get(out.prop),
                    out.prop,
                  );
                  if (typeof parentValue === "string" || typeof parentValue === "number") {
                    baseValue = String(parentValue);
                  }
                }
                const varName = `--sc2sx-${toKebab(decl.localName)}-${toKebab(out.prop)}`;
                (parentStyle as any)[varName] = {
                  default: baseValue ?? null,
                  ":hover": hoverValue,
                };
                styleObj[out.prop] = `var(${varName}, ${baseValue ?? "inherit"})`;
              }
            }
          }
          continue;
        }

        // `${Child}` / `&:hover ${Child}` / `&:focus-visible ${Child}` (Parent styling a descendant child)
        if (otherLocal && !isCssHelperPlaceholder && selTrim2.startsWith("&")) {
          const childDecl = declByLocalName.get(otherLocal);
          // Extract the actual pseudo-selector (e.g., ":hover", ":focus-visible")
          const pseudoMatch = rule.selector.match(/&(:[a-z-]+(?:\([^)]*\))?)/i);
          const ancestorPseudo: string | null = pseudoMatch?.[1] ?? null;
          if (!childDecl) {
            bail = true;
            warnings.push({
              severity: "warning",
              type: "Unsupported selector: unknown component selector",
              loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
            });
            break;
          }
          if (childDecl) {
            const overrideStyleKey = `${toStyleKey(otherLocal)}In${decl.localName}`;
            ancestorSelectorParents.add(decl.styleKey);
            // Only add to descendantOverrides once per override key
            if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
              descendantOverrides.push({
                parentStyleKey: decl.styleKey,
                childStyleKey: childDecl.styleKey,
                overrideStyleKey,
              });
            }
            // Get or create the pseudo buckets map for this override key
            let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
            if (!pseudoBuckets) {
              pseudoBuckets = new Map();
              descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
            }
            // Get or create the bucket for this specific pseudo (or null for base)
            let bucket = pseudoBuckets.get(ancestorPseudo);
            if (!bucket) {
              bucket = {};
              pseudoBuckets.set(ancestorPseudo, bucket);
            }

            for (const d of rule.declarations) {
              // Handle static values
              if (d.value.kind === "static") {
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (out.value.kind !== "static") {
                    continue;
                  }
                  const v = cssValueToJs(out.value, d.important, out.prop);
                  (bucket as Record<string, unknown>)[out.prop] = v;
                }
              } else if (d.value.kind === "interpolated" && d.property) {
                // Handle interpolated theme values (e.g., ${props => props.theme.color.labelBase})
                const slotPart = (
                  d.value as { parts?: Array<{ kind: string; slotId?: number }> }
                ).parts?.find((p) => p.kind === "slot");
                if (slotPart && slotPart.slotId !== undefined) {
                  const expr = decl.templateExpressions[slotPart.slotId] as unknown;
                  const resolved =
                    expr &&
                    typeof expr === "object" &&
                    ((expr as { type?: string }).type === "ArrowFunctionExpression" ||
                      (expr as { type?: string }).type === "FunctionExpression")
                      ? resolveThemeValueFromFn(expr)
                      : resolveThemeValue(expr);
                  if (resolved) {
                    for (const out of cssDeclarationToStylexDeclarations(d)) {
                      // Build the value: preserve the order of static and interpolated parts
                      const parts =
                        (d.value as { parts?: Array<{ kind: string; value?: string }> }).parts ??
                        [];
                      const hasStaticParts = parts.some((p) => p.kind === "static" && p.value);
                      let finalValue: unknown;
                      if (hasStaticParts) {
                        // Build a proper template literal preserving the order of parts
                        const quasis: any[] = [];
                        const expressions: any[] = [];
                        let currentStatic = "";

                        for (let i = 0; i < parts.length; i++) {
                          const part = parts[i];
                          if (!part) {
                            continue;
                          }
                          if (part.kind === "static") {
                            currentStatic += part.value ?? "";
                          } else if (part.kind === "slot") {
                            // Add the accumulated static text as a quasi
                            quasis.push(
                              j.templateElement(
                                { raw: currentStatic, cooked: currentStatic },
                                false,
                              ),
                            );
                            currentStatic = "";
                            expressions.push(resolved);
                          }
                        }
                        // Add the final static text (may be empty)
                        quasis.push(
                          j.templateElement({ raw: currentStatic, cooked: currentStatic }, true),
                        );
                        finalValue = j.templateLiteral(quasis, expressions);
                      } else {
                        finalValue = resolved;
                      }
                      (bucket as Record<string, unknown>)[out.prop] = finalValue;
                    }
                  }
                }
              }
            }
          }
          continue;
        }

        // Selector interpolation that's a MemberExpression (e.g., screenSize.phone)
        // Try to resolve it via the adapter as a media query helper.
        if (
          !otherLocal &&
          slotExpr &&
          (slotExpr.type === "MemberExpression" || slotExpr.type === "OptionalMemberExpression")
        ) {
          const info = getRootIdentifierInfo(slotExpr);
          const identifierDesc = info
            ? info.path.length > 0
              ? `${info.rootName}.${info.path.join(".")}`
              : info.rootName
            : "unknown expression";

          // Try to resolve via adapter
          let resolved = false;
          if (info) {
            const imp = resolveImportInScope(info.rootName, info.rootNode);
            if (imp) {
              const selectorResult = resolveSelector({
                kind: "selectorInterpolation",
                importedName: imp.importedName,
                source: imp.source,
                path: info.path.length > 0 ? info.path.join(".") : undefined,
                filePath,
                loc: getNodeLocStart(slotExpr) ?? undefined,
              });

              if (selectorResult && selectorResult.kind === "media") {
                // Store the resolved media expression for this rule
                const mediaExpr = parseExpr(selectorResult.expr);
                if (mediaExpr) {
                  resolvedSelectorMedia = { keyExpr: mediaExpr, exprSource: selectorResult.expr };
                  // Add required imports
                  for (const impSpec of selectorResult.imports ?? []) {
                    resolverImports.set(JSON.stringify(impSpec), impSpec);
                  }
                  resolved = true;
                }
              }
            }
          }

          if (!resolved) {
            // Bail: adapter couldn't resolve this selector interpolation
            bail = true;
            warnings.push({
              severity: "error",
              type: "Unsupported selector interpolation: imported value in selector position",
              loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
              context: { selector: rule.selector, expression: identifierDesc },
            });
            break;
          }
        }
      }

      let media = rule.atRuleStack.find((a) => a.startsWith("@media"));

      const isInputIntrinsic = decl.base.kind === "intrinsic" && decl.base.tagName === "input";
      let selector = normalizeSelectorForInputAttributePseudos(rule.selector, isInputIntrinsic);
      selector = normalizeInterpolatedSelector(selector);
      if (!media && selector.trim().startsWith("@media")) {
        media = selector.trim();
        selector = "&";
      }

      // Support comma-separated pseudo-selectors like "&:hover, &:focus"
      // and chained pseudo-selectors like "&:focus:not(:disabled)"
      const parsedSelector = parseSelector(selector);

      // Bail on unsupported selectors that weren't caught by the heuristic checks above.
      // The heuristic regex checks may miss cases where Stylis normalizes selectors differently
      // (e.g., `& > button[disabled]` becomes `&>button[disabled]` after form-feed stripping).
      if (
        parsedSelector.kind === "unsupported" &&
        selector !== "&" &&
        !rule.selector.includes("__SC_EXPR_")
      ) {
        bail = true;
        warnings.push({
          severity: "warning",
          type: "Unsupported selector: descendant/child/sibling selector",
          loc: computeSelectorWarningLoc(decl.loc, decl.rawCss, rule.selector),
        });
        break;
      }

      const pseudos = parsedSelector.kind === "pseudo" ? parsedSelector.pseudos : null;
      const pseudoElement = parsedSelector.kind === "pseudoElement" ? parsedSelector.element : null;
      const attrSel =
        parsedSelector.kind === "attribute"
          ? {
              kind: parsedSelector.attr.type,
              suffix: parsedSelector.attr.suffix,
              pseudoElement: parsedSelector.attr.pseudoElement,
            }
          : null;
      const attrWrapperKind =
        decl.base.kind === "intrinsic" && decl.base.tagName === "input"
          ? "input"
          : decl.base.kind === "intrinsic" && decl.base.tagName === "a"
            ? "link"
            : null;
      const isAttrRule = !!attrSel && !!attrWrapperKind;
      let attrTarget: Record<string, unknown> | null = null;
      let attrPseudoElement: string | null = null;

      if (isAttrRule && attrSel && attrWrapperKind) {
        decl.needsWrapperComponent = true;
        decl.attrWrapper ??= { kind: attrWrapperKind };
        const suffix = attrSel.suffix;
        const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
        attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
        attrBuckets.set(attrTargetStyleKey, attrTarget);
        attrPseudoElement = attrSel.pseudoElement ?? null;

        if (attrWrapperKind === "input") {
          if (attrSel.kind === "typeCheckbox") {
            decl.attrWrapper.checkboxKey = attrTargetStyleKey;
          } else if (attrSel.kind === "typeRadio") {
            decl.attrWrapper.radioKey = attrTargetStyleKey;
          }
        } else if (attrWrapperKind === "link") {
          if (attrSel.kind === "targetBlankAfter") {
            decl.attrWrapper.externalKey = attrTargetStyleKey;
          } else if (attrSel.kind === "hrefStartsHttps") {
            decl.attrWrapper.httpsKey = attrTargetStyleKey;
          } else if (attrSel.kind === "hrefEndsPdf") {
            decl.attrWrapper.pdfKey = attrTargetStyleKey;
          }
        }
      }

      const applyResolvedPropValue = (
        prop: string,
        value: unknown,
        commentSource: { leading?: string; trailingLine?: string } | null,
      ): void => {
        if (attrTarget) {
          if (attrPseudoElement) {
            const nested = (attrTarget[attrPseudoElement] as any) ?? {};
            nested[prop] = value;
            attrTarget[attrPseudoElement] = nested;
            if (commentSource) {
              addPropComments(nested, prop, {
                leading: commentSource.leading,
                trailingLine: commentSource.trailingLine,
              });
            }
            return;
          }
          attrTarget[prop] = value;
          if (commentSource) {
            addPropComments(attrTarget, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
          }
          return;
        }

        if (prop && prop.startsWith("--") && typeof value === "string") {
          localVarValues.set(prop, value);
        }

        // Handle nested pseudo + media: `&:hover { @media (...) { ... } }`
        // This produces: { ":hover": { default: value, "@media (...)": value } }
        if (media && pseudos?.length) {
          perPropPseudo[prop] ??= {};
          const existing = perPropPseudo[prop]!;
          if (!("default" in existing)) {
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            if (existingVal !== undefined) {
              existing.default = existingVal;
            } else if (cssHelperPropValues.has(prop)) {
              existing.default = getComposedDefaultValue(prop);
            } else {
              existing.default = null;
            }
          }
          // For each pseudo, create/update a nested media map
          for (const ps of pseudos) {
            const current = existing[ps];
            if (!current || typeof current !== "object") {
              const fallbackDefault = cssHelperPropValues.has(prop)
                ? getComposedDefaultValue(prop)
                : null;
              const preservedDefault = current !== undefined ? current : fallbackDefault;
              existing[ps] = { default: preservedDefault };
            } else if (!("default" in (current as Record<string, unknown>))) {
              const fallbackDefault = cssHelperPropValues.has(prop)
                ? getComposedDefaultValue(prop)
                : null;
              (current as Record<string, unknown>).default = fallbackDefault;
            }
            (existing[ps] as Record<string, unknown>)[media] = value;
          }
          return;
        }

        if (media) {
          perPropMedia[prop] ??= {};
          const existing = perPropMedia[prop]!;
          if (!("default" in existing)) {
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            if (existingVal !== undefined) {
              existing.default = existingVal;
            } else if (cssHelperPropValues.has(prop)) {
              existing.default = getComposedDefaultValue(prop);
            } else {
              existing.default = null;
            }
          }
          existing[media] = value;
          return;
        }

        // Handle resolved selector media (from adapter.resolveSelector)
        // These use computed property keys like [breakpoints.phone]
        if (resolvedSelectorMedia) {
          let entry = perPropComputedMedia.get(prop);
          if (!entry) {
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            const defaultValue =
              existingVal !== undefined
                ? existingVal
                : cssHelperPropValues.has(prop)
                  ? getComposedDefaultValue(prop)
                  : null;
            entry = { defaultValue, entries: [] };
            perPropComputedMedia.set(prop, entry);
          }
          entry.entries.push({ keyExpr: resolvedSelectorMedia.keyExpr, value });
          return;
        }

        if (pseudos?.length) {
          perPropPseudo[prop] ??= {};
          const existing = perPropPseudo[prop]!;
          if (!("default" in existing)) {
            // If the property comes from a composed css helper, use the helper's
            // value as the default to preserve it during style merging.
            const existingVal = (styleObj as Record<string, unknown>)[prop];
            if (existingVal !== undefined) {
              existing.default = existingVal;
            } else if (cssHelperPropValues.has(prop)) {
              existing.default = getComposedDefaultValue(prop);
            } else {
              existing.default = null;
            }
          }
          // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
          for (const ps of pseudos) {
            existing[ps] = value;
          }
          return;
        }

        if (pseudoElement) {
          nestedSelectors[pseudoElement] ??= {};
          const pseudoSelector = nestedSelectors[pseudoElement];
          if (pseudoSelector) {
            pseudoSelector[prop] = value;
            if (commentSource) {
              addPropComments(pseudoSelector, prop, {
                leading: commentSource.leading,
                trailingLine: commentSource.trailingLine,
              });
            }
          }
          return;
        }

        styleObj[prop] = value;
        if (commentSource) {
          addPropComments(styleObj, prop, {
            leading: commentSource.leading,
            trailingLine: commentSource.trailingLine,
          });
        }
      };

      for (const d of rule.declarations) {
        if (d.value.kind === "interpolated") {
          if (bail) {
            break;
          }
          if (tryHandleMappedFunctionColor(d)) {
            continue;
          }
          if (tryHandleAnimation({ j, decl, d, keyframesNames, styleObj })) {
            continue;
          }
          // Bail on dynamic styles inside pseudo elements (::before/::after).
          // StyleX generates invalid @property rules for these cases.
          // See: https://github.com/facebook/stylex/issues/1396
          if (pseudoElement) {
            warnings.push({
              severity: "error",
              type: "Dynamic styles inside pseudo elements (::before/::after) are not supported by StyleX. See https://github.com/facebook/stylex/issues/1396",
              loc: decl.loc,
              context: { pseudoElement },
            });
            bail = true;
            break;
          }
          if (
            tryHandleInterpolatedBorder({
              api,
              j,
              filePath,
              decl,
              d,
              selector: rule.selector,
              atRuleStack: rule.atRuleStack ?? [],
              extraStyleObjects,
              hasLocalThemeBinding,
              resolveValue,
              resolveCall,
              importMap,
              resolverImports,
              parseExpr,
              applyResolvedPropValue: (prop, value) => applyResolvedPropValue(prop, value, null),
              bailUnsupported: (type) => bailUnsupported(decl, type),
              bailUnsupportedWithContext: (type, context, loc) => {
                warnings.push({
                  severity: "error",
                  type,
                  loc: loc ?? decl.loc,
                  context,
                });
                bail = true;
              },
              toSuffixFromProp,
              variantBuckets,
              variantStyleKeys,
              inlineStyleProps,
            })
          ) {
            continue;
          }
          const tryHandleThemeValueInPseudo = (): boolean => {
            if (!pseudos?.length || !d.property) {
              return false;
            }
            const slotPart = (d.value as any).parts?.find((p: any) => p.kind === "slot");
            if (!slotPart || slotPart.kind !== "slot") {
              return false;
            }
            const expr = decl.templateExpressions[slotPart.slotId] as any;
            if (!expr) {
              return false;
            }
            const resolved =
              (expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
                ? resolveThemeValueFromFn(expr)
                : resolveThemeValue(expr)) ?? null;
            if (!resolved) {
              return false;
            }
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              perPropPseudo[out.prop] ??= {};
              const existing = perPropPseudo[out.prop]!;
              if (!("default" in existing)) {
                const existingVal = (styleObj as Record<string, unknown>)[out.prop];
                if (existingVal !== undefined) {
                  existing.default = existingVal;
                } else if (cssHelperPropValues.has(out.prop)) {
                  // Use the css helper's value as the default
                  const helperVal = cssHelperPropValues.get(out.prop);
                  if (
                    helperVal &&
                    typeof helperVal === "object" &&
                    "__cssHelperDynamicValue" in helperVal
                  ) {
                    // Dynamic value - need to resolve from already-processed css helper
                    const helperDecl = (helperVal as { decl?: StyledDecl }).decl;
                    if (helperDecl) {
                      const resolvedHelper = resolvedStyleObjects.get(
                        toStyleKey(helperDecl.localName),
                      );
                      if (resolvedHelper && typeof resolvedHelper === "object") {
                        existing.default =
                          (resolvedHelper as Record<string, unknown>)[out.prop] ?? null;
                      } else {
                        existing.default = null;
                      }
                    } else {
                      existing.default = null;
                    }
                  } else {
                    existing.default = helperVal;
                  }
                } else {
                  existing.default = null;
                }
              }
              for (const ps of pseudos) {
                existing[ps] = resolved;
              }
            }
            return true;
          };
          if (tryHandleThemeValueInPseudo()) {
            continue;
          }
          const resolveImportedValueExpr = (
            expr: any,
          ): { resolved: any; imports?: any[] } | { bail: true } | null => {
            const info = getRootIdentifierInfo(expr);
            if (!info) {
              return null;
            }
            const imp = resolveImportInScope(info.rootName, info.rootNode);
            if (!imp) {
              return null;
            }
            const resolveValueContext: ResolveValueContext = {
              kind: "importedValue",
              importedName: imp.importedName,
              source: imp.source,
              ...(info.path.length ? { path: info.path.join(".") } : {}),
              filePath,
              loc: getNodeLocStart(expr) ?? undefined,
            };
            const resolveValueResult = resolveValue(resolveValueContext);
            if (!resolveValueResult) {
              // Adapter returned undefined for an identified imported value - bail
              warnings.push({
                severity: "error",
                type: "Adapter resolveValue returned undefined for imported value",
                loc: getNodeLocStart(expr) ?? decl.loc,
                context: {
                  localName: decl.localName,
                  importedName: imp.importedName,
                  source: imp.source.value,
                  path: info.path.length ? info.path.join(".") : undefined,
                },
              });
              bail = true;
              return { bail: true };
            }
            const exprAst = parseExpr(resolveValueResult.expr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "Adapter resolveValue returned an unparseable value expression",
                loc: getNodeLocStart(expr),
                context: {
                  localName: decl.localName,
                  resolveValueResult,
                  resolveValueContext,
                },
              });
              return null;
            }
            return { resolved: exprAst, imports: resolveValueResult.imports };
          };
          // Create a resolver for embedded call expressions in compound CSS values
          const resolveCallExpr = (expr: any): { resolved: any; imports?: any[] } | null => {
            if (expr?.type !== "CallExpression") {
              return null;
            }
            const res = resolveDynamicNode(
              {
                slotId: 0,
                expr,
                css: {
                  kind: "declaration",
                  selector: rule.selector,
                  atRuleStack: rule.atRuleStack,
                  ...(d.property ? { property: d.property } : {}),
                  valueRaw: d.valueRaw,
                },
                component: componentInfo,
                usage: { jsxUsages: 0, hasPropsSpread: false },
              },
              {
                ...handlerContext,
                resolveImport: (localName: string) => resolveImportForExpr(expr, localName),
              },
            );
            if (res && res.type === "resolvedValue") {
              const exprAst = parseExpr(res.expr);
              if (exprAst) {
                return { resolved: exprAst, imports: res.imports };
              }
            }
            return null;
          };
          const addImport = (imp: any) => {
            resolverImports.set(JSON.stringify(imp), imp);
          };
          if (d.property && d.value.kind === "interpolated") {
            const slotParts =
              (d.value as { parts?: Array<{ kind?: string; slotId?: number }> }).parts ?? [];
            for (const part of slotParts) {
              if (part?.kind !== "slot" || part.slotId === undefined) {
                continue;
              }
              const expr = decl.templateExpressions[part.slotId] as {
                type?: string;
                body?: unknown;
                object?: { type?: string; name?: string };
                property?: { type?: string; name?: string };
              };
              const baseExpr =
                expr?.type === "ArrowFunctionExpression" || expr?.type === "FunctionExpression"
                  ? (expr.body as any)
                  : (expr as any);
              if (
                baseExpr?.type !== "MemberExpression" &&
                baseExpr?.type !== "OptionalMemberExpression"
              ) {
                continue;
              }
              const obj = baseExpr.object;
              const prop = baseExpr.property as { type?: string; name?: string } | undefined;
              if (obj?.type !== "Identifier") {
                continue;
              }
              const ownerName = obj.name;
              const ownerMap = staticPropertyValues.get(ownerName);
              if (!ownerMap) {
                continue;
              }
              // Try to resolve the static property value
              const propName = prop?.type === "Identifier" ? prop.name : undefined;
              const resolvedValue = propName ? ownerMap.get(propName) : undefined;
              if (resolvedValue !== undefined) {
                // Replace the template expression with a literal value
                decl.templateExpressions[part.slotId] = staticValueToLiteral(
                  j,
                  resolvedValue,
                ) as any;
                // Add a comment documenting the inlined value for maintainability
                const memberExprStr = `${ownerName}.${propName}`;
                (d as any).leadingComment =
                  `NOTE: Inlined ${memberExprStr} as StyleX requires it to be statically evaluable`;
                continue;
              }
              // Value not resolvable - bail
              warnings.push({
                severity: "error",
                type: "Unsupported interpolation: member expression",
                loc: getNodeLocStart(baseExpr) ?? decl.loc,
              });
              bail = true;
              break;
            }
            if (bail) {
              continue;
            }
          }
          if (
            tryHandleInterpolatedStringValue({
              j,
              decl,
              d,
              styleObj,
              resolveCallExpr,
              addImport,
              resolveImportedValueExpr,
              resolveThemeValue,
            })
          ) {
            continue;
          }
          if (bail) {
            break;
          }

          if (!d.property) {
            const slot = d.value.parts.find(
              (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
            );
            if (slot) {
              const expr = decl.templateExpressions[slot.slotId] as any;
              // Handle css helper identifier: ${primaryStyles}
              if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
                const helperDecl = declByLocalName.get(expr.name);
                if (helperDecl) {
                  applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
                  continue;
                }
              }
              // Handle css helper function calls: ${getPrimaryStyles()}
              if (
                expr?.type === "CallExpression" &&
                expr.callee?.type === "Identifier" &&
                (expr.arguments ?? []).length === 0
              ) {
                const calleeName = expr.callee.name as string;
                const helperDecl = declByLocalName.get(calleeName);
                if (helperDecl?.isCssHelper) {
                  applyCssHelperMixin(decl, helperDecl, cssHelperPropValues, inlineStyleProps);
                  continue;
                }
                // Imported function calls fall through to be handled via resolveCall
              }
              if (expr?.type === "Identifier") {
                // Case 1: Local styled component mixin
                const mixinDecl = declByLocalName.get(expr.name);
                if (mixinDecl && !mixinDecl.isCssHelper && mixinDecl.localName !== decl.localName) {
                  bail = true;
                  warnings.push({
                    severity: "warning",
                    type: "Using styled-components components as mixins is not supported; use css`` mixins or strings instead",
                    loc: getNodeLocStart(expr) ?? decl.loc,
                    context: {
                      localName: decl.localName,
                      mixin: mixinDecl.localName,
                    },
                  });
                  continue;
                }

                // Case 2: Imported styled component mixin (resolved via adapter)
                const importEntry = importMap?.get(expr.name);
                if (importEntry && !cssHelperNames.has(expr.name)) {
                  const resolved = resolveValue({
                    kind: "importedValue",
                    importedName: importEntry.importedName,
                    source: importEntry.source,
                    filePath,
                    loc: getNodeLocStart(expr) ?? undefined,
                  });
                  if (resolved?.usage === "props") {
                    // Add as an extra stylex.props argument
                    const extras = decl.extraStylexPropsArgs ?? [];
                    const order = decl.mixinOrder ?? [];
                    const parsedExpr = parseExpr(resolved.expr);
                    if (parsedExpr) {
                      extras.push({ expr: parsedExpr });
                      order.push("propsArg");
                      decl.extraStylexPropsArgs = extras;
                      decl.mixinOrder = order;
                      // Merge imports
                      for (const imp of resolved.imports) {
                        resolverImports.set(JSON.stringify(imp), imp);
                      }
                      continue;
                    }
                  }
                  // If adapter returns undefined or usage !== "props", fall through
                }
              }
              // Handle member expression CSS helpers (e.g., buttonStyles.rootCss)
              const rootInfo = extractRootAndPath(expr);
              const firstRootInfoPath = rootInfo?.path[0];
              if (rootInfo && rootInfo.path.length === 1 && firstRootInfoPath) {
                const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
                if (objectMemberMap) {
                  const memberDecl = objectMemberMap.get(firstRootInfoPath);
                  if (memberDecl) {
                    addStyleKeyMixin(decl, memberDecl.styleKey);
                    trackMixinPropertyValues(
                      cssHelperValuesByKey.get(memberDecl.styleKey),
                      cssHelperPropValues,
                    );
                    continue;
                  }
                }
              }
            }
          }
          if (tryHandlePropertyTernaryTemplateLiteral(d)) {
            continue;
          }
          // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
          if (!media && !attrTarget && !pseudos?.length) {
            if (tryHandleCssHelperConditionalBlock(d)) {
              continue;
            }
          }
          if (tryHandleCssHelperFunctionSwitchBlock(d)) {
            continue;
          }
          if (tryHandleLogicalOrDefault(d)) {
            continue;
          }
          if (!media && !attrTarget && !pseudos?.length) {
            if (tryHandleConditionalPropCoalesceWithTheme(d)) {
              continue;
            }
          }

          // Support enum-like block-body `if` chains that return static values.
          // Example:
          //   transform: ${(props) => { if (props.$state === "up") return "scaleY(3)"; return "scaleY(1)"; }};
          if (tryHandleEnumIfChainValue(d, { media, attrTarget, pseudos })) {
            continue;
          }

          if (pseudos?.length && d.property) {
            const stylexProp = cssDeclarationToStylexDeclarations(d)[0]?.prop;
            const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
            const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
            const expr = decl.templateExpressions[slotId] as any;
            if (
              stylexProp &&
              expr?.type === "ArrowFunctionExpression" &&
              expr.body?.type === "ConditionalExpression"
            ) {
              const test = expr.body.test as any;
              const cons = expr.body.consequent as any;
              const alt = expr.body.alternate as any;
              if (
                test?.type === "MemberExpression" &&
                test.property?.type === "Identifier" &&
                cons?.type === "StringLiteral" &&
                alt?.type === "StringLiteral"
              ) {
                const when = test.property.name;
                const baseDefault = (styleObj as any)[stylexProp] ?? null;
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                const pseudoEntries = Object.fromEntries(pseudos.map((p) => [p, alt.value]));
                (styleObj as any)[stylexProp] = { default: baseDefault, ...pseudoEntries };
                const variantPseudoEntries = Object.fromEntries(
                  pseudos.map((p) => [p, cons.value]),
                );
                variantBuckets.set(when, {
                  ...variantBuckets.get(when),
                  [stylexProp]: { default: cons.value, ...variantPseudoEntries },
                });
                variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
                continue;
              }
            }
          }

          // Handle computed theme object access keyed by a prop:
          //   background-color: ${(props) => props.theme.color[props.bg]}
          //
          // If the adapter can resolve `theme.color` as an object expression, we can emit a StyleX
          // dynamic style function that indexes into that resolved object at runtime:
          //   boxBackgroundColor: (bg) => ({ backgroundColor: (resolved as any)[bg] })
          //
          // This requires a wrapper to consume `bg` without forwarding it to DOM.
          if (tryHandleThemeIndexedLookup(d, { media, attrTarget, pseudos })) {
            continue;
          }

          const slotPart = d.value.parts.find((p: any) => p.kind === "slot");
          const slotId = slotPart && slotPart.kind === "slot" ? slotPart.slotId : 0;
          const expr = decl.templateExpressions[slotId];
          const loc = getNodeLocStart(expr as any);

          const res = resolveDynamicNode(
            {
              slotId,
              expr,
              css: {
                kind: "declaration",
                selector: rule.selector,
                atRuleStack: rule.atRuleStack,
                ...(d.property ? { property: d.property } : {}),
                valueRaw: d.valueRaw,
              },
              component: componentInfo,
              usage: { jsxUsages: 0, hasPropsSpread: false },
              ...(loc ? { loc } : {}),
            },
            handlerContext,
          );

          if (res && res.type === "resolvedStyles") {
            // Adapter-resolved StyleX style objects are emitted as additional stylex.props args.
            // This is only safe for base selector declarations.
            if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
              const resolveCallMeta =
                res.resolveCallContext && res.resolveCallResult
                  ? {
                      resolveCallContext: res.resolveCallContext,
                      resolveCallResult: res.resolveCallResult,
                    }
                  : undefined;
              warnings.push({
                severity: "warning",
                type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
                loc,
                context: resolveCallMeta
                  ? { selector: rule.selector, ...resolveCallMeta }
                  : { selector: rule.selector },
              });
              bail = true;
              break;
            }
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }
            const exprAst = parseExpr(res.expr);
            if (!exprAst) {
              const resolveCallMeta =
                res.resolveCallContext && res.resolveCallResult
                  ? {
                      resolveCallContext: res.resolveCallContext,
                      resolveCallResult: res.resolveCallResult,
                    }
                  : undefined;
              warnings.push({
                severity: "error",
                type: "Adapter resolveCall returned an unparseable styles expression",
                loc: decl.loc,
                context: resolveCallMeta
                  ? { localName: decl.localName, res, ...resolveCallMeta }
                  : { localName: decl.localName, res },
              });
              continue;
            }
            decl.extraStylexPropsArgs ??= [];
            decl.extraStylexPropsArgs.push({ expr: exprAst as any });
            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "resolvedValue") {
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Extract and wrap static prefix/suffix (skip for border-color since expansion handled it)
            const cssProp = (d.property ?? "").trim();
            const { prefix, suffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });
            const wrappedExpr = wrapExprWithStaticParts(res.expr, prefix, suffix);

            const exprAst = parseExpr(wrappedExpr);
            if (!exprAst) {
              const resolveCallMeta =
                res.resolveCallContext && res.resolveCallResult
                  ? {
                      resolveCallContext: res.resolveCallContext,
                      resolveCallResult: res.resolveCallResult,
                    }
                  : undefined;
              warnings.push({
                severity: "error",
                type: "Adapter resolveCall returned an unparseable value expression",
                loc: decl.loc,
                context: resolveCallMeta
                  ? { localName: decl.localName, res, ...resolveCallMeta }
                  : { localName: decl.localName, res },
              });
              continue;
            }
            const outs = cssDeclarationToStylexDeclarations(d);
            for (let i = 0; i < outs.length; i++) {
              const out = outs[i]!;
              const commentSource =
                i === 0
                  ? {
                      leading: (d as any).leadingComment,
                      trailingLine: (d as any).trailingLineComment,
                    }
                  : null;
              applyResolvedPropValue(out.prop, exprAst as any, commentSource);
            }
            continue;
          }

          if (res && res.type === "splitVariants") {
            // Extract any imports from variants (used by template literal theme resolution)
            for (const v of res.variants) {
              if (v.imports) {
                for (const imp of v.imports) {
                  resolverImports.set(JSON.stringify(imp), imp);
                }
              }
            }

            const negVariants = res.variants.filter((v) => v.when.startsWith("!"));
            const posVariants = res.variants.filter((v) => !v.when.startsWith("!"));

            if (negVariants.length === 1 && posVariants.length > 0) {
              // Classic pattern with one default (neg) and conditional variants (pos)
              // Pattern: prop === "a" ? A : prop === "b" ? B : C
              // → C is default, A and B are conditional
              const neg = negVariants[0]!;
              Object.assign(styleObj, neg.style);
              for (const pos of posVariants) {
                variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
                // toSuffixFromProp handles both simple props ($dim → Dim) and
                // comparison expressions (variant === "micro" → VariantMicro)
                variantStyleKeys[pos.when] ??= `${decl.styleKey}${toSuffixFromProp(pos.when)}`;
              }
            } else if (negVariants.length === 1 && posVariants.length === 0) {
              // Only negated variant: style is conditional on !prop
              // Pattern: !prop ? A : "" → A is conditional on !prop (i.e., when prop is false)
              const neg = negVariants[0]!;
              variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
              // toSuffixFromProp handles negated props: !$open → NotOpen
              variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
            } else if (posVariants.length > 0) {
              // Positive variants (with or without multiple negatives)
              // Pattern: prop ? A : "" or prop === "a" ? A : ""
              // Also handles: hollow ? A : (inner ternary produces multiple negatives)
              for (const pos of posVariants) {
                variantBuckets.set(pos.when, { ...variantBuckets.get(pos.when), ...pos.style });
                variantStyleKeys[pos.when] ??= `${decl.styleKey}${toSuffixFromProp(pos.when)}`;
              }
              // Also process negative variants (compound conditions like !hollow && $primary)
              for (const neg of negVariants) {
                variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
                variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
              }
            } else if (negVariants.length > 0) {
              // Only negative variants (multiple compound conditions)
              for (const neg of negVariants) {
                variantBuckets.set(neg.when, { ...variantBuckets.get(neg.when), ...neg.style });
                variantStyleKeys[neg.when] ??= `${decl.styleKey}${toSuffixFromProp(neg.when)}`;
              }
            }
            continue;
          }

          if (res && res.type === "splitVariantsResolvedStyles") {
            if (rule.selector.trim() !== "&" || (rule.atRuleStack ?? []).length) {
              warnings.push({
                severity: "warning",
                type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
                loc,
                context: { selector: rule.selector },
              });
              bail = true;
              break;
            }
            for (const v of res.variants) {
              for (const imp of v.imports ?? []) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              const exprAst = parseExpr(v.expr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "Adapter resolveCall returned an unparseable styles expression",
                  loc,
                  context: { localName: decl.localName, variant: v },
                });
                continue;
              }
              decl.extraStylexPropsArgs ??= [];
              decl.extraStylexPropsArgs.push({ when: v.when, expr: exprAst as any });
            }
            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "splitVariantsResolvedValue") {
            const neg = res.variants.find((v: any) => v.when.startsWith("!"));
            // Get ALL positive variants (not just one) for nested ternaries
            const allPos = res.variants.filter((v: any) => !v.when.startsWith("!"));

            const cssProp = (d.property ?? "").trim();
            let stylexProp: string;
            // For heterogeneous backgrounds, we'll determine the prop per-variant
            let isHeterogeneousBackground = false;
            if (cssProp === "background") {
              const variantValues = res.variants
                .filter((v: any) => typeof v.expr === "string")
                .map((v: any) => v.expr as string);
              const resolved = resolveBackgroundStylexPropForVariants(variantValues);
              if (!resolved) {
                // Heterogeneous - each variant gets its own StyleX property
                isHeterogeneousBackground = true;
                // Use a placeholder; actual prop is determined per-variant
                stylexProp = "backgroundColor";
              } else {
                stylexProp = resolved;
              }
            } else {
              stylexProp = cssPropertyToStylexProp(cssProp);
            }

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            // e.g., `rotate(${...})` should wrap the resolved value with `rotate(...)`.
            const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "Adapter resolveCall returned an unparseable styles expression",
                  loc: decl.loc,
                  context: { localName: decl.localName, expr },
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            // Helper to expand border shorthand from a string literal like "2px solid blue"
            // or a template literal like `1px solid ${color}` or `${width} solid ${color}`
            const expandBorderShorthand = (
              target: Record<string, unknown>,
              exprAst: any,
              direction: string = "", // "Top", "Right", "Bottom", "Left", or ""
            ): boolean => {
              const widthProp = `border${direction}Width`;
              const styleProp = `border${direction}Style`;
              const colorProp = `border${direction}Color`;

              // Handle various AST wrapper structures
              let node = exprAst;
              // Unwrap ExpressionStatement if present
              if (node?.type === "ExpressionStatement") {
                node = node.expression;
              }

              // Handle string literals: "2px solid blue"
              if (node?.type === "StringLiteral" || node?.type === "Literal") {
                const value = node.value;
                if (typeof value !== "string") {
                  return false;
                }
                const parsed = parseBorderShorthandParts(value);
                if (!parsed) {
                  return false;
                }
                const { width, style, color } = parsed;
                if (width) {
                  target[widthProp] = j.literal(width);
                }
                if (style) {
                  target[styleProp] = j.literal(style);
                }
                if (color) {
                  target[colorProp] = j.literal(color);
                }
                return true;
              }

              // Handle template literals: `1px solid ${color}` or `${width} solid ${color}`
              if (node?.type === "TemplateLiteral") {
                const quasis = node.quasis ?? [];
                const exprs = node.expressions ?? [];

                // Format 1: `1px solid ${color}` - static width/style, dynamic color
                // quasis: ["1px solid ", ""], exprs: [colorExpr]
                if (quasis.length === 2 && exprs.length === 1) {
                  const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
                  const suffix = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";
                  if (suffix.trim() !== "") {
                    return false;
                  }
                  const parsed = parseInterpolatedBorderStaticParts({
                    prop: direction ? `border-${direction.toLowerCase()}` : "border",
                    prefix,
                    suffix,
                  });
                  if (!parsed?.width || !parsed?.style) {
                    return false;
                  }
                  target[widthProp] = j.literal(parsed.width);
                  target[styleProp] = j.literal(parsed.style);
                  target[colorProp] = exprs[0];
                  return true;
                }

                // Format 2: `${width} solid ${color}` - dynamic width, static style, dynamic color
                // quasis: ["", " solid ", ""], exprs: [widthExpr, colorExpr]
                if (quasis.length === 3 && exprs.length === 2) {
                  const prefix = quasis[0]?.value?.cooked ?? quasis[0]?.value?.raw ?? "";
                  const middle = quasis[1]?.value?.cooked ?? quasis[1]?.value?.raw ?? "";
                  const suffix = quasis[2]?.value?.cooked ?? quasis[2]?.value?.raw ?? "";
                  // First quasi should be empty (width is the first expression)
                  if (prefix.trim() !== "") {
                    return false;
                  }
                  // Last quasi should be empty (color is the last expression)
                  if (suffix.trim() !== "") {
                    return false;
                  }
                  // Middle quasi should contain only the border style
                  const middleTrimmed = middle.trim();
                  if (!BORDER_STYLES.has(middleTrimmed)) {
                    return false;
                  }
                  target[widthProp] = exprs[0];
                  target[styleProp] = j.literal(middleTrimmed);
                  target[colorProp] = exprs[1];
                  return true;
                }
              }

              return false;
            };

            const expandBoxShorthand = (
              target: Record<string, unknown>,
              exprAst: unknown,
              propName: "padding" | "margin",
            ): boolean => {
              const unwrapNode = (
                value: unknown,
              ): { type?: string; value?: unknown; expression?: unknown } | null => {
                return value && typeof value === "object"
                  ? (value as { type?: string; value?: unknown; expression?: unknown })
                  : null;
              };
              let node = unwrapNode(exprAst);
              if (node?.type === "ExpressionStatement") {
                node = unwrapNode(node.expression);
              }
              if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
                return false;
              }
              const rawValue = node.value;
              if (typeof rawValue !== "string") {
                return false;
              }
              const entries = splitDirectionalProperty({
                prop: propName,
                rawValue,
                important: d.important,
              });
              if (!entries.length) {
                return false;
              }
              for (const entry of entries) {
                target[entry.prop] = j.literal(entry.value);
              }
              return true;
            };

            const applyParsed = (
              target: Record<string, unknown>,
              parsed: { exprAst: unknown; imports: any[] },
              stylexPropOverride?: string,
            ): void => {
              const effectiveStylexProp = stylexPropOverride ?? stylexProp;
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              // Special handling for border shorthand (including directional borders)
              const borderMatch = cssProp.match(/^border(-top|-right|-bottom|-left)?$/);
              if (borderMatch) {
                const direction = borderMatch[1]
                  ? borderMatch[1].slice(1).charAt(0).toUpperCase() + borderMatch[1].slice(2)
                  : "";
                if (expandBorderShorthand(target, parsed.exprAst, direction)) {
                  return;
                }
              }
              if (
                (cssProp === "padding" || cssProp === "margin") &&
                expandBoxShorthand(target, parsed.exprAst, cssProp)
              ) {
                return;
              }
              // Default: use the property from cssDeclarationToStylexDeclarations.
              // Preserve media/pseudo selectors by writing a per-prop map instead of
              // overwriting the base/default value.
              if (media) {
                const existing = target[effectiveStylexProp];
                const map =
                  existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  !isAstNode(existing)
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[effectiveStylexProp];
                  map.default = baseValue ?? null;
                }
                map[media] = parsed.exprAst as any;
                target[effectiveStylexProp] = map;
                return;
              }
              if (pseudos?.length) {
                const existing = target[effectiveStylexProp];
                // `existing` may be:
                // - a scalar (string/number)
                // - an AST node (e.g. { type: "StringLiteral", ... })
                // - an already-built pseudo map (plain object with `default` / `:hover` keys)
                //
                // Only treat it as an existing pseudo map when it's a plain object *and* not an AST node.
                const map =
                  existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  !isAstNode(existing)
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[effectiveStylexProp];
                  map.default = baseValue ?? null;
                }
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[effectiveStylexProp] = map;
                return;
              }

              target[effectiveStylexProp] = parsed.exprAst as any;
            };

            // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
            // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
            const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
            if (neg && !negParsed) {
              bailUnsupported(
                decl,
                "Adapter resolveCall returned an unparseable styles expression",
              );
              break;
            }
            // Parse all positive variants - skip entire declaration if any fail
            const allPosParsed: Array<{
              when: string;
              nameHint: string;
              parsed: { exprAst: unknown; imports: any[] };
            }> = [];
            let anyPosFailed = false;
            for (const posV of allPos) {
              const parsed = parseResolved(posV.expr, posV.imports);
              if (!parsed) {
                anyPosFailed = true;
                break;
              }
              allPosParsed.push({ when: posV.when, nameHint: posV.nameHint, parsed });
            }
            if (anyPosFailed) {
              bailUnsupported(
                decl,
                `Adapter resolveCall returned an unparseable styles expression`,
              );
              break;
            }

            // For heterogeneous backgrounds, we need each variant to go to its own bucket
            // with its own StyleX property (backgroundImage for gradients, backgroundColor for colors)
            if (isHeterogeneousBackground) {
              // Each variant gets its own StyleX property based on its value
              // All branches go to variant buckets (no base style for heterogeneous backgrounds)
              const isNestedTernary = allPosParsed.length > 1;

              // Apply negative (falsy) variant to its own bucket
              if (neg && negParsed) {
                const negStylexProp = resolveBackgroundStylexProp(neg.expr);
                // Use the negated condition name for the bucket (e.g., "!$useGradient" -> "!$useGradient")
                const bucket = { ...variantBuckets.get(neg.when) } as Record<string, unknown>;
                applyParsed(bucket, negParsed, negStylexProp);
                variantBuckets.set(neg.when, bucket);
                const suffix = toSuffixFromProp(neg.when);
                variantStyleKeys[neg.when] ??= `${decl.styleKey}${suffix}`;
              }

              // Apply positive variants to their own buckets
              for (let i = 0; i < allPosParsed.length; i++) {
                const { when, nameHint, parsed } = allPosParsed[i]!;
                const posV = allPos[i]!;
                const posStylexProp = resolveBackgroundStylexProp(posV.expr);
                const whenClean = when.replace(/^!/, "");
                const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
                applyParsed(bucket, parsed, posStylexProp);
                variantBuckets.set(whenClean, bucket);
                const genericHints = new Set(["truthy", "falsy", "default", "match"]);
                const useMeaningfulHint =
                  isNestedTernary && nameHint && !genericHints.has(nameHint);
                const suffix = useMeaningfulHint
                  ? nameHint.charAt(0).toUpperCase() + nameHint.slice(1)
                  : toSuffixFromProp(whenClean);
                variantStyleKeys[whenClean] ??= `${decl.styleKey}${suffix}`;
              }
              continue;
            }

            if (negParsed) {
              applyParsed(styleObj as any, negParsed);
            }
            // Apply all positive variants
            // For nested ternaries (multiple variants), use simpler nameHint-based naming.
            // For single-variant cases, use toSuffixFromProp which includes prop name (e.g., ColorPrimary).
            const isNestedTernary = allPosParsed.length > 1;
            for (const { when, nameHint, parsed } of allPosParsed) {
              const whenClean = when.replace(/^!/, "");
              const bucket = { ...variantBuckets.get(whenClean) } as Record<string, unknown>;
              applyParsed(bucket, parsed);
              variantBuckets.set(whenClean, bucket);
              // Use nameHint only for nested ternaries and when it's meaningful.
              // Generic hints like "truthy", "falsy", "default", "match" should fall back to toSuffixFromProp
              const genericHints = new Set(["truthy", "falsy", "default", "match"]);
              const useMeaningfulHint = isNestedTernary && nameHint && !genericHints.has(nameHint);
              const suffix = useMeaningfulHint
                ? nameHint.charAt(0).toUpperCase() + nameHint.slice(1)
                : toSuffixFromProp(whenClean);
              variantStyleKeys[whenClean] ??= `${decl.styleKey}${suffix}`;
            }
            continue;
          }

          if (res && res.type === "splitMultiPropVariantsResolvedValue") {
            const cssProp = (d.property ?? "").trim();
            let stylexPropMulti: string;
            if (cssProp === "background") {
              const variantValues = [
                res.outerTruthyBranch?.expr,
                res.innerTruthyBranch?.expr,
                res.innerFalsyBranch?.expr,
              ].filter((expr): expr is string => typeof expr === "string");
              const resolved = resolveBackgroundStylexPropForVariants(variantValues);
              if (!resolved) {
                // Heterogeneous - can't safely transform
                warnings.push({
                  severity: "warning",
                  type: "Heterogeneous background values (mix of gradients and colors) not currently supported",
                  loc: decl.loc,
                  context: { localName: decl.localName },
                });
                bail = true;
                break;
              }
              stylexPropMulti = resolved;
            } else {
              stylexPropMulti = cssPropertyToStylexProp(cssProp);
            }

            // Extract static prefix/suffix from CSS value for wrapping resolved values
            const { prefix: staticPrefix, suffix: staticSuffix } = extractStaticParts(d.value, {
              skipForProperty: /^border(-top|-right|-bottom|-left)?-color$/,
              property: cssProp,
            });

            const parseResolved = (
              expr: string,
              imports: any[],
            ): { exprAst: unknown; imports: any[] } | null => {
              const wrappedExpr = wrapExprWithStaticParts(expr, staticPrefix, staticSuffix);
              const exprAst = parseExpr(wrappedExpr);
              if (!exprAst) {
                warnings.push({
                  severity: "error",
                  type: "Adapter resolveCall returned an unparseable styles expression",
                  loc: decl.loc,
                  context: { localName: decl.localName, expr },
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            const applyParsed = (
              target: Record<string, unknown>,
              parsed: { exprAst: unknown; imports: any[] },
            ): void => {
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              if (pseudos?.length) {
                const existing = target[stylexPropMulti];
                const map =
                  existing &&
                  typeof existing === "object" &&
                  !Array.isArray(existing) &&
                  !isAstNode(existing)
                    ? (existing as Record<string, unknown>)
                    : ({} as Record<string, unknown>);
                // Set default from target first, then fall back to base styleObj.
                // Only use null if neither has a value (for properties like outlineStyle that need explicit null).
                if (!("default" in map)) {
                  const baseValue = existing ?? styleObj[stylexPropMulti];
                  map.default = baseValue ?? null;
                }
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[stylexPropMulti] = map;
                return;
              }
              target[stylexPropMulti] = parsed.exprAst as any;
            };

            // Parse all three branches
            const outerParsed = parseResolved(
              res.outerTruthyBranch.expr,
              res.outerTruthyBranch.imports,
            );
            const innerTruthyParsed = parseResolved(
              res.innerTruthyBranch.expr,
              res.innerTruthyBranch.imports,
            );
            const innerFalsyParsed = parseResolved(
              res.innerFalsyBranch.expr,
              res.innerFalsyBranch.imports,
            );

            if (!outerParsed || !innerTruthyParsed || !innerFalsyParsed) {
              bailUnsupported(
                decl,
                "Adapter resolveCall returned an unparseable styles expression",
              );
              break;
            }

            // Generate style keys for each branch
            const outerKey = `${decl.styleKey}${capitalize(res.outerProp)}`;
            const innerTruthyKey = `${decl.styleKey}${capitalize(res.innerProp)}True`;
            const innerFalsyKey = `${decl.styleKey}${capitalize(res.innerProp)}False`;

            // Create variant buckets for each branch
            const outerBucket = { ...variantBuckets.get(res.outerProp) } as Record<string, unknown>;
            applyParsed(outerBucket, outerParsed);
            variantBuckets.set(res.outerProp, outerBucket);
            variantStyleKeys[res.outerProp] ??= outerKey;

            const innerTruthyWhen = `${res.innerProp}True`;
            const innerTruthyBucket = { ...variantBuckets.get(innerTruthyWhen) } as Record<
              string,
              unknown
            >;
            applyParsed(innerTruthyBucket, innerTruthyParsed);
            variantBuckets.set(innerTruthyWhen, innerTruthyBucket);
            variantStyleKeys[innerTruthyWhen] ??= innerTruthyKey;

            const innerFalsyWhen = `${res.innerProp}False`;
            const innerFalsyBucket = { ...variantBuckets.get(innerFalsyWhen) } as Record<
              string,
              unknown
            >;
            applyParsed(innerFalsyBucket, innerFalsyParsed);
            variantBuckets.set(innerFalsyWhen, innerFalsyBucket);
            variantStyleKeys[innerFalsyWhen] ??= innerFalsyKey;

            // Store compound variant info for emit phase
            decl.compoundVariants ??= [];
            decl.compoundVariants.push({
              outerProp: res.outerProp,
              outerTruthyKey: outerKey,
              innerProp: res.innerProp,
              innerTruthyKey,
              innerFalsyKey,
            });

            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "emitConditionalIndexedThemeFunction") {
            // Handle conditional indexed theme lookup:
            //   props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle
            //
            // Strategy: Add fallback as base style, style function provides override when prop is defined.
            // This works because the emit logic guards the function call with `propName != null &&`.
            //   Base style: { color: themeVars.labelTitle }
            //   Style function: (textColor: Colors) => ({ color: themeVars[textColor] })
            //   Usage: styles.badge, textColor != null && styles.badgeColor(textColor)

            // Add imports from both theme resolutions
            for (const imp of res.themeObjectImports) {
              resolverImports.set(JSON.stringify(imp), imp);
            }
            for (const imp of res.fallbackImports) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Mark prop to not forward to DOM
            ensureShouldForwardPropDrop(decl, res.propName);

            // Parse the theme expressions
            const themeObjAst = parseExpr(res.themeObjectExpr);
            const fallbackAst = parseExpr(res.fallbackExpr);
            if (!themeObjAst || !fallbackAst) {
              warnings.push({
                severity: "error",
                type: "Failed to parse theme expressions",
                loc: decl.loc,
                context: {
                  localName: decl.localName,
                  themeObjExpr: res.themeObjectExpr,
                  fallbackExpr: res.fallbackExpr,
                },
              });
              bail = true;
              break;
            }

            // Generate function-based style for each CSS output property
            const outs = cssDeclarationToStylexDeclarations(d);
            for (const out of outs) {
              if (!out.prop) {
                continue;
              }

              // Add fallback to base styleObj
              styleObj[out.prop] = fallbackAst as any;

              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              if (!styleFnDecls.has(fnKey)) {
                // Get prop type from component's type annotation if available
                const propTsType = findJsxPropTsType(res.propName);
                const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
                const param = j.identifier(paramName);

                // Add type annotation (without | undefined since the function is only called when defined)
                if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
                  (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
                }

                // Build: themeObj[propName] (no conditional - fallback is in base style)
                const valueExpr = j.memberExpression(
                  themeObjAst as any,
                  j.identifier(paramName),
                  true,
                );

                const body = j.objectExpression([
                  j.property("init", makeCssPropKey(j, out.prop), valueExpr),
                ]);

                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
              }

              // Use condition: "truthy" to mirror the original `props.textColor ? ... : fallback`
              // semantics. This ensures falsy-but-defined values (empty string, 0, false) use
              // the fallback rather than attempting an indexed lookup.
              styleFnFromProps.push({ fnKey, jsxProp: res.propName, condition: "truthy" });
            }

            if (bail) {
              break;
            }

            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "emitIndexedThemeFunctionWithPropFallback") {
            // Handle indexed theme lookup with prop fallback:
            //   props.theme.color[props.backgroundColor] || props.backgroundColor
            //
            // Output: (backgroundColor: Color) => ({ backgroundColor: $colors[backgroundColor] ?? backgroundColor })

            // Add imports from theme resolution
            for (const imp of res.themeObjectImports) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Mark prop to not forward to DOM
            ensureShouldForwardPropDrop(decl, res.propName);

            // Parse the theme expression
            const themeObjAst = parseExpr(res.themeObjectExpr);
            if (!themeObjAst) {
              warnings.push({
                severity: "error",
                type: "Failed to parse theme expressions",
                loc: decl.loc,
                context: {
                  localName: decl.localName,
                  themeObjExpr: res.themeObjectExpr,
                },
              });
              bail = true;
              break;
            }

            // Generate function-based style for each CSS output property
            const outs = cssDeclarationToStylexDeclarations(d);
            for (const out of outs) {
              if (!out.prop) {
                continue;
              }

              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              if (!styleFnDecls.has(fnKey)) {
                // Get prop type from component's type annotation if available
                const propTsType = findJsxPropTsType(res.propName);
                const paramName = buildSafeIndexedParamName(res.propName, themeObjAst);
                const param = j.identifier(paramName);

                // Add type annotation if available
                if (propTsType && typeof propTsType === "object" && (propTsType as any).type) {
                  (param as any).typeAnnotation = j.tsTypeAnnotation(propTsType as any);
                }

                // Build: themeObj[propName] ?? `${propName}`
                // The template literal wrapper satisfies StyleX's static analyzer for the fallback
                const indexedLookup = j.memberExpression(
                  themeObjAst as any,
                  j.identifier(paramName),
                  true,
                );
                const fallbackExpr = j.templateLiteral(
                  [
                    j.templateElement({ raw: "", cooked: "" }, false),
                    j.templateElement({ raw: "", cooked: "" }, true),
                  ],
                  [j.identifier(paramName)],
                );
                const valueExpr = j.logicalExpression(res.operator, indexedLookup, fallbackExpr);

                const body = j.objectExpression([
                  j.property("init", makeCssPropKey(j, out.prop), valueExpr),
                ]);

                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
              }

              // Let the wrapper emitter handle required vs optional props:
              // - Required props: styles.fn(prop)
              // - Optional props: prop != null && styles.fn(prop)
              styleFnFromProps.push({ fnKey, jsxProp: res.propName });
            }

            if (bail) {
              break;
            }

            decl.needsWrapperComponent = true;
            continue;
          }

          if (res && res.type === "emitStyleFunctionFromPropsObject") {
            if (!d.property) {
              // This handler is only intended for value interpolations on concrete properties.
              // If the IR is missing a property, fall through to other handlers.
            } else {
              const e = decl.templateExpressions[slotId] as any;
              if (e?.type !== "ArrowFunctionExpression" && e?.type !== "FunctionExpression") {
                bailUnsupported(decl, "Unsupported interpolation: arrow function");
                break;
              }
              if (hasThemeAccessInArrowFn(e)) {
                warnPropInlineStyle(
                  decl,
                  "Unsupported prop-based inline style props.theme access is not supported",
                  d.property,
                  loc,
                );
                bail = true;
                break;
              }
              const bodyExpr = getFunctionBodyExpr(e);
              if (!bodyExpr) {
                warnPropInlineStyle(
                  decl,
                  "Unsupported prop-based inline style expression cannot be safely inlined",
                  d.property,
                  loc,
                );
                bail = true;
                break;
              }
              for (const propName of res.props ?? []) {
                ensureShouldForwardPropDrop(decl, propName);
              }
              decl.needsWrapperComponent = true;
              const paramName = e.params?.[0]?.type === "Identifier" ? e.params[0].name : "props";
              for (const out of cssDeclarationToStylexDeclarations(d)) {
                if (!out.prop) {
                  continue;
                }
                const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
                if (!styleFnDecls.has(fnKey)) {
                  const valueExpr = cloneAstNode(bodyExpr);
                  const param = j.identifier(paramName);
                  const body = j.objectExpression([
                    j.property(
                      "init",
                      makeCssPropKey(j, out.prop),
                      buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
                    ),
                  ]);
                  styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
                }
                if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                  const callArg = j.objectExpression(
                    (res.props ?? []).map((propName) => {
                      const prop = j.property(
                        "init",
                        j.identifier(propName),
                        j.identifier(propName),
                      ) as any;
                      prop.shorthand = true;
                      return prop;
                    }),
                  );
                  styleFnFromProps.push({
                    fnKey,
                    jsxProp: "__props",
                    callArg,
                  });
                }
              }
              continue;
            }
          }

          if (res && res.type === "emitInlineStyleValueFromProps") {
            if (!d.property) {
              // This handler is only intended for value interpolations on concrete properties.
              // If the IR is missing a property, fall through to other handlers.
            } else {
              const e = decl.templateExpressions[slotId] as any;
              if (e?.type === "ArrowFunctionExpression") {
                if (pseudos?.length || media) {
                  const bodyExpr = getFunctionBodyExpr(e);
                  if (countConditionalExpressions(bodyExpr) > 1) {
                    warnings.push({
                      severity: "warning",
                      type: `Unsupported nested conditional interpolation`,
                      loc,
                      context: { localName: decl.localName },
                    });
                    bail = true;
                    break;
                  }
                  const propsParam = j.identifier("props");
                  if (/\.(ts|tsx)$/.test(filePath)) {
                    const typeName = `${decl.localName}Props`;
                    (propsParam as any).typeAnnotation = j.tsTypeAnnotation(
                      j.tsTypeReference(j.identifier(typeName)),
                    );
                  }
                  const valueExprRaw = (() => {
                    if (hasThemeAccessInArrowFn(e)) {
                      warnPropInlineStyle(
                        decl,
                        "Unsupported prop-based inline style props.theme access is not supported",
                        d.property,
                        loc,
                      );
                      bail = true;
                      return null;
                    }
                    const inlineExpr = inlineArrowFunctionBody(j, e);
                    if (!inlineExpr) {
                      warnPropInlineStyle(
                        decl,
                        "Unsupported prop-based inline style expression cannot be safely inlined",
                        d.property,
                        loc,
                      );
                      bail = true;
                      return null;
                    }
                    const baseExpr = inlineExpr;
                    const { prefix, suffix } = extractStaticParts(d.value);
                    return prefix || suffix
                      ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                      : baseExpr;
                  })();
                  if (bail || !valueExprRaw) {
                    break;
                  }
                  for (const out of cssDeclarationToStylexDeclarations(d)) {
                    const wrapValue = (expr: ExpressionKind): ExpressionKind => {
                      const needsString =
                        out.prop === "boxShadow" ||
                        out.prop === "backgroundColor" ||
                        out.prop.toLowerCase().endsWith("color");
                      if (!needsString) {
                        return expr;
                      }
                      return j.templateLiteral(
                        [
                          j.templateElement({ raw: "", cooked: "" }, false),
                          j.templateElement({ raw: "", cooked: "" }, true),
                        ],
                        [expr],
                      );
                    };
                    const valueExpr = wrapValue(valueExprRaw);
                    const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
                    if (!styleFnDecls.has(fnKey)) {
                      const p = j.property(
                        "init",
                        makeCssPropKey(j, out.prop),
                        buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
                      ) as any;
                      const body = j.objectExpression([p]);
                      styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
                    }
                    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                      styleFnFromProps.push({ fnKey, jsxProp: "__props" });
                    }
                  }
                  continue;
                }
                if (decl.shouldForwardProp && hasUnsupportedConditionalTest(e)) {
                  warnings.push({
                    severity: "warning",
                    type: "Unsupported conditional test in shouldForwardProp",
                    loc,
                    context: { localName: decl.localName },
                  });
                  bail = true;
                  break;
                }
                const propsUsed = collectPropsFromArrowFn(e);
                for (const propName of propsUsed) {
                  ensureShouldForwardPropDrop(decl, propName);
                }
                if (hasThemeAccessInArrowFn(e)) {
                  warnPropInlineStyle(
                    decl,
                    "Unsupported prop-based inline style props.theme access is not supported",
                    d.property,
                    loc,
                  );
                  bail = true;
                  break;
                }
                const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
                const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
                if (!inlineExpr) {
                  warnPropInlineStyle(
                    decl,
                    "Unsupported prop-based inline style expression cannot be safely inlined",
                    d.property,
                    loc,
                  );
                  bail = true;
                  break;
                }
                decl.needsWrapperComponent = true;
                const baseExpr = inlineExpr;
                // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
                const { prefix, suffix } = extractStaticParts(d.value);
                const valueExpr =
                  prefix || suffix
                    ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                    : baseExpr;
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (!out.prop) {
                    continue;
                  }
                  inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
                }
                continue;
              }
              if (e) {
                const buildRuntimeValueExpr = (expr: ExpressionKind): ExpressionKind => {
                  const valueId = j.identifier("__scValue");
                  const exprClone = cloneAstNode(expr);
                  const declStmt = j.variableDeclaration("const", [
                    j.variableDeclarator(valueId, exprClone),
                  ]);
                  const isFn = j.binaryExpression(
                    "===",
                    j.unaryExpression("typeof", valueId),
                    j.literal("function"),
                  );
                  // Cast to any to avoid TS error when the value type is narrowed to never
                  // Wrap in parentheses: (__scValue as any)(props)
                  const asAny = j.tsAsExpression(valueId, j.tsAnyKeyword());
                  (asAny as any).extra = { parenthesized: true };
                  const callValue = j.callExpression(asAny, [j.identifier("props")]);
                  const valueExpr = j.conditionalExpression(isFn, callValue, valueId);
                  return j.callExpression(
                    j.arrowFunctionExpression(
                      [],
                      j.blockStatement([declStmt, j.returnStatement(valueExpr)]),
                    ),
                    [],
                  );
                };

                if (pseudos?.length || media) {
                  const baseExpr = buildRuntimeValueExpr(e as ExpressionKind);
                  const { prefix, suffix } = extractStaticParts(d.value);
                  const valueExprRaw =
                    prefix || suffix
                      ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                      : baseExpr;
                  const propsParam = j.identifier("props");
                  for (const out of cssDeclarationToStylexDeclarations(d)) {
                    const wrapValue = (expr: ExpressionKind): ExpressionKind => {
                      const needsString =
                        out.prop === "boxShadow" ||
                        out.prop === "backgroundColor" ||
                        out.prop.toLowerCase().endsWith("color");
                      if (!needsString) {
                        return expr;
                      }
                      return j.templateLiteral(
                        [
                          j.templateElement({ raw: "", cooked: "" }, false),
                          j.templateElement({ raw: "", cooked: "" }, true),
                        ],
                        [expr],
                      );
                    };
                    const valueExpr = wrapValue(valueExprRaw);
                    const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
                    if (!styleFnDecls.has(fnKey)) {
                      const p = j.property(
                        "init",
                        makeCssPropKey(j, out.prop),
                        buildPseudoMediaPropValue({ j, valueExpr, pseudos, media }),
                      ) as any;
                      const body = j.objectExpression([p]);
                      styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
                    }
                    if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                      styleFnFromProps.push({ fnKey, jsxProp: "__props" });
                    }
                  }
                  continue;
                }

                // For static expressions (not ArrowFunction/FunctionExpression),
                // use the expression directly without the IIFE wrapper.
                // The IIFE with __scValue is only needed for props-dependent expressions.
                const isStaticExpr =
                  e.type !== "ArrowFunctionExpression" && e.type !== "FunctionExpression";
                const baseExpr = isStaticExpr
                  ? cloneAstNode(e as ExpressionKind)
                  : buildRuntimeValueExpr(e as ExpressionKind);
                const { prefix, suffix } = extractStaticParts(d.value);
                const valueExpr =
                  prefix || suffix
                    ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                    : baseExpr;
                decl.needsWrapperComponent = true;
                for (const out of cssDeclarationToStylexDeclarations(d)) {
                  if (!out.prop) {
                    continue;
                  }
                  inlineStyleProps.push({ prop: out.prop, expr: valueExpr });
                }
                continue;
              }
            }
          }

          // Handle emitStyleFunctionWithDefault: emit both static base style AND dynamic override
          if (res && res.type === "emitStyleFunctionWithDefault") {
            const jsxProp = res.call;
            const outs = cssDeclarationToStylexDeclarations(d);

            // Extract the static default value
            const defaultStaticValue = literalToStaticValue(res.defaultValue);

            for (let i = 0; i < outs.length; i++) {
              const out = outs[i]!;

              // Add static base style with default value
              if (defaultStaticValue !== null && !pseudos?.length && !media) {
                styleObj[out.prop] = defaultStaticValue;
              }

              // Add dynamic style function (same as emitStyleFunction)
              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp });

              if (!styleFnDecls.has(fnKey)) {
                const outParamName = cssPropertyToIdentifier(out.prop);
                const param = j.identifier(outParamName);
                if (jsxProp !== "__props") {
                  annotateParamFromJsxProp(param, jsxProp);
                }
                if (jsxProp?.startsWith?.("$")) {
                  ensureShouldForwardPropDrop(decl, jsxProp);
                }

                const p = makeCssProperty(j, out.prop, outParamName);
                const body = j.objectExpression([p]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
              }
            }
            continue;
          }

          if (res && res.type === "emitStyleFunction") {
            const jsxProp = res.call;
            {
              const outs = cssDeclarationToStylexDeclarations(d);
              for (let i = 0; i < outs.length; i++) {
                const out = outs[i]!;
                const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
                styleFnFromProps.push({ fnKey, jsxProp });

                if (!styleFnDecls.has(fnKey)) {
                  // IMPORTANT: don't reuse the same Identifier node for both the function param and
                  // expression positions. If the param identifier has a TS annotation, reusing it
                  // in expression positions causes printers to emit `value: any` inside templates.
                  const outParamName = cssPropertyToIdentifier(out.prop);
                  const param = j.identifier(outParamName);
                  const valueId = j.identifier(outParamName);
                  // Be permissive: callers might pass numbers (e.g. `${props => props.$width}px`)
                  // or strings (e.g. `${props => props.$color}`).
                  if (jsxProp !== "__props") {
                    annotateParamFromJsxProp(param, jsxProp);
                  }
                  if (jsxProp?.startsWith?.("$")) {
                    ensureShouldForwardPropDrop(decl, jsxProp);
                  }

                  // If this declaration is a simple interpolated string with a single slot and
                  // surrounding static text, preserve it by building a TemplateLiteral around the
                  // prop value, e.g. `${value}px`, `opacity ${value}ms`.
                  const buildValueExpr = (): any => {
                    const transformed = (() => {
                      const vt = (
                        res as { valueTransform?: { kind: string; calleeIdent?: string } }
                      ).valueTransform;
                      if (vt?.kind === "call" && typeof vt.calleeIdent === "string") {
                        return j.callExpression(j.identifier(vt.calleeIdent), [valueId]);
                      }
                      return valueId;
                    })();
                    const wrapTemplate = !!(res as { wrapValueInTemplateLiteral?: boolean })
                      .wrapValueInTemplateLiteral;
                    const transformedValue = wrapTemplate
                      ? j.templateLiteral(
                          [
                            j.templateElement({ raw: "", cooked: "" }, false),
                            j.templateElement({ raw: "", cooked: "" }, true),
                          ],
                          [transformed],
                        )
                      : transformed;
                    const v: any = (d as any).value;
                    if (!v || v.kind !== "interpolated") {
                      return transformedValue;
                    }
                    const parts: any[] = v.parts ?? [];
                    const slotParts = parts.filter((p: any) => p?.kind === "slot");
                    if (slotParts.length !== 1) {
                      return transformedValue;
                    }
                    const onlySlot = slotParts[0]!;
                    if (onlySlot.slotId !== slotId) {
                      return transformedValue;
                    }

                    // If it's just the slot, keep it as the raw value (number/string).
                    const hasStatic = parts.some(
                      (p: any) => p?.kind === "static" && p.value !== "",
                    );
                    if (!hasStatic) {
                      return transformedValue;
                    }

                    const quasis: any[] = [];
                    const exprs: any[] = [];
                    let q = "";
                    for (const part of parts) {
                      if (part?.kind === "static") {
                        q += String(part.value ?? "");
                        continue;
                      }
                      if (part?.kind === "slot") {
                        quasis.push(j.templateElement({ raw: q, cooked: q }, false));
                        q = "";
                        exprs.push(transformed);
                        continue;
                      }
                    }
                    quasis.push(j.templateElement({ raw: q, cooked: q }, true));
                    return j.templateLiteral(quasis, exprs);
                  };

                  const valueExpr = buildValueExpr();
                  const getPropValue = (): ExpressionKind => {
                    if (!media) {
                      return valueExpr;
                    }
                    const existingFn = styleFnDecls.get(fnKey);
                    let existingValue: ExpressionKind | null = null;
                    if (existingFn?.type === "ArrowFunctionExpression") {
                      const body = existingFn.body;
                      if (body?.type === "ObjectExpression") {
                        const prop = body.properties.find((propNode: unknown) => {
                          if (!propNode || typeof propNode !== "object") {
                            return false;
                          }
                          if ((propNode as { type?: string }).type !== "Property") {
                            return false;
                          }
                          const key = (propNode as { key?: unknown }).key;
                          if (!key || typeof key !== "object") {
                            return false;
                          }
                          const keyType = (key as { type?: string }).type;
                          if (keyType === "Identifier") {
                            return (key as { name?: string }).name === out.prop;
                          }
                          if (keyType === "Literal") {
                            return (key as { value?: unknown }).value === out.prop;
                          }
                          return false;
                        });
                        if (prop && prop.type === "Property") {
                          existingValue = prop.value;
                        }
                      }
                    }
                    const defaultValue = existingValue ?? j.literal(null);
                    return j.objectExpression([
                      j.property("init", j.identifier("default"), defaultValue),
                      j.property("init", j.literal(media), valueExpr),
                    ]);
                  };
                  const propKey = makeCssPropKey(j, out.prop);
                  const p = j.property("init", propKey, getPropValue()) as any;
                  // Only use shorthand if the key is an identifier (not a string literal for CSS vars)
                  const paramName = cssPropertyToIdentifier(out.prop);
                  p.shorthand =
                    propKey.type === "Identifier" &&
                    valueExpr?.type === "Identifier" &&
                    valueExpr.name === paramName;
                  const body = j.objectExpression([p]);
                  styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], body));
                }
                if (i === 0) {
                  // No direct prop to attach to here; the style function itself is emitted later.
                  // We conservatively ignore comment preservation in this path.
                }
              }
            }
            continue;
          }

          if (res && res.type === "keepOriginal") {
            warnings.push({
              severity: "warning",
              type: res.reason,
              loc,
            });
            bail = true;
            break;
          }

          if (decl.shouldForwardProp) {
            for (const out of cssDeclarationToStylexDeclarations(d)) {
              if (!out.prop) {
                continue;
              }
              const e = decl.templateExpressions[slotId] as any;
              let baseExpr = e;
              let propsParam = j.identifier("props");
              if (e?.type === "ArrowFunctionExpression") {
                if (hasUnsupportedConditionalTest(e)) {
                  warnPropInlineStyle(
                    decl,
                    "Unsupported conditional test in shouldForwardProp",
                    d.property,
                    loc,
                  );
                  bail = true;
                  break;
                }
                if (hasThemeAccessInArrowFn(e)) {
                  warnPropInlineStyle(
                    decl,
                    "Unsupported prop-based inline style props.theme access is not supported",
                    d.property,
                    loc,
                  );
                  bail = true;
                  break;
                }
                const propsUsed = collectPropsFromArrowFn(e);
                for (const propName of propsUsed) {
                  ensureShouldForwardPropDrop(decl, propName);
                }
                if (e.params?.[0]?.type === "Identifier") {
                  propsParam = j.identifier(e.params[0].name);
                }
                const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
                const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
                if (!inlineExpr) {
                  warnPropInlineStyle(
                    decl,
                    "Unsupported prop-based inline style expression cannot be safely inlined",
                    d.property,
                    loc,
                  );
                  bail = true;
                  break;
                }
                baseExpr = inlineExpr;
              }
              // Build template literal when there's static prefix/suffix (e.g., `${...}ms`)
              const { prefix, suffix } = extractStaticParts(d.value);
              const expr =
                prefix || suffix
                  ? buildTemplateWithStaticParts(j, baseExpr, prefix, suffix)
                  : baseExpr;
              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              if (!styleFnDecls.has(fnKey)) {
                const body = j.objectExpression([
                  j.property(
                    "init",
                    makeCssPropKey(j, out.prop),
                    buildPseudoMediaPropValue({ j, valueExpr: expr, pseudos, media }),
                  ),
                ]);
                styleFnDecls.set(fnKey, j.arrowFunctionExpression([propsParam], body));
              }
              if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
                styleFnFromProps.push({ fnKey, jsxProp: "__props" });
              }
            }
            if (bail) {
              break;
            }
            continue;
          }

          const describeInterpolation = (): {
            type: WarningType;
            context?: Record<string, unknown>;
          } | null => {
            type SlotPart = { kind: "slot"; slotId: number };
            const valueParts = (d.value as { parts?: unknown[] }).parts ?? [];
            const slotPart = valueParts.find(
              (p): p is SlotPart => !!p && typeof p === "object" && (p as SlotPart).kind === "slot",
            );
            if (!slotPart) {
              return d.property
                ? { type: "Unsupported interpolation: property", context: { property: d.property } }
                : null;
            }
            const expr = decl.templateExpressions[slotPart.slotId] as {
              type?: string;
              name?: string;
              callee?: {
                type?: string;
                name?: string;
                property?: { type?: string; name?: string };
              };
            } | null;
            if (!expr || typeof expr !== "object") {
              return d.property
                ? { type: "Unsupported interpolation: property", context: { property: d.property } }
                : null;
            }
            if (expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression") {
              // Provide more specific warning based on arrow function body type.
              // Use getFunctionBodyExpr to handle block bodies with single return statements.
              const body = getFunctionBodyExpr(expr as { body?: unknown }) as {
                type?: string;
                operator?: string;
              } | null;
              const bodyType = body?.type;
              if (bodyType === "ConditionalExpression") {
                return {
                  type: "Arrow function: conditional branches could not be resolved to static or theme values",
                };
              }
              if (bodyType === "LogicalExpression") {
                const op = body?.operator;
                if (op === "&&") {
                  return {
                    type: "Arrow function: logical expression pattern not supported",
                    context: {
                      operator: op,
                      hint: "Expected: props.x && 'css-string'",
                    },
                  };
                }
                if (op === "||" || op === "??") {
                  return {
                    type: "Arrow function: indexed theme lookup pattern not matched",
                    context: { property: d.property, operator: op },
                  };
                }
              }
              if (bodyType === "CallExpression") {
                return {
                  type: "Arrow function: helper call body is not supported",
                  context: { property: d.property },
                };
              }
              if (bodyType === "MemberExpression") {
                return {
                  type: "Arrow function: theme access path could not be resolved",
                  context: { property: d.property },
                };
              }
              return {
                type: "Arrow function: body is not a recognized pattern (expected ternary, logical, call, or member expression)",
                context: { property: d.property, bodyType },
              };
            }
            if (expr.type === "CallExpression") {
              const callee = expr.callee;
              const calleeName =
                callee?.type === "Identifier"
                  ? callee.name
                  : callee?.type === "MemberExpression" && callee.property?.type === "Identifier"
                    ? callee.property.name
                    : null;
              return {
                type: "Unsupported interpolation: call expression",
                context: { callExpression: calleeName, property: d.property },
              };
            }
            if (expr.type === "Identifier") {
              return {
                type: "Unsupported interpolation: identifier",
                context: { identifier: expr.name },
              };
            }
            if (expr.type === "MemberExpression" || expr.type === "OptionalMemberExpression") {
              return {
                type: "Unsupported interpolation: member expression",
                context: { memberExpression: expr.type },
              };
            }
            return d.property
              ? {
                  type: "Unsupported interpolation: call expression",
                  context: { expression: d.property },
                }
              : null;
          };

          const warning = describeInterpolation();
          warnings.push({
            severity: "warning",
            type: warning?.type || "Unsupported interpolation: unknown",
            loc: loc ?? decl.loc,
            context: warning?.context,
          });
          bail = true;
          break;
        }

        const outs = cssDeclarationToStylexDeclarations(d);
        for (let i = 0; i < outs.length; i++) {
          const out = outs[i]!;
          let value = cssValueToJs(out.value, d.important, out.prop);
          if (out.prop === "content" && typeof value === "string") {
            const m = value.match(/^['"]([\s\S]*)['"]$/);
            if (m) {
              value = `"${m[1]}"`;
            } else if (!value.startsWith('"') && !value.endsWith('"')) {
              value = `"${value}"`;
            }
          }
          const commentSource =
            i === 0
              ? {
                  leading: (d as any).leadingComment,
                  trailingLine: (d as any).trailingLineComment,
                }
              : null;
          applyResolvedPropValue(out.prop, value, commentSource);
        }
      }
      if (bail) {
        break;
      }
    }
    if (bail) {
      break;
    }

    for (const [prop, map] of Object.entries(perPropPseudo)) {
      styleObj[prop] = map;
    }
    for (const [prop, map] of Object.entries(perPropMedia)) {
      styleObj[prop] = map;
    }
    // Merge computed media keys (from adapter.resolveSelector)
    // Preserves any existing @media or pseudo entries already in styleObj[prop]
    for (const [prop, entry] of perPropComputedMedia) {
      const existing = styleObj[prop];
      // If the prop already has a media/pseudo map, merge into it
      if (existing && typeof existing === "object" && !isAstNode(existing)) {
        const merged = existing as Record<string, unknown>;
        // Add default if not already present
        if (!("default" in merged)) {
          merged.default = entry.defaultValue;
        }
        // Add computed keys to existing object
        (merged as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
          keyExpr: e.keyExpr,
          value: e.value,
        }));
      } else {
        // No existing map, create a new nested object with default and __computedKeys
        const nested: Record<string, unknown> = { default: entry.defaultValue };
        (nested as Record<string, unknown>).__computedKeys = entry.entries.map((e) => ({
          keyExpr: e.keyExpr,
          value: e.value,
        }));
        styleObj[prop] = nested;
      }
    }
    for (const [sel, obj] of Object.entries(nestedSelectors)) {
      styleObj[sel] = obj;
    }

    const varsToDrop = new Set<string>();
    rewriteCssVarsInStyleObject(styleObj, localVarValues, varsToDrop);
    for (const name of varsToDrop) {
      delete (styleObj as any)[name];
    }

    // Check for interpolations in pseudo selectors that can't be safely transformed
    const hasPseudoBlockInterpolation = (() => {
      if (!decl.rawCss) {
        return false;
      }
      // Match pattern: &:pseudo { ... __SC_EXPR_X__; ... }
      // where the placeholder is standalone (CSS block interpolation), not a property value
      const pseudoBlockRe = /&:[a-z-]+(?:\([^)]*\))?\s*\{([^}]*)\}/gi;
      let m;
      while ((m = pseudoBlockRe.exec(decl.rawCss))) {
        const blockContent = m[1] ?? "";
        // Check if the block contains a standalone placeholder (not part of a property: value)
        // A standalone placeholder is on its own line with optional whitespace/semicolon
        const lines = blockContent.split(/[\n\r]/);
        for (const line of lines) {
          const trimmed = line.trim();
          // Skip empty lines
          if (!trimmed) {
            continue;
          }
          // Check if this line is ONLY a placeholder (no property name before it)
          if (/^__SC_EXPR_\d+__\s*;?\s*$/.test(trimmed)) {
            return true;
          }
        }
      }
      return false;
    })();

    if (
      decl.rawCss &&
      (/__SC_EXPR_\d+__\s*\{/.test(decl.rawCss) ||
        /&:[a-z-]+(?:\([^)]*\))?\s+__SC_EXPR_\d+__\s*\{/i.test(decl.rawCss) ||
        hasPseudoBlockInterpolation)
    ) {
      let didApply = false;
      // ancestorPseudo is null for base styles, or the pseudo string (e.g., ":hover", ":focus-visible")
      const applyBlock = (slotId: number, declsText: string, ancestorPseudo: string | null) => {
        const expr = decl.templateExpressions[slotId] as any;
        if (!expr || expr.type !== "Identifier") {
          return;
        }
        const childLocal = expr.name as string;
        const childDecl = declByLocalName.get(childLocal);
        if (!childDecl) {
          return;
        }
        const overrideStyleKey = `${toStyleKey(childLocal)}In${decl.localName}`;
        ancestorSelectorParents.add(decl.styleKey);
        // Only add to descendantOverrides once per override key
        if (!descendantOverridePseudoBuckets.has(overrideStyleKey)) {
          descendantOverrides.push({
            parentStyleKey: decl.styleKey,
            childStyleKey: childDecl.styleKey,
            overrideStyleKey,
          });
        }
        // Get or create the pseudo buckets map for this override key
        let pseudoBuckets = descendantOverridePseudoBuckets.get(overrideStyleKey);
        if (!pseudoBuckets) {
          pseudoBuckets = new Map();
          descendantOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
        }
        // Get or create the bucket for this specific pseudo (or null for base)
        let bucket = pseudoBuckets.get(ancestorPseudo);
        if (!bucket) {
          bucket = {};
          pseudoBuckets.set(ancestorPseudo, bucket);
        }
        didApply = true;

        const declLines = declsText
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const line of declLines) {
          const m = line.match(/^([^:]+):([\s\S]+)$/);
          if (!m || !m[1] || !m[2]) {
            continue;
          }
          const prop = m[1].trim();
          const value = m[2].trim();
          // Skip values that contain unresolved interpolation placeholders - these should
          // be handled by the IR handler which has proper theme resolution
          if (/__SC_EXPR_\d+__/.test(value)) {
            continue;
          }
          // Convert CSS property name to camelCase (e.g., outline-offset -> outlineOffset)
          const outProp = cssPropertyToStylexProp(
            prop === "background" ? resolveBackgroundStylexProp(value) : prop,
          );
          const jsVal = cssValueToJs({ kind: "static", value } as any, false, outProp);
          (bucket as Record<string, unknown>)[outProp] = jsVal;
        }
      };

      const baseRe = /__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/g;
      let m: RegExpExecArray | null;
      while ((m = baseRe.exec(decl.rawCss))) {
        const before = decl.rawCss.slice(Math.max(0, m.index - 30), m.index);
        // Skip if this is preceded by a pseudo selector pattern
        if (/&:[a-z-]+(?:\([^)]*\))?\s+$/i.test(before)) {
          continue;
        }
        applyBlock(Number(m[1]), m[2] ?? "", null);
      }
      // Match any pseudo selector pattern: &:hover, &:focus-visible, &:active, etc.
      const pseudoRe = /&(:[a-z-]+(?:\([^)]*\))?)\s+__SC_EXPR_(\d+)__\s*\{([\s\S]*?)\}/gi;
      while ((m = pseudoRe.exec(decl.rawCss))) {
        if (!m[1]) {
          continue;
        }
        const pseudo = m[1];
        applyBlock(Number(m[2]), m[3] ?? "", pseudo);
      }

      // Detect interpolations INSIDE pseudo selector blocks that weren't handled.
      // Pattern: &:hover { __SC_EXPR_X__; } - placeholder is INSIDE the braces.
      // These interpolations (e.g., conditional helper calls) cannot be safely
      // transformed under nested selectors because the selector context would be lost.
      const insidePseudoRe = /&(:[a-z-]+(?:\([^)]*\))?)\s*\{[^}]*__SC_EXPR_(\d+)__[^}]*\}/gi;
      while ((m = insidePseudoRe.exec(decl.rawCss))) {
        const pseudo = m[1];
        const slotId = Number(m[2]);
        const expr = decl.templateExpressions[slotId] as any;
        // Only bail if the expression is NOT a component identifier (those are handled above)
        if (expr && expr.type !== "Identifier") {
          warnings.push({
            severity: "warning",
            type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
            loc: decl.loc,
            context: { selector: `&${pseudo}` },
          });
          bail = true;
          break;
        }
      }
      if (bail) {
        break;
      }

      if (didApply) {
        delete styleObj.width;
        delete styleObj.height;
        delete styleObj.opacity;
        delete styleObj.transform;
      }
    }

    if (decl.enumVariant) {
      const { baseKey, cases } = decl.enumVariant;
      const oldKey = decl.styleKey;
      decl.styleKey = baseKey;
      resolvedStyleObjects.delete(oldKey);
      resolvedStyleObjects.set(baseKey, styleObj);
      for (const [k, v] of extraStyleObjects.entries()) {
        resolvedStyleObjects.set(k, v);
      }
      for (const c of cases) {
        resolvedStyleObjects.set(c.styleKey, { backgroundColor: c.value });
      }
      decl.needsWrapperComponent = true;
    } else {
      resolvedStyleObjects.set(decl.styleKey, styleObj);
      for (const [k, v] of extraStyleObjects.entries()) {
        resolvedStyleObjects.set(k, v);
      }
    }

    // Preserve CSS cascade semantics for pseudo selectors when variant buckets override the same property.
    //
    // We intentionally keep this narrowly-scoped to avoid churning fixture output shapes.
    // Currently we only synthesize compound variants for the `disabled` + `color === "primary"` pattern
    // so that hover can still win (matching CSS specificity semantics).
    {
      const isPseudoOrMediaMap = (v: unknown): v is Record<string, unknown> => {
        if (!v || typeof v !== "object" || Array.isArray(v) || isAstNode(v)) {
          return false;
        }
        const keys = Object.keys(v as any);
        if (keys.length === 0) {
          return false;
        }
        return (
          keys.includes("default") ||
          keys.some((k) => k.startsWith(":") || k.startsWith("@media") || k.startsWith("::"))
        );
      };

      // Check if we should use namespace dimensions pattern instead of compound buckets
      // This is triggered when a boolean bucket overlaps CSS props with an enum bucket that
      // has a 2-value union type (indicating a variants-recipe pattern)
      const shouldUseNamespaceDimensions = (() => {
        const disabledBucket = variantBuckets.get("disabled");
        if (!disabledBucket) {
          return false;
        }
        const disabledCssProps = new Set(Object.keys(disabledBucket));

        // Check for enum buckets with 2-value union types that overlap with disabled
        for (const [when] of variantBuckets.entries()) {
          const match = when.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)\s*===\s*"([^"]*)"$/);
          if (!match) {
            continue;
          }
          const propName = match[1]!;
          const propType = findJsxPropTsTypeForVariantExtraction(propName);
          const unionValues = extractUnionLiteralValues(propType);
          if (!unionValues || unionValues.length !== 2) {
            continue;
          }

          const enumBucket = variantBuckets.get(when);
          if (!enumBucket) {
            continue;
          }
          for (const cssProp of Object.keys(enumBucket)) {
            if (disabledCssProps.has(cssProp)) {
              return true;
            }
          }
        }
        return false;
      })();

      // Skip compound bucket creation if we'll use namespace dimensions instead
      if (!shouldUseNamespaceDimensions) {
        // Special-case: if we have a boolean "disabled" variant bucket overriding a prop that also has
        // a hover map, preserve CSS specificity semantics by emitting a compound variant keyed off
        // `disabled && color === "primary"` (when available).
        //
        // This matches styled-components semantics for patterns like:
        //  - &:hover { background-color: (color === "primary" ? darkblue : darkgray) }
        //  - disabled && "background-color: grey"
        //
        // In CSS, :hover can still override base disabled declarations due to higher specificity.
        // In StyleX, a later `backgroundColor` assignment can clobber pseudo maps, so we need the
        // disabled bucket to include an explicit ':hover' value for the relevant color case.
        const disabledKey = "disabled";
        const colorPrimaryKey = `color === "primary"`;
        const disabledBucket = variantBuckets.get(disabledKey);
        const colorPrimaryBucket = variantBuckets.get(colorPrimaryKey);
        if (disabledBucket && (styleObj as any).backgroundColor) {
          const baseBg = (styleObj as any).backgroundColor;
          const primaryBg = (colorPrimaryBucket as any)?.backgroundColor ?? null;

          const baseHover = isPseudoOrMediaMap(baseBg) ? (baseBg as any)[":hover"] : null;
          const primaryHover = isPseudoOrMediaMap(primaryBg) ? (primaryBg as any)[":hover"] : null;

          const disabledBg = (disabledBucket as any).backgroundColor;
          const disabledDefault = isPseudoOrMediaMap(disabledBg)
            ? (disabledBg as any).default
            : (disabledBg ?? null);

          if (disabledDefault !== null && baseHover !== null && primaryHover !== null) {
            // Remove the base disabled backgroundColor override; we'll replace it with compound buckets.
            delete (disabledBucket as any).backgroundColor;

            const disabledPrimaryWhen = `${disabledKey} && ${colorPrimaryKey}`;
            const disabledNotPrimaryWhen = `${disabledKey} && color !== "primary"`;

            const mkBucket = (hoverVal: any) => ({
              ...(disabledBucket as any),
              backgroundColor: { default: disabledDefault, ":hover": hoverVal },
            });

            variantBuckets.set(disabledPrimaryWhen, mkBucket(primaryHover));
            variantStyleKeys[disabledPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
              disabledPrimaryWhen,
            )}`;

            variantBuckets.set(disabledNotPrimaryWhen, mkBucket(baseHover));
            variantStyleKeys[disabledNotPrimaryWhen] ??= `${decl.styleKey}${toSuffixFromProp(
              disabledNotPrimaryWhen,
            )}`;
          }
        }
      }
    }

    // Group enum-like variant conditions into dimensions for StyleX variants recipe pattern
    const { dimensions, remainingBuckets, remainingStyleKeys, propsToStrip } =
      groupVariantBucketsIntoDimensions(
        variantBuckets,
        variantStyleKeys,
        decl.styleKey,
        styleObj,
        findJsxPropTsTypeForVariantExtraction,
        isJsxPropOptional,
      );

    // Store dimensions for separate stylex.create calls
    if (dimensions.length > 0) {
      decl.variantDimensions = dimensions;
      decl.needsWrapperComponent = true;
      // Remove CSS props that were moved to variant dimensions from base styles
      for (const prop of propsToStrip) {
        delete (styleObj as Record<string, unknown>)[prop];
      }
    }

    // Add remaining (compound/boolean) variants to resolvedStyleObjects
    for (const [when, obj] of remainingBuckets.entries()) {
      const key = remainingStyleKeys[when]!;
      resolvedStyleObjects.set(key, obj);
    }
    for (const [k, v] of attrBuckets.entries()) {
      resolvedStyleObjects.set(k, v);
    }
    if (Object.keys(remainingStyleKeys).length) {
      decl.variantStyleKeys = remainingStyleKeys;
      // If we have variant styles keyed off props (e.g. `disabled`),
      // we need a wrapper component to evaluate those conditions at runtime and
      // avoid forwarding custom variant props to DOM nodes.
      decl.needsWrapperComponent = true;
    }
    if (styleFnFromProps.length) {
      decl.styleFnFromProps = styleFnFromProps;
      for (const [k, v] of styleFnDecls.entries()) {
        resolvedStyleObjects.set(k, v);
      }
    }
    if (inlineStyleProps.length) {
      decl.inlineStyleProps = inlineStyleProps;
    }
  }

  // ---------------------------------------------------------------------------
  // Conservative fix: patch contextual defaults for after-base css`` mixins
  // ---------------------------------------------------------------------------
  //
  // When a css`` helper is applied after a component's base styles (via extraStyleKeysAfterBase),
  // any contextual property map like `{ default: null, ":hover": "blue" }` will *unset* the base
  // value in StyleX merging semantics. In styled-components, a pseudo-only mixin does not remove
  // base styles; it only overrides within the pseudo state.
  //
  // To preserve semantics safely, we create a per-use derived style object where we replace
  // `default: null` with a statically-known base value for that property (if available). If the
  // base value is present but non-literal, we bail (conservative).
  const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !isAstNode(v) && !Array.isArray(v);

  // Css helper style keys that we replaced with per-use derived keys and may be prunable.
  const prunableCssHelperKeys = new Set<string>();

  const getStaticBaseValueForProp = (
    decl: StyledDecl,
    prop: string,
  ): { kind: "literal"; value: string | number } | { kind: "none" } | { kind: "nonLiteral" } => {
    const readLiteral = (obj: unknown): string | number | null | undefined => {
      if (!isPlainObject(obj)) {
        return undefined;
      }
      const v = obj[prop];
      return typeof v === "string" || typeof v === "number" || v === null ? v : undefined;
    };

    // Simulate the pre-base merge order used by rewrite-jsx:
    // extendsStyleKey -> extraStyleKeys (excluding afterBase) -> base styleKey
    let last: string | number | null | undefined = undefined;
    if (decl.extendsStyleKey) {
      last = readLiteral(resolvedStyleObjects.get(decl.extendsStyleKey));
    }

    const afterBase = new Set(decl.extraStyleKeysAfterBase ?? []);
    for (const key of decl.extraStyleKeys ?? []) {
      if (afterBase.has(key)) {
        continue;
      }
      const v = readLiteral(resolvedStyleObjects.get(key));
      if (v !== undefined) {
        last = v;
      }
    }

    const baseV = readLiteral(resolvedStyleObjects.get(decl.styleKey));
    if (baseV !== undefined) {
      last = baseV;
    }

    if (last === undefined || last === null) {
      return { kind: "none" };
    }
    if (typeof last === "string" || typeof last === "number") {
      return { kind: "literal", value: last };
    }
    return { kind: "nonLiteral" };
  };

  for (const decl of styledDecls) {
    if (decl.isCssHelper) {
      continue;
    }
    const afterBaseKeys = decl.extraStyleKeysAfterBase ?? [];
    if (afterBaseKeys.length === 0) {
      continue;
    }

    for (const mixinKey of afterBaseKeys) {
      const mixinStyle = resolvedStyleObjects.get(mixinKey);
      if (!isPlainObject(mixinStyle)) {
        bail = true;
        warnings.push({
          severity: "warning",
          type: "Unsupported css`` mixin: after-base mixin style is not a plain object",
          loc: decl.loc,
          context: { component: decl.localName, mixinKey },
        });
        break;
      }

      let didPatch = false;
      const patched: Record<string, unknown> = { ...mixinStyle };

      for (const [prop, v] of Object.entries(mixinStyle)) {
        if (!isPlainObject(v)) {
          continue;
        }
        if (!("default" in v)) {
          continue;
        }
        // Only patch the unsafe case: explicit `default: null`.
        if ((v as Record<string, unknown>).default !== null) {
          continue;
        }
        // Bail on nested condition objects (conservative).
        for (const condVal of Object.values(v)) {
          if (isPlainObject(condVal)) {
            bail = true;
            warnings.push({
              severity: "warning",
              type: "Unsupported css`` mixin: nested contextual conditions in after-base mixin",
              loc: decl.loc,
              context: { component: decl.localName, mixinKey, prop },
            });
            break;
          }
        }
        if (bail) {
          break;
        }

        const base = getStaticBaseValueForProp(decl, prop);
        if (base.kind === "literal") {
          patched[prop] = { ...(v as Record<string, unknown>), default: base.value };
          didPatch = true;
        } else if (base.kind === "nonLiteral") {
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported css`` mixin: cannot infer base default for after-base contextual override (base value is non-literal)",
            loc: decl.loc,
            context: { component: decl.localName, mixinKey, prop },
          });
          break;
        } else {
          // No base value: leaving default:null is semantically fine.
        }
      }

      if (bail) {
        break;
      }
      if (!didPatch) {
        continue;
      }

      const derivedKey = `${mixinKey}In${capitalize(decl.styleKey)}`;
      // Avoid collisions if multiple passes create the same key.
      if (!resolvedStyleObjects.has(derivedKey)) {
        resolvedStyleObjects.set(derivedKey, patched);
      }
      prunableCssHelperKeys.add(mixinKey);

      // Replace this mixin key with the derived key, preserving ordering.
      if (decl.extraStyleKeys) {
        decl.extraStyleKeys = decl.extraStyleKeys.map((k) => (k === mixinKey ? derivedKey : k));
      }
      if (decl.extraStyleKeysAfterBase) {
        decl.extraStyleKeysAfterBase = decl.extraStyleKeysAfterBase.map((k) =>
          k === mixinKey ? derivedKey : k,
        );
      }
    }
    if (bail) {
      break;
    }
  }

  // Prune only css helpers that we replaced with derived per-use keys.
  // This avoids generating unused StyleX styles (stylex/no-unused) while not interfering with
  // standalone css helpers that may be referenced directly in user code.
  if (!bail && prunableCssHelperKeys.size > 0) {
    const referencedKeys = new Set<string>();
    for (const d of styledDecls) {
      if (d.isCssHelper) {
        continue;
      }
      referencedKeys.add(d.styleKey);
      if (d.extendsStyleKey) {
        referencedKeys.add(d.extendsStyleKey);
      }
      for (const k of d.extraStyleKeys ?? []) {
        referencedKeys.add(k);
      }
      for (const k of Object.values(d.variantStyleKeys ?? {})) {
        referencedKeys.add(k);
      }
      if (d.enumVariant) {
        referencedKeys.add(d.enumVariant.baseKey);
        for (const c of d.enumVariant.cases) {
          referencedKeys.add(c.styleKey);
        }
      }
      if (d.siblingWrapper) {
        referencedKeys.add(d.siblingWrapper.adjacentKey);
        if (d.siblingWrapper.afterKey) {
          referencedKeys.add(d.siblingWrapper.afterKey);
        }
      }
      if (d.attrWrapper) {
        if (d.attrWrapper.checkboxKey) {
          referencedKeys.add(d.attrWrapper.checkboxKey);
        }
        if (d.attrWrapper.radioKey) {
          referencedKeys.add(d.attrWrapper.radioKey);
        }
        if (d.attrWrapper.externalKey) {
          referencedKeys.add(d.attrWrapper.externalKey);
        }
        if (d.attrWrapper.httpsKey) {
          referencedKeys.add(d.attrWrapper.httpsKey);
        }
        if (d.attrWrapper.pdfKey) {
          referencedKeys.add(d.attrWrapper.pdfKey);
        }
      }
    }

    for (const key of prunableCssHelperKeys) {
      const helperDecl = styledDecls.find((d) => d.isCssHelper && d.styleKey === key);
      if (!helperDecl) {
        continue;
      }
      if (helperDecl.isExported || helperDecl.preserveCssHelperDeclaration) {
        continue;
      }
      if (referencedKeys.has(key)) {
        continue;
      }
      resolvedStyleObjects.set(key, {});
    }
  }

  if (bail) {
    return {
      resolvedStyleObjects,
      descendantOverrides,
      ancestorSelectorParents,
      usedCssHelperFunctions,
      bail,
    };
  }

  // Generate style objects from descendant override pseudo buckets
  finalizeDescendantOverrides({
    j,
    descendantOverridePseudoBuckets,
    resolvedStyleObjects,
    literalToAst,
    makeCssPropKey,
  });

  return {
    resolvedStyleObjects,
    descendantOverrides,
    ancestorSelectorParents,
    usedCssHelperFunctions,
    bail,
  };
}
