import type { API, ASTNode, Collection, JSCodeshift } from "jscodeshift";
import { compile } from "stylis";
import { resolveDynamicNode } from "./builtin-handlers.js";
import type { InternalHandlerContext } from "./builtin-handlers.js";
import {
  cssDeclarationToStylexDeclarations,
  cssPropertyToStylexProp,
  resolveBackgroundStylexProp,
  resolveBackgroundStylexPropForVariants,
} from "./css-prop-mapping.js";
import {
  type AstPath,
  type IdentifierNode,
  extractRootAndPath,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isAstNode,
  isAstPath,
  isIdentifierNode,
  isCallExpressionNode,
  isFunctionNode,
  getDeclaratorId,
} from "./jscodeshift-utils.js";
import type { Adapter, ImportSource, ImportSpec } from "../adapter.js";
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
  countConditionalExpressions,
  hasThemeAccessInArrowFn,
  hasUnsupportedConditionalTest,
  inlineArrowFunctionBody,
  unwrapArrowFunctionToPropsExpr,
} from "./lower-rules/inline-styles.js";
import { addPropComments } from "./lower-rules/comments.js";
import { createCssHelperResolver } from "./lower-rules/css-helper.js";
import { parseSwitchReturningCssTemplates } from "./lower-rules/switch-variants.js";
import { createThemeResolvers } from "./lower-rules/theme.js";
import {
  resolveTemplateLiteralBranch,
  resolveTemplateLiteralValue,
} from "./lower-rules/template-literals.js";
import {
  extractUnionLiteralValues,
  groupVariantBucketsIntoDimensions,
} from "./lower-rules/variants.js";
import { mergeStyleObjects, toKebab } from "./lower-rules/utils.js";
import { normalizeStylisAstToIR } from "./css-ir.js";
import {
  normalizeSelectorForInputAttributePseudos,
  normalizeInterpolatedSelector,
  parseSelector,
} from "./selectors.js";
import type { StyledDecl } from "./transform-types.js";
import type { WarningLog, WarningType } from "./logger.js";
import type { CssHelperFunction, CssHelperObjectMembers } from "./transform/css-helpers.js";

export type DescendantOverride = {
  parentStyleKey: string;
  childStyleKey: string;
  overrideStyleKey: string;
};

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

/**
 * Type for variant test condition info
 */
type TestInfo = { when: string; propName: string };

/**
 * Inverts a "when" condition string for the opposite variant branch.
 * E.g., "!$active" -> "$active", "$x === true" -> "$x !== true"
 */
function invertWhen(when: string): string | null {
  if (when.startsWith("!")) {
    return when.slice(1);
  }
  const match = when.match(/^(.+)\s+(===|!==)\s+(.+)$/);
  if (match) {
    const [, propName, op, rhs] = match;
    const invOp = op === "===" ? "!==" : "===";
    return `${propName} ${invOp} ${rhs}`;
  }
  if (!when.includes(" ")) {
    return `!${when}`;
  }
  return null;
}

export function lowerRules(args: {
  api: API;
  j: JSCodeshift;
  root: Collection<ASTNode>;
  filePath: string;
  resolveValue: Adapter["resolveValue"];
  resolveCall: Adapter["resolveCall"];
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

  const computeDeclBasePropValues = (decl: StyledDecl): Map<string, unknown> => {
    const propValues = new Map<string, unknown>();
    for (const rule of decl.rules) {
      // Only process top-level rules (selector "&") for base values
      if (rule.selector.trim() !== "&") {
        continue;
      }
      for (const d of rule.declarations) {
        if (d.property && d.value.kind === "static") {
          const stylexDecls = cssDeclarationToStylexDeclarations(d);
          for (const sd of stylexDecls) {
            if (sd.value.kind === "static") {
              propValues.set(sd.prop, cssValueToJs(sd.value, d.important, sd.prop));
            }
          }
        } else if (d.property && d.value.kind === "interpolated") {
          const stylexDecls = cssDeclarationToStylexDeclarations(d);
          for (const sd of stylexDecls) {
            // Store a marker that this property comes from a composed style source
            // but its value is dynamic (resolved later).
            propValues.set(sd.prop, { __cssHelperDynamicValue: true, decl, declaration: d });
          }
        }
      }
    }
    return propValues;
  };

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

  const staticPropertyOwners = new Set<string>();
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
        left?: { object?: { name?: string } };
      };
      const ownerName = expr.left?.object?.name;
      if (ownerName) {
        staticPropertyOwners.add(ownerName);
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

  const shadowedIdentCache = new WeakMap<object, boolean>();
  const isLoopNode = (node: unknown): boolean => {
    if (!node || typeof node !== "object") {
      return false;
    }
    const type = (node as { type?: string }).type;
    return type === "ForStatement" || type === "ForInStatement" || type === "ForOfStatement";
  };
  const collectPatternIdentifiers = (pattern: any, out: Set<string>): void => {
    if (!pattern || typeof pattern !== "object") {
      return;
    }
    switch (pattern.type) {
      case "Identifier":
        out.add(pattern.name);
        return;
      case "RestElement":
        collectPatternIdentifiers(pattern.argument, out);
        return;
      case "AssignmentPattern":
        collectPatternIdentifiers(pattern.left, out);
        return;
      case "ObjectPattern":
        for (const prop of pattern.properties ?? []) {
          if (!prop) {
            continue;
          }
          if (prop.type === "RestElement") {
            collectPatternIdentifiers(prop.argument, out);
          } else {
            collectPatternIdentifiers(prop.value ?? prop.argument, out);
          }
        }
        return;
      case "ArrayPattern":
        for (const elem of pattern.elements ?? []) {
          collectPatternIdentifiers(elem, out);
        }
        return;
      case "TSParameterProperty":
        collectPatternIdentifiers(pattern.parameter, out);
        return;
      default:
        return;
    }
  };
  // Use the consolidated member expression extraction utility
  const getRootIdentifierInfo = extractRootAndPath;
  const findIdentifierPath = (identNode: unknown): AstPath | null => {
    if (!identNode || typeof identNode !== "object") {
      return null;
    }
    const paths = root
      .find(j.Identifier)
      .filter((p) => p.node === identNode)
      .paths();
    const first = paths[0] ?? null;
    return first && isAstPath(first) ? first : null;
  };
  const getNearestFunctionNode = (path: AstPath | null): ASTNode | null => {
    let cur: AstPath | null | undefined = path;
    while (cur) {
      if (isFunctionNode(cur.node)) {
        return cur.node;
      }
      cur = cur.parentPath ?? null;
    }
    return null;
  };
  const functionHasVarBinding = (fn: any, name: string): boolean => {
    const body = fn?.body;
    if (!body || typeof body !== "object") {
      return false;
    }
    let found = false;
    j(body)
      .find(j.VariableDeclaration, { kind: "var" })
      .forEach((p) => {
        if (found) {
          return;
        }
        const nearestFn = getNearestFunctionNode(p);
        if (nearestFn !== fn) {
          return;
        }
        for (const decl of p.node.declarations ?? []) {
          const ids = new Set<string>();
          const declId = getDeclaratorId(decl);
          if (!declId) {
            continue;
          }
          collectPatternIdentifiers(declId, ids);
          if (ids.has(name)) {
            found = true;
            return;
          }
        }
      });
    return found;
  };
  const blockDeclaresName = (block: any, name: string): boolean => {
    const body = block?.body ?? [];
    for (const stmt of body) {
      if (!stmt || typeof stmt !== "object") {
        continue;
      }
      if (stmt.type === "VariableDeclaration" && (stmt.kind === "let" || stmt.kind === "const")) {
        for (const decl of stmt.declarations ?? []) {
          const ids = new Set<string>();
          collectPatternIdentifiers(decl.id, ids);
          if (ids.has(name)) {
            return true;
          }
        }
      } else if (stmt.type === "FunctionDeclaration" || stmt.type === "ClassDeclaration") {
        if (stmt.id?.type === "Identifier" && stmt.id.name === name) {
          return true;
        }
      }
    }
    return false;
  };
  const functionDeclaresName = (fn: any, name: string): boolean => {
    if (fn?.id?.type === "Identifier" && fn.id.name === name) {
      return true;
    }
    for (const param of fn?.params ?? []) {
      const ids = new Set<string>();
      collectPatternIdentifiers(param, ids);
      if (ids.has(name)) {
        return true;
      }
    }
    return functionHasVarBinding(fn, name);
  };
  const loopDeclaresName = (node: any, name: string): boolean => {
    const init = node?.init ?? node?.left;
    if (!init || typeof init !== "object") {
      return false;
    }
    if (init.type === "VariableDeclaration" && (init.kind === "let" || init.kind === "const")) {
      for (const decl of init.declarations ?? []) {
        const ids = new Set<string>();
        collectPatternIdentifiers(decl.id, ids);
        if (ids.has(name)) {
          return true;
        }
      }
    }
    return false;
  };
  const isIdentifierShadowed = (identNode: any, name: string): boolean => {
    if (!identNode || typeof identNode !== "object") {
      return true;
    }
    const cached = shadowedIdentCache.get(identNode);
    if (cached !== undefined) {
      return cached;
    }
    const path = findIdentifierPath(identNode);
    if (!path) {
      // If the identifier isn't in the root AST (e.g. synthetic nodes), we can't prove shadowing.
      // Treat as not shadowed so adapter-driven resolution can still apply.
      shadowedIdentCache.set(identNode, false);
      return false;
    }
    let cur: any = path;
    while (cur) {
      const node = cur.node;
      if (isFunctionNode(node) && functionDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      if (node?.type === "BlockStatement" && blockDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      if (node?.type === "CatchClause") {
        const ids = new Set<string>();
        collectPatternIdentifiers(node.param, ids);
        if (ids.has(name)) {
          shadowedIdentCache.set(identNode, true);
          return true;
        }
      }
      if (isLoopNode(node) && loopDeclaresName(node, name)) {
        shadowedIdentCache.set(identNode, true);
        return true;
      }
      cur = cur.parentPath;
    }
    shadowedIdentCache.set(identNode, false);
    return false;
  };
  const getCallCalleeIdentifier = (expr: unknown, localName: string): IdentifierNode | null => {
    if (!isCallExpressionNode(expr)) {
      return null;
    }
    const callee = expr.callee;
    if (isIdentifierNode(callee) && callee.name === localName) {
      return callee;
    }
    if (isCallExpressionNode(callee)) {
      const innerCallee = callee.callee;
      if (isIdentifierNode(innerCallee) && innerCallee.name === localName) {
        return innerCallee;
      }
    }
    return null;
  };
  const resolveImportForIdent = (localName: string, identNode?: object | null) => {
    if (identNode && isIdentifierShadowed(identNode, localName)) {
      return null;
    }
    const v = importMap.get(localName);
    return v ? v : null;
  };
  const resolveImportForExpr = (expr: unknown, localName: string) => {
    const calleeIdent = getCallCalleeIdentifier(expr, localName);
    if (!calleeIdent) {
      return null;
    }
    return resolveImportForIdent(localName, calleeIdent);
  };
  const resolveImportInScope = (localName: string, identNode?: unknown) => {
    if (identNode && typeof identNode === "object") {
      return resolveImportForIdent(localName, identNode);
    }
    return resolveImportForIdent(localName, null);
  };

  const isValidIdentifierName = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);

  const buildSafeIndexedParamName = (
    preferred: string,
    containerExpr: ExpressionKind | null,
  ): string => {
    if (!isValidIdentifierName(preferred)) {
      return "propValue";
    }
    if (
      containerExpr?.type === "Identifier" &&
      (containerExpr as { name?: string }).name === preferred
    ) {
      return `${preferred}Value`;
    }
    return preferred;
  };

  for (const decl of styledDecls) {
    if (decl.preResolvedStyle) {
      resolvedStyleObjects.set(decl.styleKey, decl.preResolvedStyle);
      if (decl.preResolvedFnDecls) {
        for (const [k, v] of Object.entries(decl.preResolvedFnDecls)) {
          resolvedStyleObjects.set(k, v as any);
        }
      }
      continue;
    }

    const styleObj: Record<string, unknown> = {};
    const perPropPseudo: Record<string, Record<string, unknown>> = {};
    const perPropMedia: Record<string, Record<string, unknown>> = {};
    const nestedSelectors: Record<string, Record<string, unknown>> = {};
    const variantBuckets = new Map<string, Record<string, unknown>>();
    const variantStyleKeys: Record<string, string> = {};
    const extraStyleObjects = new Map<string, Record<string, unknown>>();
    const styleFnFromProps: Array<{
      fnKey: string;
      jsxProp: string;
      condition?: "truthy";
      conditionWhen?: string;
      callArg?: ExpressionKind;
    }> = [];
    const styleFnDecls = new Map<string, any>();
    const attrBuckets = new Map<string, Record<string, unknown>>();
    const inlineStyleProps: Array<{ prop: string; expr: ExpressionKind }> = [];
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

    // Shared helper to apply a style variant for a given test condition
    const applyVariant = (testInfo: TestInfo, consStyle: Record<string, unknown>): void => {
      const when = testInfo.when;
      const existingBucket = variantBuckets.get(when);
      const nextBucket = existingBucket ? { ...existingBucket } : {};
      mergeStyleObjects(nextBucket, consStyle);
      variantBuckets.set(when, nextBucket);
      variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
      if (testInfo.propName && !testInfo.propName.startsWith("$")) {
        ensureShouldForwardPropDrop(decl, testInfo.propName);
      }
    };

    // Factory to create prop test helpers given the arrow function parameter name
    const createPropTestHelpers = (
      paramName: string,
    ): {
      readPropName: (node: ExpressionKind) => string | null;
      parseTestInfo: (test: ExpressionKind) => TestInfo | null;
    } => {
      const readPropName = (node: ExpressionKind): string | null => {
        const path = getMemberPathFromIdentifier(node, paramName);
        if (!path || path.length !== 1) {
          return null;
        }
        return path[0]!;
      };

      const parseTestInfo = (test: ExpressionKind): TestInfo | null => {
        if (!test || typeof test !== "object") {
          return null;
        }
        if (test.type === "MemberExpression" || test.type === "OptionalMemberExpression") {
          const propName = readPropName(test);
          return propName ? { when: propName, propName } : null;
        }
        if (test.type === "UnaryExpression" && test.operator === "!" && test.argument) {
          const propName = readPropName(test.argument as ExpressionKind);
          return propName ? { when: `!${propName}`, propName } : null;
        }
        if (
          test.type === "BinaryExpression" &&
          (test.operator === "===" || test.operator === "!==")
        ) {
          const left = test.left;
          if (left.type === "MemberExpression" || left.type === "OptionalMemberExpression") {
            const propName = readPropName(left);
            const rhs = literalToStaticValue(test.right);
            if (!propName || rhs === null) {
              return null;
            }
            const rhsValue = JSON.stringify(rhs);
            return { when: `${propName} ${test.operator} ${rhsValue}`, propName };
          }
        }
        return null;
      };

      return { readPropName, parseTestInfo };
    };

    // Build reusable handler context for resolveDynamicNode calls
    const handlerContext: InternalHandlerContext = {
      api,
      filePath,
      resolveValue,
      resolveCall,
      resolveImport: resolveImportInScope,
    };

    // Build component info for resolveDynamicNode calls
    const componentInfo =
      decl.base.kind === "intrinsic"
        ? { localName: decl.localName, base: "intrinsic" as const, tagOrIdent: decl.base.tagName }
        : { localName: decl.localName, base: "component" as const, tagOrIdent: decl.base.ident };

    // (helpers imported from `./lower-rules/*`)

    // (animation + interpolated-string helpers extracted to `./lower-rules/*`)

    const tryHandleMappedFunctionColor = (d: any): boolean => {
      // Handle: background: ${(props) => getColor(props.variant)}
      // when `getColor` is a simple conditional mapping function.
      if ((d.property ?? "").trim() !== "background") {
        return false;
      }
      if (d.value.kind !== "interpolated") {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      const body = expr.body as any;
      if (!body || body.type !== "CallExpression") {
        return false;
      }
      if (body.callee?.type !== "Identifier") {
        return false;
      }
      const fnName = body.callee.name;
      const mapping = stringMappingFns.get(fnName);
      if (!mapping) {
        return false;
      }
      const arg0 = body.arguments?.[0];
      if (!arg0 || arg0.type !== "MemberExpression") {
        return false;
      }
      const path = getMemberPathFromIdentifier(arg0 as any, paramName);
      if (!path || path.length !== 1) {
        return false;
      }
      const propName = path[0]!;

      // Convert this component into a wrapper so we don't forward `variant` to DOM.
      decl.needsWrapperComponent = true;

      // Build style keys for the variant mapping.
      // Use stable keys based on the component style key.
      const baseKey = decl.styleKey.endsWith("Base") ? decl.styleKey : `${decl.styleKey}Base`;
      const primaryKey = `${decl.styleKey}Primary`;
      const secondaryKey = `${decl.styleKey}Secondary`;

      // Ensure the base style object doesn't get a static background.
      // The wrapper will apply the background via variants.
      delete styleObj.backgroundColor;

      decl.enumVariant = {
        propName,
        baseKey,
        cases: [
          {
            kind: "eq",
            whenValue: mapping.whenValue,
            styleKey: primaryKey,
            value: mapping.thenValue,
          },
          {
            kind: "neq",
            whenValue: mapping.whenValue,
            styleKey: secondaryKey,
            value: mapping.elseValue,
          },
        ],
      };

      return true;
    };

    const tryHandleLogicalOrDefault = (d: any): boolean => {
      // Handle: background: ${(p) => p.color || "#BF4F74"}
      //         padding: ${(p) => p.$padding || "16px"}
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
        return false;
      }
      const slot = d.value.parts.find((p: any) => p.kind === "slot");
      if (!slot) {
        return false;
      }
      const expr = decl.templateExpressions[slot.slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      if (
        expr.body?.type !== "LogicalExpression" ||
        (expr.body.operator !== "||" && expr.body.operator !== "??") ||
        expr.body.left?.type !== "MemberExpression"
      ) {
        return false;
      }
      const left = expr.body.left as any;
      if (left.object?.type !== "Identifier" || left.object.name !== paramName) {
        return false;
      }
      if (left.property?.type !== "Identifier") {
        return false;
      }
      const jsxProp = left.property.name;
      const right = expr.body.right as any;
      const fallback =
        right?.type === "StringLiteral" || right?.type === "Literal"
          ? right.value
          : right?.type === "NumericLiteral"
            ? right.value
            : null;
      if (fallback === null) {
        return false;
      }

      // Default value into base style, plus a style function applied when prop is provided.
      for (const out of cssDeclarationToStylexDeclarations(d)) {
        const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
        styleObj[out.prop] = fallback;
        styleFnFromProps.push({ fnKey, jsxProp });
        if (!styleFnDecls.has(fnKey)) {
          const param = j.identifier(out.prop);
          annotateParamFromJsxProp(param, jsxProp);
          const p = j.property("init", j.identifier(out.prop), j.identifier(out.prop)) as any;
          p.shorthand = true;
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], j.objectExpression([p])));
        }
      }
      return true;
    };

    const tryHandleConditionalPropCoalesceWithTheme = (d: any): boolean => {
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
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
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }
      const body = expr.body as any;
      if (!body || body.type !== "ConditionalExpression") {
        return false;
      }

      const testPath = getMemberPathFromIdentifier(body.test as any, paramName);
      if (!testPath || testPath.length !== 1) {
        return false;
      }
      const conditionProp = testPath[0]!;

      const resolveThemeAst = (node: any): ExpressionKind | null => {
        if (hasLocalThemeBinding) {
          return null;
        }
        const path = getMemberPathFromIdentifier(node as any, paramName);
        if (!path || path[0] !== "theme") {
          return null;
        }
        const themePath = path.slice(1).join(".");
        if (!themePath) {
          return null;
        }
        const resolved = resolveValue({ kind: "theme", path: themePath, filePath });
        if (!resolved) {
          return null;
        }
        for (const imp of resolved.imports ?? []) {
          resolverImports.set(JSON.stringify(imp), imp);
        }
        const exprAst = parseExpr(resolved.expr);
        return (exprAst as ExpressionKind) ?? null;
      };

      const readPropAccess = (node: any): string | null => {
        const path = getMemberPathFromIdentifier(node as any, paramName);
        if (!path || path.length !== 1) {
          return null;
        }
        return path[0]!;
      };

      type NullishBranch = { propName: string; fallback: ExpressionKind };
      const parseNullishBranch = (node: any): NullishBranch | null => {
        if (!node || node.type !== "LogicalExpression" || node.operator !== "??") {
          return null;
        }
        const propName = readPropAccess(node.left);
        if (!propName) {
          return null;
        }
        const fallback = resolveThemeAst(node.right);
        if (!fallback) {
          return null;
        }
        return { propName, fallback };
      };

      const consNullish = parseNullishBranch(body.consequent);
      const altNullish = parseNullishBranch(body.alternate);
      const consTheme = resolveThemeAst(body.consequent);
      const altTheme = resolveThemeAst(body.alternate);

      const buildPropAccess = (prop: string): ExpressionKind => {
        const isIdent = /^[$A-Z_][0-9A-Z_$]*$/i.test(prop);
        return isIdent
          ? (j.memberExpression(j.identifier("props"), j.identifier(prop)) as ExpressionKind)
          : (j.memberExpression(j.identifier("props"), j.literal(prop), true) as ExpressionKind);
      };

      let nullishPropName: string | null = null;
      let baseTheme: ExpressionKind | null = null;
      let fallbackTheme: ExpressionKind | null = null;
      let conditionWhen: string | null = null;
      if (consNullish && altTheme) {
        baseTheme = altTheme;
        fallbackTheme = consNullish.fallback;
        nullishPropName = consNullish.propName;
        conditionWhen = conditionProp;
      } else if (altNullish && consTheme) {
        baseTheme = consTheme;
        fallbackTheme = altNullish.fallback;
        nullishPropName = altNullish.propName;
        conditionWhen = `!${conditionProp}`;
      } else {
        return false;
      }

      if (!baseTheme || !fallbackTheme || !nullishPropName || !conditionWhen) {
        return false;
      }

      const outs = cssDeclarationToStylexDeclarations(d);
      for (const out of outs) {
        (styleObj as any)[out.prop] = baseTheme as any;
        const baseFnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
        let fnKey = baseFnKey;
        if (styleFnDecls.has(fnKey)) {
          let idx = 1;
          while (styleFnDecls.has(`${baseFnKey}Alt${idx}`)) {
            idx += 1;
          }
          fnKey = `${baseFnKey}Alt${idx}`;
        }
        if (!styleFnDecls.has(fnKey)) {
          const param = j.identifier(out.prop);
          const valueId = j.identifier(out.prop);
          annotateParamFromJsxProp(param, nullishPropName);
          const bodyExpr = j.objectExpression([
            j.property("init", j.identifier(out.prop), valueId as any),
          ]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
        }
        if (!styleFnFromProps.some((p) => p.fnKey === fnKey)) {
          const isIdent = /^[$A-Z_][0-9A-Z_$]*$/i.test(nullishPropName);
          const baseArg = isIdent
            ? (j.identifier(nullishPropName) as ExpressionKind)
            : buildPropAccess(nullishPropName);
          const callArg = j.logicalExpression("??", baseArg, fallbackTheme) as ExpressionKind;
          styleFnFromProps.push({
            fnKey,
            jsxProp: conditionProp,
            conditionWhen,
            callArg: callArg as any,
          });
        }
      }

      ensureShouldForwardPropDrop(decl, conditionProp);
      ensureShouldForwardPropDrop(decl, nullishPropName);
      decl.needsWrapperComponent = true;
      return true;
    };

    const resolveStaticCssBlock = (rawCss: string): Record<string, unknown> | null => {
      const wrappedRawCss = `& { ${rawCss} }`;
      const stylisAst = compile(wrappedRawCss);
      const rules = normalizeStylisAstToIR(stylisAst as any, [], {
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
      const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
      if (!paramName) {
        return false;
      }

      const { parseTestInfo } = createPropTestHelpers(paramName);

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

      // Handle LogicalExpression: props.$x && css`...`
      const body = expr.body;
      if (body?.type === "LogicalExpression" && body.operator === "&&") {
        const testInfo = parseTestInfo(body.left as ExpressionKind);
        if (!testInfo) {
          return false;
        }
        if (isCssHelperTaggedTemplate(body.right)) {
          const cssNode = body.right as { quasi: ExpressionKind };
          const resolved = resolveCssHelperTemplate(
            cssNode.quasi,
            paramName,
            decl.localName,
            decl.loc,
          );
          if (!resolved) {
            return false;
          }
          const { style: consStyle, dynamicProps } = resolved;

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
                const param = j.identifier(dyn.stylexProp);
                annotateParamFromJsxProp(param, dyn.jsxProp);
                const valueId = j.identifier(dyn.stylexProp);
                const p = j.property("init", valueId, valueId) as any;
                p.shorthand = true;
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

        // Handle TemplateLiteral without expressions: props.$x && `width: 10px;`
        if (body.right?.type === "TemplateLiteral") {
          const tpl = body.right as {
            expressions?: unknown[];
            quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
          };
          // Only support static template literals (no interpolations)
          if (tpl.expressions && tpl.expressions.length > 0) {
            return false;
          }
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

      // Handle ConditionalExpression: props.$x ? css`...` : css`...`
      if (body?.type !== "ConditionalExpression") {
        return false;
      }

      const testInfo = parseTestInfo(body.test as ExpressionKind);
      if (!testInfo) {
        return false;
      }

      const cons = body.consequent;
      const alt = body.alternate;
      const consIsCss = isCssHelperTaggedTemplate(cons);
      const altIsCss = isCssHelperTaggedTemplate(alt);
      const consIsTpl = isPlainTemplateLiteral(cons);
      const altIsTpl = isPlainTemplateLiteral(alt);
      const consIsEmpty = isEmptyCssBranch(cons);
      const altIsEmpty = isEmptyCssBranch(alt);

      if (!(consIsCss || altIsCss || consIsTpl || altIsTpl)) {
        return false;
      }

      const resolveCssBranch = (
        node: any,
      ): {
        style: Record<string, unknown>;
        dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
      } | null => {
        if (!isCssHelperTaggedTemplate(node)) {
          return null;
        }
        const tplNode = node as { quasi: ExpressionKind };
        return resolveCssHelperTemplate(tplNode.quasi, paramName, decl.localName, decl.loc);
      };

      if (consIsCss && altIsCss) {
        const consResolved = resolveCssBranch(cons);
        const altResolved = resolveCssBranch(alt);
        if (!consResolved || !altResolved) {
          return false;
        }
        if (consResolved.dynamicProps.length > 0 || altResolved.dynamicProps.length > 0) {
          return false;
        }
        mergeStyleObjects(styleObj, altResolved.style);
        applyVariant(testInfo, consResolved.style);
        return true;
      }

      if (consIsCss && altIsEmpty) {
        const consResolved = resolveCssBranch(cons);
        if (!consResolved || consResolved.dynamicProps.length > 0) {
          return false;
        }
        applyVariant(testInfo, consResolved.style);
        return true;
      }

      if (consIsEmpty && altIsCss) {
        const altResolved = resolveCssBranch(alt);
        if (!altResolved || altResolved.dynamicProps.length > 0) {
          return false;
        }
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          return false;
        }
        applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
        return true;
      }

      const applyDynamicEntries = (
        entries: Array<{ jsxProp: string; stylexProp: string; callArg: ExpressionKind }>,
        conditionWhen: string,
      ): boolean => {
        for (const entry of entries) {
          const fnKey = `${decl.styleKey}${toSuffixFromProp(entry.stylexProp)}`;
          if (!styleFnDecls.has(fnKey)) {
            const param = j.identifier(entry.stylexProp);
            const valueId = j.identifier(entry.stylexProp);
            annotateParamFromJsxProp(param, entry.jsxProp);
            const p = j.property("init", valueId, valueId) as any;
            p.shorthand = true;
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
        return true;
      };

      if (consIsTpl && altIsTpl) {
        if (testInfo.propName) {
          ensureShouldForwardPropDrop(decl, testInfo.propName);
        }
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
        return true;
      }

      if (consIsTpl && altIsEmpty) {
        if (testInfo.propName) {
          ensureShouldForwardPropDrop(decl, testInfo.propName);
        }
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
        return true;
      }

      if (consIsEmpty && altIsTpl) {
        if (testInfo.propName) {
          ensureShouldForwardPropDrop(decl, testInfo.propName);
        }
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
        return true;
      }

      return false;
    };

    // Handle property-level ternary with template literal branches containing helper calls:
    //   background: ${(props) => props.$faded
    //     ? `linear-gradient(..., ${color("bgBorder")(props)} ...)`
    //     : `linear-gradient(..., ${color("bgBorder")(props)} ...)`}
    //
    // When both branches are template literals that can be fully resolved via the adapter,
    // emit StyleX variants for each branch.
    const tryHandlePropertyTernaryTemplateLiteral = (d: any): boolean => {
      if (d.value.kind !== "interpolated") {
        return false;
      }
      if (!d.property) {
        return false;
      }
      const parts = d.value.parts ?? [];
      const slotPart = parts.find((p: any) => p.kind === "slot");
      if (!slotPart || slotPart.kind !== "slot") {
        return false;
      }
      const slotId = slotPart.slotId;
      const expr = decl.templateExpressions[slotId] as any;
      if (!expr || expr.type !== "ArrowFunctionExpression") {
        return false;
      }
      const paramName =
        expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
      if (!paramName) {
        return false;
      }
      const body = expr.body as any;
      if (!body || body.type !== "ConditionalExpression") {
        return false;
      }

      const { parseTestInfo } = createPropTestHelpers(paramName);
      const testInfo = parseTestInfo(body.test as ExpressionKind);
      if (!testInfo) {
        return false;
      }

      const cons = body.consequent;
      const alt = body.alternate;
      if (cons?.type !== "TemplateLiteral" || alt?.type !== "TemplateLiteral") {
        return false;
      }

      const consValue = resolveTemplateLiteralValue({
        j,
        tpl: cons as any,
        property: d.property,
        filePath,
        parseExpr,
        resolveCall,
        resolveImportInScope,
        resolverImports,
        componentInfo,
        handlerContext,
      });
      const altValue = resolveTemplateLiteralValue({
        j,
        tpl: alt as any,
        property: d.property,
        filePath,
        parseExpr,
        resolveCall,
        resolveImportInScope,
        resolverImports,
        componentInfo,
        handlerContext,
      });

      if (!consValue || !altValue) {
        return false;
      }

      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }

      // Extract raw value from the template literal for property mapping
      // (e.g., to detect gradients in "background" property)
      const altQuasis = (alt.quasis ?? []) as Array<{ value?: { raw?: string; cooked?: string } }>;
      const valueRawFromTemplate = altQuasis.map((q) => q.value?.raw ?? "").join("");

      // Get the StyleX property name for this CSS property
      const stylexProps = cssDeclarationToStylexDeclarations({
        property: d.property,
        value: { kind: "static", value: valueRawFromTemplate },
        valueRaw: valueRawFromTemplate,
        important: false,
      });
      if (stylexProps.length === 0) {
        return false;
      }
      const stylexProp = stylexProps[0]!.prop;

      // Add the "false" branch value to the base style
      styleObj[stylexProp] = altValue;

      // Add the "true" branch value as a variant
      applyVariant(testInfo, { [stylexProp]: consValue });

      if (testInfo.propName) {
        ensureShouldForwardPropDrop(decl, testInfo.propName);
      }

      return true;
    };

    const tryHandleCssHelperFunctionSwitchBlock = (d: any): boolean => {
      // Handle: ${(props) => helper(props.appearance)}
      // where `helper` is: const helper = (appearance) => css`... ${() => { switch(appearance) { ... return css`...` }}} ...`
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
      const propsParam = expr.params?.[0];
      if (!propsParam || propsParam.type !== "Identifier") {
        return false;
      }
      const propsParamName = propsParam.name;
      const body = expr.body as any;
      if (!body || body.type !== "CallExpression") {
        return false;
      }
      if (body.callee?.type !== "Identifier") {
        return false;
      }
      const helperName = body.callee.name as string;
      const helperFn = cssHelperFunctions.get(helperName);
      if (!helperFn) {
        return false;
      }
      const arg0 = body.arguments?.[0];
      const propPath = getMemberPathFromIdentifier(arg0 as any, propsParamName);
      if (!propPath || propPath.length !== 1) {
        return false;
      }
      const jsxProp = propPath[0]!;

      // Extract base styles and a single switch interpolation from the helper template.
      const baseFromHelper: Record<string, unknown> = {};
      let sawSwitch = false;

      for (const rule of helperFn.rules) {
        if (rule.atRuleStack.length > 0) {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "at-rule-in-helper" },
          });
          bail = true;
          return true;
        }
        if ((rule.selector ?? "").trim() !== "&") {
          warnings.push({
            severity: "warning",
            type: "`css` helper function switch must return css templates in all branches",
            loc: helperFn.loc ?? decl.loc,
            context: { reason: "nested-selector-in-helper", selector: rule.selector },
          });
          bail = true;
          return true;
        }
        for (const hd of rule.declarations) {
          if (hd.property) {
            if (hd.value.kind !== "static") {
              warnings.push({
                severity: "warning",
                type: "`css` helper function switch must return css templates in all branches",
                loc: helperFn.loc ?? decl.loc,
                context: { reason: "dynamic-decl-in-helper", property: hd.property },
              });
              bail = true;
              return true;
            }
            for (const out of cssDeclarationToStylexDeclarations(hd)) {
              (baseFromHelper as any)[out.prop] = cssValueToJs(out.value, hd.important, out.prop);
            }
            continue;
          }

          // Expect exactly one switch interpolation.
          if (hd.value.kind !== "interpolated") {
            continue;
          }
          const hparts = (hd.value as any).parts ?? [];
          if (hparts.length !== 1 || hparts[0]?.kind !== "slot") {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "unsupported-interpolation-shape" },
            });
            bail = true;
            return true;
          }
          if (sawSwitch) {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "multiple-switch-interpolations" },
            });
            bail = true;
            return true;
          }
          const hslotId = hparts[0].slotId;
          const hexpr = helperFn.templateExpressions[hslotId] as any;
          if (!hexpr || hexpr.type !== "ArrowFunctionExpression") {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "switch-interpolation-not-arrow" },
            });
            bail = true;
            return true;
          }
          if ((hexpr.params ?? []).length !== 0) {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "switch-iife-has-params" },
            });
            bail = true;
            return true;
          }
          const hbody = hexpr.body as any;
          if (!hbody || hbody.type !== "BlockStatement") {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "switch-iife-not-block" },
            });
            bail = true;
            return true;
          }
          const stmts = hbody.body ?? [];
          if (!Array.isArray(stmts) || stmts.length !== 1 || stmts[0]?.type !== "SwitchStatement") {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "switch-iife-not-single-switch" },
            });
            bail = true;
            return true;
          }

          const parsed = parseSwitchReturningCssTemplates({
            switchStmt: stmts[0],
            expectedDiscriminantIdent: helperFn.paramName,
            isCssHelperTaggedTemplate,
            warnings,
            loc: helperFn.loc ?? decl.loc,
          });
          if (!parsed) {
            bail = true;
            return true;
          }

          const defaultResolved = resolveCssHelperTemplate(
            parsed.defaultCssTemplate.quasi,
            null,
            decl.localName,
            helperFn.loc ?? decl.loc,
          );
          if (!defaultResolved || defaultResolved.dynamicProps.length > 0) {
            warnings.push({
              severity: "warning",
              type: "`css` helper function switch must return css templates in all branches",
              loc: helperFn.loc ?? decl.loc,
              context: { reason: "default-css-not-resolvable" },
            });
            bail = true;
            return true;
          }
          mergeStyleObjects(baseFromHelper, defaultResolved.style);

          for (const [caseValue, tpl] of parsed.caseCssTemplates.entries()) {
            const res = resolveCssHelperTemplate(
              tpl.quasi,
              null,
              decl.localName,
              helperFn.loc ?? decl.loc,
            );
            if (!res || res.dynamicProps.length > 0) {
              warnings.push({
                severity: "warning",
                type: "`css` helper function switch must return css templates in all branches",
                loc: helperFn.loc ?? decl.loc,
                context: { reason: "case-css-not-resolvable", caseValue },
              });
              bail = true;
              return true;
            }
            const when = `${jsxProp} === ${JSON.stringify(caseValue)}`;
            const existingBucket = variantBuckets.get(when);
            const nextBucket = existingBucket ? { ...existingBucket } : {};
            mergeStyleObjects(nextBucket, res.style);
            variantBuckets.set(when, nextBucket);
            variantStyleKeys[when] ??= `${decl.styleKey}${toSuffixFromProp(when)}`;
          }

          // Ensure prop is dropped from DOM (unless transient)
          if (!jsxProp.startsWith("$")) {
            ensureShouldForwardPropDrop(decl, jsxProp);
          }
          sawSwitch = true;
        }
      }

      if (!sawSwitch) {
        // This was a css helper function, but not the supported switch-returning-css pattern.
        return false;
      }

      // Only mark as inlined once we've successfully handled the helper.
      usedCssHelperFunctions.add(helperName);

      // Merge helper base styles into component base style.
      mergeStyleObjects(styleObj, baseFromHelper);
      return true;
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
                // Local styled component mixin - handled later (unsupported, will bail).
              } else {
                // This might be an imported css helper - we can't determine its properties.
                // Mark for bail to avoid generating incorrect default values.
                hasImportedCssHelper = true;
              }
            }
            // Also check for member expression CSS helpers (e.g., buttonStyles.rootCss)
            else if (expr && typeof expr === "object" && "type" in expr) {
              const rootInfo = extractRootAndPath(expr);
              if (rootInfo && rootInfo.path.length === 1) {
                const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
                if (objectMemberMap) {
                  const memberDecl = objectMemberMap.get(rootInfo.path[0]!);
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
        context: { localName: decl.localName },
      });
      bail = true;
      break;
    }

    for (const rule of decl.rules) {
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
            loc: decl.loc,
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
            loc: decl.loc,
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
              loc: decl.loc,
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
            loc: decl.loc,
          });
          break;
        } else if (/\s+[a-zA-Z.#]/.test(s) && !isHandledComponentPattern) {
          // Descendant element/class/id selectors like `& a`, `& .child`, `& #foo`
          // But NOT `&:hover ${Child}` (component selector pattern)
          bail = true;
          warnings.push({
            severity: "warning",
            type: "Unsupported selector: descendant/child/sibling selector",
            loc: decl.loc,
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
              loc: decl.loc,
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

      if (isAttrRule) {
        decl.needsWrapperComponent = true;
        decl.attrWrapper ??= { kind: attrWrapperKind! };
        const suffix = attrSel!.suffix;
        const attrTargetStyleKey = `${decl.styleKey}${suffix}`;
        attrTarget = attrBuckets.get(attrTargetStyleKey) ?? {};
        attrBuckets.set(attrTargetStyleKey, attrTarget);
        attrPseudoElement = attrSel!.pseudoElement ?? null;

        if (attrWrapperKind === "input") {
          if (attrSel!.kind === "typeCheckbox") {
            decl.attrWrapper.checkboxKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "typeRadio") {
            decl.attrWrapper.radioKey = attrTargetStyleKey;
          }
        } else if (attrWrapperKind === "link") {
          if (attrSel!.kind === "targetBlankAfter") {
            decl.attrWrapper.externalKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefStartsHttps") {
            decl.attrWrapper.httpsKey = attrTargetStyleKey;
          } else if (attrSel!.kind === "hrefEndsPdf") {
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
          nestedSelectors[pseudoElement]![prop] = value;
          if (commentSource) {
            addPropComments(nestedSelectors[pseudoElement]!, prop, {
              leading: commentSource.leading,
              trailingLine: commentSource.trailingLine,
            });
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
          if (
            tryHandleInterpolatedBorder({
              api,
              j,
              filePath,
              decl,
              d,
              styleObj,
              extraStyleObjects,
              hasLocalThemeBinding,
              resolveValue,
              resolveCall,
              importMap,
              resolverImports,
              parseExpr,
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
            const res = resolveValue({
              kind: "importedValue",
              importedName: imp.importedName,
              source: imp.source,
              ...(info.path.length ? { path: info.path.join(".") } : {}),
              filePath,
            });
            if (!res) {
              // Adapter returned undefined for an identified imported value - bail
              warnings.push({
                severity: "error",
                type: "Adapter returned undefined for imported value",
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
            const exprAst = parseExpr(res.expr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "Adapter returned an unparseable value expression",
                loc: getNodeLocStart(expr),
                context: { localName: decl.localName, res },
              });
              return null;
            }
            return { resolved: exprAst, imports: res.imports };
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
              if (obj?.type !== "Identifier" || !staticPropertyOwners.has(obj.name)) {
                continue;
              }
              bailUnsupported(decl, "Unsupported interpolation: member expression");
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

          if (!d.property) {
            const slot = d.value.parts.find(
              (p: any): p is { kind: "slot"; slotId: number } => p.kind === "slot",
            );
            if (slot) {
              const expr = decl.templateExpressions[slot.slotId] as any;
              if (expr?.type === "Identifier" && cssHelperNames.has(expr.name)) {
                const helperKey = toStyleKey(expr.name);
                const extras = decl.extraStyleKeys ?? [];
                if (!extras.includes(helperKey)) {
                  extras.push(helperKey);
                }
                decl.extraStyleKeys = extras;
                // Track properties and values defined by this css helper so we can
                // set proper default values for pseudo selectors on these properties.
                const helperValues = cssHelperValuesByKey.get(helperKey);
                if (helperValues) {
                  for (const [prop, value] of helperValues) {
                    cssHelperPropValues.set(prop, value);
                  }
                }
                continue;
              }
              if (expr?.type === "Identifier") {
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
              }
              // Handle member expression CSS helpers (e.g., buttonStyles.rootCss)
              const rootInfo = extractRootAndPath(expr);
              if (rootInfo && rootInfo.path.length === 1) {
                const objectMemberMap = cssHelperObjectMembers.get(rootInfo.rootName);
                if (objectMemberMap) {
                  const memberDecl = objectMemberMap.get(rootInfo.path[0]!);
                  if (memberDecl) {
                    const extras = decl.extraStyleKeys ?? [];
                    if (!extras.includes(memberDecl.styleKey)) {
                      extras.push(memberDecl.styleKey);
                    }
                    decl.extraStyleKeys = extras;
                    // Track properties and values defined by this css helper
                    const helperValues = cssHelperValuesByKey.get(memberDecl.styleKey);
                    if (helperValues) {
                      for (const [prop, value] of helperValues) {
                        cssHelperPropValues.set(prop, value);
                      }
                    }
                    continue;
                  }
                }
              }
            }
          }
          if (tryHandlePropertyTernaryTemplateLiteral(d)) {
            continue;
          }
          if (tryHandleCssHelperConditionalBlock(d)) {
            continue;
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
          {
            const tryHandleEnumIfChainValue = (): boolean => {
              if (d.value.kind !== "interpolated") {
                return false;
              }
              if (!d.property) {
                return false;
              }
              // Only apply to base declarations; variant expansion for pseudo/media/attr buckets is more complex.
              if (pseudos?.length || media || attrTarget) {
                return false;
              }
              const parts = d.value.parts ?? [];
              const slotPart = parts.find((p: any) => p.kind === "slot");
              if (!slotPart || slotPart.kind !== "slot") {
                return false;
              }
              const slotId = slotPart.slotId;
              const expr = decl.templateExpressions[slotId] as any;
              if (!expr || expr.type !== "ArrowFunctionExpression") {
                return false;
              }
              const paramName =
                expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
              if (!paramName) {
                return false;
              }
              if (expr.body?.type !== "BlockStatement") {
                return false;
              }

              type Case = { when: string; value: string | number };
              const cases: Case[] = [];
              let defaultValue: string | number | null = null;
              let propName: string | null = null;

              const readIfReturnValue = (ifStmt: any): string | number | null => {
                const cons = ifStmt.consequent;
                if (!cons) {
                  return null;
                }
                if (cons.type === "ReturnStatement") {
                  const value = literalToStaticValue(cons.argument);
                  if (value === null || typeof value === "boolean") {
                    return null;
                  }
                  return value;
                }
                if (cons.type === "BlockStatement") {
                  const ret = (cons.body ?? []).find((s: any) => s?.type === "ReturnStatement");
                  if (!ret) {
                    return null;
                  }
                  const value = literalToStaticValue(ret.argument);
                  if (value === null || typeof value === "boolean") {
                    return null;
                  }
                  return value;
                }
                return null;
              };

              const bodyStmts = expr.body.body ?? [];
              for (const stmt of bodyStmts) {
                if (!stmt) {
                  continue;
                }
                if (stmt.type === "IfStatement") {
                  // Only support `if (...) { return <literal>; }` with no else.
                  if (stmt.alternate) {
                    return false;
                  }
                  const test = stmt.test as any;
                  if (
                    !test ||
                    test.type !== "BinaryExpression" ||
                    test.operator !== "===" ||
                    test.left?.type !== "MemberExpression"
                  ) {
                    return false;
                  }
                  const left = test.left as any;
                  const leftPath = getMemberPathFromIdentifier(left, paramName);
                  if (!leftPath || leftPath.length !== 1) {
                    return false;
                  }
                  const p = leftPath[0]!;
                  propName = propName ?? p;
                  if (propName !== p) {
                    return false;
                  }
                  const rhs = literalToStaticValue(test.right);
                  if (rhs === null) {
                    return false;
                  }
                  const retValue = readIfReturnValue(stmt);
                  if (retValue === null) {
                    return false;
                  }
                  const cond = `${propName} === ${JSON.stringify(rhs)}`;
                  cases.push({ when: cond, value: retValue });
                  continue;
                }
                if (stmt.type === "ReturnStatement") {
                  const value = literalToStaticValue(stmt.argument);
                  if (value === null || typeof value === "boolean") {
                    return false;
                  }
                  defaultValue = value;
                  continue;
                }
                // Any other statement shape => too risky.
                return false;
              }

              if (!propName || defaultValue === null || cases.length === 0) {
                return false;
              }

              ensureShouldForwardPropDrop(decl, propName);

              const styleFromValue = (value: string | number): Record<string, unknown> => {
                const valueRaw = typeof value === "number" ? String(value) : value;
                const irDecl = {
                  property: d.property,
                  value: { kind: "static" as const, value: valueRaw },
                  important: false,
                  valueRaw,
                };
                const out: Record<string, unknown> = {};
                for (const mapped of cssDeclarationToStylexDeclarations(irDecl as any)) {
                  out[mapped.prop] =
                    typeof value === "number"
                      ? value
                      : cssValueToJs(mapped.value, false, mapped.prop);
                }
                return out;
              };

              // Default goes into base style.
              Object.assign(styleObj, styleFromValue(defaultValue));

              // Cases become variant buckets keyed by expression strings.
              for (const c of cases) {
                variantBuckets.set(c.when, {
                  ...variantBuckets.get(c.when),
                  ...styleFromValue(c.value),
                });
                variantStyleKeys[c.when] ??= `${decl.styleKey}${toSuffixFromProp(c.when)}`;
              }

              return true;
            };

            if (tryHandleEnumIfChainValue()) {
              continue;
            }
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
          const tryHandleThemeIndexedLookup = (): boolean => {
            if (d.value.kind !== "interpolated") {
              return false;
            }
            if (!d.property) {
              return false;
            }
            // Skip media/attr buckets for now; these require more complex wiring.
            if (media || attrTarget) {
              return false;
            }
            const parts = d.value.parts ?? [];
            const slotPart = parts.find((p: any) => p.kind === "slot");
            if (!slotPart || slotPart.kind !== "slot") {
              return false;
            }
            const slotId = slotPart.slotId;
            const expr = decl.templateExpressions[slotId] as any;
            if (!expr || expr.type !== "ArrowFunctionExpression") {
              return false;
            }
            const paramName =
              expr.params?.[0]?.type === "Identifier" ? (expr.params[0].name as string) : null;
            if (!paramName) {
              return false;
            }
            const body = expr.body as any;
            if (!body || body.type !== "MemberExpression" || body.computed !== true) {
              return false;
            }

            const indexPropName = (() => {
              const p = body.property as any;
              if (!p || typeof p !== "object") {
                return null;
              }
              if (p.type === "Identifier" && typeof p.name === "string") {
                return p.name as string;
              }
              if (p.type === "MemberExpression") {
                const path = getMemberPathFromIdentifier(p as any, paramName);
                if (!path || path.length !== 1) {
                  return null;
                }
                return path[0]!;
              }
              return null;
            })();
            if (!indexPropName) {
              return false;
            }

            const themeObjectPath = (() => {
              const obj = body.object as any;
              if (!obj || obj.type !== "MemberExpression") {
                return null;
              }
              const parts = getMemberPathFromIdentifier(obj as any, paramName);
              if (!parts || parts.length < 2) {
                return null;
              }
              if (parts[0] !== "theme") {
                return null;
              }
              return parts.slice(1).join(".");
            })();
            if (!themeObjectPath) {
              return false;
            }

            const resolved = resolveValue({ kind: "theme", path: themeObjectPath, filePath });
            if (!resolved) {
              return false;
            }

            for (const imp of resolved.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }

            // Ensure we generate a wrapper so we can consume the prop without forwarding it to DOM.
            ensureShouldForwardPropDrop(decl, indexPropName);

            const outs = cssDeclarationToStylexDeclarations(d);
            for (const out of outs) {
              if (!out.prop) {
                continue;
              }
              const pseudoSuffix = (p: string): string => {
                // `:hover` -> `Hover`, `:focus-visible` -> `FocusVisible`
                const raw = p.trim().replace(/^:+/, "");
                const cleaned = raw
                  .split(/[^a-zA-Z0-9]+/g)
                  .filter(Boolean)
                  .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
                  .join("");
                return cleaned || "Pseudo";
              };

              const fnKey = pseudos?.length
                ? `${decl.styleKey}${toSuffixFromProp(out.prop)}${pseudoSuffix(pseudos[0]!)}`
                : `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              styleFnFromProps.push({ fnKey, jsxProp: indexPropName });

              if (!styleFnDecls.has(fnKey)) {
                // Build expression: resolvedExpr[indexPropName]
                // NOTE: This is TypeScript-only syntax (TSAsExpression + `keyof typeof`),
                // so we parse it explicitly with a TSX parser here rather than relying on
                // the generic `parseExpr` helper.
                const resolvedExprAst = parseExpr(resolved.expr);
                const paramName = buildSafeIndexedParamName(indexPropName, resolvedExprAst);
                const indexedExprAst = (() => {
                  // We intentionally do NOT add `as keyof typeof themeVars` fallbacks.
                  // If a fixture uses a `string` key to index theme colors, it should be fixed at the
                  // input/type level to use a proper key union (e.g. `Colors`), and the output should
                  // reflect that contract.
                  const exprSource = `(${resolved.expr})[${paramName}]`;
                  try {
                    const jParse = api.jscodeshift.withParser("tsx");
                    const program = jParse(`(${exprSource});`);
                    const stmt = program.find(jParse.ExpressionStatement).nodes()[0] as any;
                    let expr = stmt?.expression ?? null;
                    while (expr?.type === "ParenthesizedExpression") {
                      expr = expr.expression;
                    }
                    // Remove extra.parenthesized flag that causes recast to add parentheses
                    if (expr?.extra?.parenthesized) {
                      delete expr.extra.parenthesized;
                      delete expr.extra.parenStart;
                    }
                    return expr;
                  } catch {
                    return null;
                  }
                })();
                if (!indexedExprAst) {
                  warnings.push({
                    severity: "error",
                    type: "Adapter returned an unparseable styles expression",
                    loc: decl.loc,
                    context: { localName: decl.localName, resolved },
                  });
                  bail = true;
                  continue;
                }

                const param = j.identifier(paramName);
                // Prefer the prop's own type when available (e.g. `Color` / `Colors`) so we don't end up with
                // `keyof typeof themeVars` in fixture outputs.
                const propTsType = findJsxPropTsType(indexPropName);
                (param as any).typeAnnotation = j.tsTypeAnnotation(
                  (propTsType && typeof propTsType === "object" && (propTsType as any).type
                    ? (propTsType as any)
                    : j.tsStringKeyword()) as any,
                );
                if (pseudos?.length) {
                  const pseudoEntries = [
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudos.map((ps) =>
                      j.property("init", j.literal(ps), indexedExprAst as any),
                    ),
                  ];
                  const propValue = j.objectExpression(pseudoEntries);
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression(
                      [param],
                      j.objectExpression([
                        j.property("init", j.identifier(out.prop), propValue) as any,
                      ]),
                    ),
                  );
                } else {
                  const p = j.property(
                    "init",
                    j.identifier(out.prop),
                    indexedExprAst as any,
                  ) as any;
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression([p])),
                  );
                }
              }
            }

            return true;
          };

          if (tryHandleThemeIndexedLookup()) {
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
              warnings.push({
                severity: "warning",
                type: "Adapter resolved StyleX styles cannot be applied under nested selectors/at-rules",
                loc,
                context: { selector: rule.selector },
              });
              bail = true;
              break;
            }
            for (const imp of res.imports ?? []) {
              resolverImports.set(JSON.stringify(imp), imp);
            }
            const exprAst = parseExpr(res.expr);
            if (!exprAst) {
              warnings.push({
                severity: "error",
                type: "Adapter returned an unparseable styles expression",
                loc: decl.loc,
                context: { localName: decl.localName, res },
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
              warnings.push({
                severity: "error",
                type: "Adapter returned an unparseable styles expression",
                loc: decl.loc,
                context: { localName: decl.localName },
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
            const negVariants = res.variants.filter((v: any) => v.when.startsWith("!"));
            const posVariants = res.variants.filter((v: any) => !v.when.startsWith("!"));

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
                  type: "Adapter returned an unparseable styles expression",
                  loc,
                  context: { localName: decl.localName },
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
            if (cssProp === "background") {
              const variantValues = res.variants
                .filter((v: any) => typeof v.expr === "string")
                .map((v: any) => v.expr as string);
              const resolved = resolveBackgroundStylexPropForVariants(variantValues);
              if (!resolved) {
                // Heterogeneous - can't safely transform
                warnings.push({
                  severity: "warning",
                  type: "Heterogeneous background values (mix of gradients and colors) not currently supported",
                  loc: decl.loc,
                });
                bail = true;
                break;
              }
              stylexProp = resolved;
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
                  type: "Adapter returned an unparseable styles expression",
                  loc: decl.loc,
                  context: { localName: decl.localName, expr },
                });
                return null;
              }
              return { exprAst, imports: imports ?? [] };
            };

            // Helper to expand border shorthand from a string literal like "2px solid blue"
            const expandBorderShorthand = (
              target: Record<string, unknown>,
              exprAst: any,
            ): boolean => {
              // Handle various AST wrapper structures
              let node = exprAst;
              // Unwrap ExpressionStatement if present
              if (node?.type === "ExpressionStatement") {
                node = node.expression;
              }
              // Only expand if it's a string literal
              if (node?.type !== "StringLiteral" && node?.type !== "Literal") {
                return false;
              }
              const value = node.value;
              if (typeof value !== "string") {
                return false;
              }
              const tokens = value.trim().split(/\s+/);
              const BORDER_STYLES = new Set([
                "none",
                "solid",
                "dashed",
                "dotted",
                "double",
                "groove",
                "ridge",
                "inset",
                "outset",
              ]);
              const looksLikeLength = (t: string) =>
                /^-?\d*\.?\d+(px|rem|em|vh|vw|vmin|vmax|ch|ex|lh|%)?$/.test(t);

              let width: string | undefined;
              let style: string | undefined;
              const colorParts: string[] = [];
              for (const token of tokens) {
                if (!width && looksLikeLength(token)) {
                  width = token;
                } else if (!style && BORDER_STYLES.has(token)) {
                  style = token;
                } else {
                  colorParts.push(token);
                }
              }
              const color = colorParts.join(" ").trim();
              if (!width && !style && !color) {
                return false;
              }
              if (width) {
                target["borderWidth"] = j.literal(width);
              }
              if (style) {
                target["borderStyle"] = j.literal(style);
              }
              if (color) {
                target["borderColor"] = j.literal(color);
              }
              return true;
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
            ): void => {
              for (const imp of parsed.imports) {
                resolverImports.set(JSON.stringify(imp), imp);
              }
              // Special handling for border shorthand with string literal values
              if (cssProp === "border" && expandBorderShorthand(target, parsed.exprAst)) {
                return;
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
                const existing = target[stylexProp];
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
                  const baseValue = existing ?? styleObj[stylexProp];
                  map.default = baseValue ?? null;
                }
                map[media] = parsed.exprAst as any;
                target[stylexProp] = map;
                return;
              }
              if (pseudos?.length) {
                const existing = target[stylexProp];
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
                  const baseValue = existing ?? styleObj[stylexProp];
                  map.default = baseValue ?? null;
                }
                // Apply to all pseudos (e.g., both :hover and :focus for "&:hover, &:focus")
                for (const ps of pseudos) {
                  map[ps] = parsed.exprAst as any;
                }
                target[stylexProp] = map;
                return;
              }

              target[stylexProp] = parsed.exprAst as any;
            };

            // IMPORTANT: stage parsing first. If either branch fails to parse, skip this declaration entirely
            // (mirrors the `resolvedValue` behavior) and avoid emitting empty variant buckets.
            const negParsed = neg ? parseResolved(neg.expr, neg.imports) : null;
            if (neg && !negParsed) {
              bailUnsupported(decl, "Adapter returned an unparseable styles expression");
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
              bailUnsupported(decl, `Adapter returned an unparseable styles expression`);
              break;
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
                  type: "Adapter returned an unparseable styles expression",
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
              bailUnsupported(decl, "Adapter returned an unparseable styles expression");
              break;
            }

            // Generate style keys for each branch
            const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
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
                  j.property("init", j.identifier(out.prop), valueExpr),
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
                  j.property("init", j.identifier(out.prop), valueExpr),
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
                  const valueExprRaw = (() => {
                    const unwrapped = unwrapArrowFunctionToPropsExpr(j, e);
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
                    const inlineExpr = unwrapped?.expr ?? inlineArrowFunctionBody(j, e);
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
                    const buildPropValue = (): ExpressionKind => {
                      if (media && pseudos?.length) {
                        const pseudoProps = pseudos.map((ps) =>
                          j.property(
                            "init",
                            j.literal(ps),
                            j.objectExpression([
                              j.property("init", j.identifier("default"), j.literal(null)),
                              j.property("init", j.literal(media), valueExpr),
                            ]),
                          ),
                        );
                        return j.objectExpression([
                          j.property("init", j.identifier("default"), j.literal(null)),
                          ...pseudoProps,
                        ]);
                      }
                      if (media) {
                        return j.objectExpression([
                          j.property("init", j.identifier("default"), j.literal(null)),
                          j.property("init", j.literal(media), valueExpr),
                        ]);
                      }
                      const pseudoProps = pseudos?.map((ps) =>
                        j.property("init", j.literal(ps), valueExpr),
                      );
                      return j.objectExpression([
                        j.property("init", j.identifier("default"), j.literal(null)),
                        ...(pseudoProps ?? []),
                      ]);
                    };
                    const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}FromProps`;
                    if (!styleFnDecls.has(fnKey)) {
                      const p = j.property("init", j.identifier(out.prop), buildPropValue()) as any;
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
            }
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
                  const param = j.identifier(out.prop);
                  const valueId = j.identifier(out.prop);
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
                          existingValue = prop.value as ExpressionKind;
                        }
                      }
                    }
                    const defaultValue = existingValue ?? j.literal(null);
                    return j.objectExpression([
                      j.property("init", j.identifier("default"), defaultValue),
                      j.property("init", j.literal(media), valueExpr),
                    ]);
                  };
                  const p = j.property("init", j.identifier(out.prop), getPropValue()) as any;
                  p.shorthand = valueExpr?.type === "Identifier" && valueExpr.name === out.prop;
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
              const buildPropValue = (): ExpressionKind => {
                if (media && pseudos?.length) {
                  const pseudoProps = pseudos.map((ps) =>
                    j.property(
                      "init",
                      j.literal(ps),
                      j.objectExpression([
                        j.property("init", j.identifier("default"), j.literal(null)),
                        j.property("init", j.literal(media), expr),
                      ]),
                    ),
                  );
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudoProps,
                  ]);
                }
                if (media) {
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    j.property("init", j.literal(media), expr),
                  ]);
                }
                if (pseudos?.length) {
                  const pseudoProps = pseudos.map((ps) => j.property("init", j.literal(ps), expr));
                  return j.objectExpression([
                    j.property("init", j.identifier("default"), j.literal(null)),
                    ...pseudoProps,
                  ]);
                }
                return expr;
              };
              const fnKey = `${decl.styleKey}${toSuffixFromProp(out.prop)}`;
              if (!styleFnDecls.has(fnKey)) {
                const body = j.objectExpression([
                  j.property("init", j.identifier(out.prop), buildPropValue()),
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
              // Provide more specific warning based on arrow function body type
              const body = (expr as { body?: { type?: string; operator?: string } }).body;
              const bodyType = body?.type;
              if (bodyType === "ConditionalExpression") {
                return {
                  type: "Arrow function: conditional branches could not be resolved to static or theme values",
                  context: { property: d.property },
                };
              }
              if (bodyType === "LogicalExpression") {
                const op = body?.operator;
                if (op === "&&") {
                  return {
                    type: "Arrow function: logical expression pattern not supported",
                    context: {
                      property: d.property,
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
                  type: "Arrow function: helper call could not be resolved by adapter",
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
            loc,
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
    for (const [sel, obj] of Object.entries(nestedSelectors)) {
      styleObj[sel] = obj;
    }

    const varsToDrop = new Set<string>();
    rewriteCssVarsInStyleObject(styleObj, localVarValues, varsToDrop);
    for (const name of varsToDrop) {
      delete (styleObj as any)[name];
    }

    if (
      decl.rawCss &&
      (/__SC_EXPR_\d+__\s*\{/.test(decl.rawCss) ||
        /&:[a-z-]+(?:\([^)]*\))?\s+__SC_EXPR_\d+__\s*\{/i.test(decl.rawCss))
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
          if (!m) {
            continue;
          }
          const prop = m[1]!.trim();
          const value = m[2]!.trim();
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
        const pseudo = m[1]!;
        applyBlock(Number(m[2]), m[3] ?? "", pseudo);
      }

      if (didApply) {
        delete (styleObj as any).width;
        delete (styleObj as any).height;
        delete (styleObj as any).opacity;
        delete (styleObj as any).transform;
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

  // Generate style objects from descendant override pseudo buckets
  if (descendantOverridePseudoBuckets.size > 0) {
    const makeAncestorKey = (pseudo: string) =>
      j.callExpression(
        j.memberExpression(
          j.memberExpression(j.identifier("stylex"), j.identifier("when")),
          j.identifier("ancestor"),
        ),
        [j.literal(pseudo)],
      );

    // Local type guard that narrows to ExpressionKind for use with jscodeshift builders
    const isExpressionNode = (v: unknown): v is ExpressionKind => isAstNode(v);

    for (const [overrideKey, pseudoBuckets] of descendantOverridePseudoBuckets.entries()) {
      const baseBucket = pseudoBuckets.get(null) ?? {};
      const props: any[] = [];

      // Collect all property names across all pseudo buckets
      const allPropNames = new Set<string>();
      for (const bucket of pseudoBuckets.values()) {
        for (const prop of Object.keys(bucket)) {
          allPropNames.add(prop);
        }
      }

      for (const prop of allPropNames) {
        const baseVal = (baseBucket as Record<string, unknown>)[prop];
        // Collect pseudo values for this property
        const pseudoValues: Array<{ pseudo: string; value: unknown }> = [];
        for (const [pseudo, bucket] of pseudoBuckets.entries()) {
          if (pseudo === null) {
            continue;
          }
          const val = (bucket as Record<string, unknown>)[prop];
          if (val !== undefined) {
            pseudoValues.push({ pseudo, value: val });
          }
        }

        if (pseudoValues.length > 0) {
          // Build object expression with default and pseudo values
          const objProps: any[] = [
            j.property(
              "init",
              j.identifier("default"),
              isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal ?? null),
            ),
          ];
          for (const { pseudo, value } of pseudoValues) {
            const ancestorKey = makeAncestorKey(pseudo);
            const valExpr = isExpressionNode(value) ? value : literalToAst(j, value);
            const propNode = Object.assign(j.property("init", ancestorKey, valExpr), {
              computed: true,
            });
            objProps.push(propNode);
          }
          const mapExpr = j.objectExpression(objProps);
          props.push(j.property("init", j.identifier(prop), mapExpr));
        } else if (baseVal !== undefined) {
          props.push(
            j.property(
              "init",
              j.identifier(prop),
              isExpressionNode(baseVal) ? baseVal : literalToAst(j, baseVal),
            ),
          );
        }
      }

      if (props.length > 0) {
        resolvedStyleObjects.set(overrideKey, j.objectExpression(props) as unknown);
      }
    }
  }

  return {
    resolvedStyleObjects,
    descendantOverrides,
    ancestorSelectorParents,
    usedCssHelperFunctions,
    bail,
  };
}
