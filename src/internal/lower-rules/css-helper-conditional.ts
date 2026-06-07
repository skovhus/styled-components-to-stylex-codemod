/**
 * Resolves conditional css`` helper blocks for lower-rules.
 * Core concepts: analyzing conditional branches, extracting variant conditions,
 * and emitting StyleX-compatible style objects or style functions.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import type { ImportSpec } from "../../adapter.js";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind, StyleFnFromPropsEntry, TestInfo } from "./decl-types.js";
import type { InternalHandlerContext } from "../builtin-handlers.js";
import type { LowerRulesState } from "./state.js";
import { resolveDynamicNode } from "../builtin-handlers.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { parseCssTemplateToRules, type ConditionalVariant } from "./css-helper.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import {
  buildTemplateWithStaticParts,
  collectPropsFromArrowFn,
  collectPropsFromExpressions,
  getImportedStylexIdentifiers,
  maybeOmitPxUnitFromStylexStyleValue,
  normalizeDollarProps,
  rewritePropsThemeToThemeVar,
} from "./inline-styles.js";
import { mergeStyleObjects } from "./utils.js";
import { extractConditionName } from "../utilities/style-key-naming.js";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isCallExpressionNode,
  isEmptyCssBranch,
  staticValueToLiteral,
  type ASTNodeRecord,
} from "../utilities/jscodeshift-utils.js";
import {
  cssValueToJs,
  normalizeCssContentValue,
  styleKeyWithSuffix,
} from "../transform/helpers.js";
import { createPropTestHelpers, invertWhen } from "./variant-utils.js";
import { cssPropertyToIdentifier, makeCssProperty, makeCssPropKey } from "./shared.js";
import { formatObservedVariantCondition } from "../utilities/prop-usage.js";
import {
  emitObservedVariantBuckets,
  resolveObservedVariantValues,
} from "./observed-variant-buckets.js";
import {
  resolveTemplateLiteralBranch,
  type ComponentInfo,
  type TemplateLiteralContext,
} from "./template-literals.js";
import {
  ensureShouldForwardPropDrop,
  literalToStaticValue,
  resolveTypeNodeFromTsType,
} from "./types.js";
import { evaluateObservedDynamicExpression } from "./static-evaluator.js";
import { extractUnionLiteralValues } from "./variants.js";
import { buildThemeStyleKeys } from "../utilities/style-key-naming.js";
import { camelToKebabCase, capitalize, kebabToCamelCase } from "../utilities/string-utils.js";
import {
  findSupportedAtRule,
  findInAst,
  hasUnsupportedAtRule,
  isMemberExpression,
  registerImports,
  resolveMediaAtRulePlaceholders,
  tryResolveAdapterCall,
} from "./utils.js";
import {
  expandInterpolatedAnimationShorthand,
  expandStaticAnimationShorthand,
} from "../keyframes.js";

type CssHelperConditionalContext = Pick<
  LowerRulesState,
  | "j"
  | "filePath"
  | "warnings"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveSelector"
  | "resolveImportInScope"
  | "resolverImports"
  | "isCssHelperTaggedTemplate"
  | "resolveCssHelperTemplate"
  | "markBail"
  | "importMap"
  | "root"
  | "keyframesNames"
  | "inlineKeyframeNameMap"
  | "exportedComponentNames"
  | "componentsUsedAsValue"
> & {
  propUsageByComponent?: LowerRulesState["propUsageByComponent"];
  decl: StyledDecl;
  handlerContext: InternalHandlerContext;
  componentInfo: ComponentInfo;
  styleObj: Record<string, unknown>;
  styleFnFromProps: StyleFnFromPropsEntry[];
  styleFnDecls: Map<string, unknown>;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; jsxProp?: string }>;
  resolveStaticCssBlock: (rawCss: string) => Record<string, unknown> | null;
  isPlainTemplateLiteral: (node: ExpressionKind | null | undefined) => boolean;
  isThemeAccessTest: (test: ExpressionKind, paramName: string | null) => boolean;
  applyVariant: (testInfo: TestInfo, styleObj: Record<string, unknown>) => void;
  dropAllTestInfoProps: (testInfo: TestInfo) => void;
  annotateParamFromJsxProp: (paramId: unknown, jsxProp: string) => void;
  findJsxPropTsType: (jsxProp: string) => unknown;
  isJsxPropOptional: (jsxProp: string) => boolean;
  extraStyleObjects: Map<string, Record<string, unknown>>;
  resolvedStyleObjects: Map<string, unknown>;
  allocateSourceOrder: () => number;
};

export function createCssHelperConditionalHandler(ctx: CssHelperConditionalContext) {
  const {
    j,
    decl,
    filePath,
    warnings,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveSelector,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
    styleObj,
    styleFnFromProps,
    styleFnDecls,
    inlineStyleProps,
    isCssHelperTaggedTemplate,
    resolveCssHelperTemplate,
    resolveStaticCssBlock,
    isPlainTemplateLiteral,
    isThemeAccessTest,
    applyVariant,
    dropAllTestInfoProps,
    annotateParamFromJsxProp,
    findJsxPropTsType,
    isJsxPropOptional,
    markBail,
    importMap,
    root,
    extraStyleObjects,
    resolvedStyleObjects,
    allocateSourceOrder,
  } = ctx;
  const avoidNames = new Set(importMap.keys());
  const cssHelperTemplateOptions = {
    rejectStrippedSpecificity: decl.base.kind === "component",
  };

  /**
   * Resolve the TS type node for a prop used in a style function parameter.
   * Uses the component's type annotation to infer the correct type (e.g. `number | string`).
   * For optional props, includes `| undefined` in the union unless `required` is set,
   * which callers should use when the call-site condition narrows away undefined
   * (e.g. `typeof x === "number"` is a TypeScript type guard).
   * Falls back to `number` when the prop type cannot be determined.
   */
  const resolveStyleFnPropType = (jsxProp: string, opts?: { required?: boolean }): unknown => {
    const resolved =
      cloneAstNode(resolveTypeNodeFromTsType(j, findJsxPropTsType(jsxProp))) ?? j.tsNumberKeyword();

    if (!opts?.required && isJsxPropOptional(jsxProp)) {
      const members =
        (resolved as { type: string }).type === "TSUnionType"
          ? [...(resolved as { types: unknown[] }).types, j.tsUndefinedKeyword()]
          : [resolved, j.tsUndefinedKeyword()];
      return j.tsUnionType(members as any[]);
    }

    return resolved;
  };

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
    warnings,
    keyframesNames: ctx.keyframesNames,
    inlineKeyframeNameMap: ctx.inlineKeyframeNameMap,
  };

  type ResolvedPseudoEntry = {
    pseudo: string;
    conditionExpr?: ExpressionKind;
    alias?: RuntimePseudoAlias;
  };

  type RuntimePseudoAlias = {
    pseudoNames: string[];
    pseudoKeys: string[];
    styleSelectorExpr: ExpressionKind;
  };
  type ArrowFunctionNode = Parameters<typeof getArrowFnParamBindings>[0];

  return (d: any, pseudos?: string[] | null, pseudoElement?: string | null): boolean => {
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

    const bailPseudoElementConditional = (): true => {
      warnings.push({
        severity: "warning",
        type: "Unsupported selector: conditional css block inside pseudo-element selector",
        loc: getNodeLocStart(expr) ?? decl.loc,
        context: { selector: pseudoElement },
      });
      markBail();
      return true;
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

    const replaceParamWithProps = (
      exprNode: ExpressionKind,
      localParamName?: string,
      localBindings?: NonNullable<ReturnType<typeof getArrowFnParamBindings>>,
    ): ExpressionKind => {
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
          (bindings.kind === "simple" || localParamName || localBindings?.kind === "simple") &&
          isMemberExpression(n) &&
          (n.object as ASTNodeRecord)?.type === "Identifier" &&
          ((bindings.kind === "simple" &&
            (n.object as { name?: string })?.name === bindings.paramName) ||
            (localParamName && (n.object as { name?: string })?.name === localParamName) ||
            (localBindings?.kind === "simple" &&
              (n.object as { name?: string })?.name === localBindings.paramName)) &&
          (n.property as ASTNodeRecord)?.type === "Identifier" &&
          ((n.property as { name?: string })?.name ?? "").startsWith("$") &&
          n.computed === false
        ) {
          return j.identifier((n.property as { name: string }).name);
        }
        if (n.type === "Identifier") {
          const nodeName = (n as { name?: string }).name ?? "";
          if (
            (bindings.kind === "simple" && nodeName === bindings.paramName) ||
            (localParamName && nodeName === localParamName) ||
            (localBindings?.kind === "simple" && nodeName === localBindings.paramName)
          ) {
            const p = parent as ASTNodeRecord | undefined;
            const isMemberProp =
              p && isMemberExpression(p) && p.property === n && p.computed === false;
            const isObjectKey = p && p.type === "Property" && p.key === n && p.shorthand !== true;
            if (!isMemberProp && !isObjectKey) {
              return j.identifier("props");
            }
          }
          if (localBindings?.kind === "destructured" && localBindings.bindings.has(nodeName)) {
            const propName = localBindings.bindings.get(nodeName)!;
            const defaultValue = localBindings.defaults?.get(propName);
            const base = propName.startsWith("$")
              ? j.identifier(propName)
              : j.memberExpression(j.identifier("props"), j.identifier(propName));
            if (defaultValue) {
              return j.logicalExpression("??", base, cloneAstNode(defaultValue) as ExpressionKind);
            }
            return base;
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
        if (isMemberExpression(n)) {
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

    const getFunctionParamName = (node: ExpressionKind): string | undefined => {
      if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") {
        return undefined;
      }
      const firstParam = (node as { params?: ASTNode[] }).params?.[0];
      return firstParam?.type === "Identifier" ? (firstParam as { name: string }).name : undefined;
    };

    /** Apply conditional variants, composing with an outer condition, and inject useTheme() for theme refs. */
    const applyConditionalVariantsInline = (
      conditionalVariants: ConditionalVariant[],
      outerCondition: string,
    ): void => {
      for (const cv of conditionalVariants) {
        const composedWhen = `${outerCondition} && ${cv.when}`;
        applyVariant({ when: composedWhen, propName: cv.propName }, cv.style);
        if (cv.propName) {
          ensureShouldForwardPropDrop(decl, cv.propName);
        }
        // Theme-based conditional variants need useTheme() to be injected
        if (cv.when.startsWith("theme.") || cv.when.startsWith("!theme.")) {
          if (!decl.needsUseThemeHook) {
            decl.needsUseThemeHook = [];
          }
          if (
            !decl.needsUseThemeHook.some((e) => e.trueStyleKey === null && e.falseStyleKey === null)
          ) {
            decl.needsUseThemeHook.push({
              themeProp: "__variantCondition",
              trueStyleKey: null,
              falseStyleKey: null,
            });
          }
        }
      }
    };

    const resolveCssBranchToInlineMap = (
      node: ExpressionKind,
      opts?: { requireResolvedPseudoSelector?: boolean },
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
      const runtimePseudoAliases: RuntimePseudoAlias[] = [];
      // Track @media values per property: Map<cssProp, Map<mediaQuery, ExpressionKind>>
      const mediaValues = new Map<string, Map<string, ExpressionKind>>();
      // Track computed media keys per property (from resolveSelector)
      const computedMediaValues = new Map<
        string,
        Array<{ keyExpr: unknown; value: ExpressionKind }>
      >();
      let sawInterpolatedPseudoSelector = false;

      const setValueForProp = (
        prop: string,
        value: ExpressionKind,
        media: string | undefined,
        computedKey: unknown,
        pseudoEntries?: ResolvedPseudoEntry[] | null,
      ) => {
        if (pseudoEntries?.length) {
          if (media || computedKey) {
            return false;
          }
          const localDefaultExpr = out.get(prop);
          const defaultExpr =
            localDefaultExpr ??
            (styleObj[prop] !== undefined
              ? (styleValueToExpression(j, styleObj[prop]) as ExpressionKind)
              : (j.literal(null) as ExpressionKind));
          const wrapped =
            localDefaultExpr?.type === "ObjectExpression"
              ? appendValueWithResolvedPseudos(localDefaultExpr, value, defaultExpr, pseudoEntries)
              : wrapValueWithResolvedPseudos(value, defaultExpr, pseudoEntries);
          if (localDefaultExpr) {
            inlineMapPseudoRootDefaults.set(wrapped, true);
          }
          out.set(prop, wrapped);
          return true;
        }
        if (computedKey) {
          const arr = computedMediaValues.get(prop) ?? [];
          arr.push({ keyExpr: computedKey, value });
          computedMediaValues.set(prop, arr);
        } else if (media) {
          if (!mediaValues.has(prop)) {
            mediaValues.set(prop, new Map());
          }
          mediaValues.get(prop)!.set(media, value);
        } else {
          out.set(prop, value);
        }
        return true;
      };

      const resolveRulePseudoEntries = (selector: string): ResolvedPseudoEntry[] | null => {
        if (selector === "&") {
          return [];
        }
        const staticPseudo = selector.match(/^&((?::[a-zA-Z][a-zA-Z0-9-]*(?:\([^)]*\))?)+)$/);
        if (staticPseudo?.[1]) {
          return [{ pseudo: staticPseudo[1] }];
        }
        const placeholderMatch = selector.match(/__SC_EXPR_(\d+)__/);
        const beforePlaceholder =
          placeholderMatch?.index === undefined ? "" : selector.slice(0, placeholderMatch.index);
        const afterPlaceholder =
          placeholderMatch?.index === undefined
            ? ""
            : selector.slice(placeholderMatch.index + placeholderMatch[0].length);
        const normalizedAfterPlaceholder = afterPlaceholder.trim();
        const prefixPseudo = beforePlaceholder.replace(/^&/, "").replace(/:$/, "");
        if (
          !placeholderMatch?.[1] ||
          (normalizedAfterPlaceholder !== "" && normalizedAfterPlaceholder !== "&") ||
          !(prefixPseudo === "" || /^(?::[a-zA-Z][a-zA-Z0-9-]*(?:\([^)]*\))?)+$/.test(prefixPseudo))
        ) {
          return null;
        }
        const slotExpr = slotExprById.get(Number(placeholderMatch[1]));
        if (!slotExpr || typeof slotExpr !== "object") {
          return null;
        }
        let localName: string | null = null;
        let path: string | undefined;
        if ((slotExpr as { type?: string; name?: string }).type === "Identifier") {
          localName = (slotExpr as { name: string }).name;
        } else if (isMemberExpression(slotExpr)) {
          const parts: string[] = [];
          let current = slotExpr as any;
          while (current?.type === "MemberExpression") {
            const property = current.property;
            if (property?.type !== "Identifier") {
              return null;
            }
            parts.unshift(property.name);
            current = current.object;
          }
          if (current?.type !== "Identifier") {
            return null;
          }
          localName = current.name;
          path = parts.length > 0 ? parts.join(".") : undefined;
        }
        if (!localName) {
          return null;
        }
        const imp = resolveImportInScope(localName, slotExpr);
        if (!imp) {
          return null;
        }
        const selectorResult = resolveSelector({
          kind: "selectorInterpolation",
          importedName: imp.importedName,
          source: imp.source,
          ...(path ? { path } : {}),
          filePath,
          loc: getNodeLocStart(slotExpr) ?? undefined,
        });
        if (!selectorResult) {
          return null;
        }
        registerImports(selectorResult.imports, resolverImports);
        if (selectorResult.kind === "pseudoAlias") {
          const styleSelectorExpr = parseExpr(selectorResult.styleSelectorExpr);
          if (!styleSelectorExpr) {
            return null;
          }
          const pseudoKeys = selectorResult.values.map((value) => `${prefixPseudo}:${value}`);
          const alias = {
            pseudoNames: selectorResult.values,
            pseudoKeys,
            styleSelectorExpr: styleSelectorExpr as ExpressionKind,
          };
          runtimePseudoAliases.push(alias);
          sawInterpolatedPseudoSelector = true;
          return pseudoKeys.map((pseudo) => ({
            pseudo,
            alias,
          }));
        }
        if (selectorResult.kind !== "pseudoExpand") {
          return null;
        }
        sawInterpolatedPseudoSelector = true;
        const entries: ResolvedPseudoEntry[] = [];
        for (const expansion of selectorResult.expansions) {
          let conditionExpr: ExpressionKind | undefined;
          if (expansion.condition) {
            registerImports(expansion.condition.imports, resolverImports);
            const parsed = parseExpr(expansion.condition.expr);
            if (!parsed) {
              return null;
            }
            conditionExpr = parsed as ExpressionKind;
          }
          entries.push({
            pseudo: `${prefixPseudo}:${expansion.pseudo}`,
            ...(conditionExpr ? { conditionExpr } : {}),
          });
        }
        return entries;
      };

      const wrapValueWithResolvedPseudos = (
        value: ExpressionKind,
        defaultExpr: ExpressionKind,
        pseudoEntries: ResolvedPseudoEntry[],
      ): ExpressionKind => {
        const properties = [
          j.property("init", j.identifier("default"), cloneAstNode(defaultExpr) as ExpressionKind),
        ];
        for (const entry of pseudoEntries) {
          let entryValue = value;
          if (entry.conditionExpr) {
            const conditioned = j.objectExpression([
              j.property(
                "init",
                j.identifier("default"),
                cloneAstNode(defaultExpr) as ExpressionKind,
              ),
              (() => {
                const p = j.property("init", entry.conditionExpr!, value);
                (p as { computed?: boolean }).computed = true;
                return p;
              })(),
            ]);
            entryValue = conditioned as ExpressionKind;
          }
          properties.push(j.property("init", j.literal(entry.pseudo), entryValue));
        }
        return j.objectExpression(properties) as ExpressionKind;
      };

      const appendValueWithResolvedPseudos = (
        existing: ExpressionKind,
        value: ExpressionKind,
        defaultExpr: ExpressionKind,
        pseudoEntries: ResolvedPseudoEntry[],
      ): ExpressionKind => {
        const existingProperties =
          existing.type === "ObjectExpression"
            ? ([...existing.properties] as Parameters<typeof j.objectExpression>[0])
            : [];
        const properties = existingProperties ?? [];
        for (const entry of pseudoEntries) {
          let entryValue = value;
          if (entry.conditionExpr) {
            const conditioned = j.objectExpression([
              j.property(
                "init",
                j.identifier("default"),
                cloneAstNode(defaultExpr) as ExpressionKind,
              ),
              (() => {
                const p = j.property("init", entry.conditionExpr!, value);
                (p as { computed?: boolean }).computed = true;
                return p;
              })(),
            ]);
            entryValue = conditioned as ExpressionKind;
          }
          properties.push(j.property("init", j.literal(entry.pseudo), entryValue));
        }
        return j.objectExpression(properties) as ExpressionKind;
      };

      for (const rule of rules) {
        const rawMedia = findSupportedAtRule(rule.atRuleStack);
        // Support StyleX condition at-rules; bail on non-StyleX at-rules or unsafe mixed stacks.
        // Mixed stacks must also bail because preserving only one condition would be too broad.
        if (hasUnsupportedAtRule(rule.atRuleStack)) {
          return null;
        }

        // Resolve __SC_EXPR_N__ placeholders inside the media query
        let media: string | undefined = rawMedia;
        let computedMediaKeyExpr: unknown;
        if (rawMedia) {
          const resolved = resolveMediaAtRulePlaceholders(
            rawMedia,
            (slotId) => slotExprById.get(slotId),
            {
              lookupImport: resolveImportInScope,
              resolveValue,
              resolveSelector,
              parseExpr,
              filePath,
              resolverImports,
            },
          );
          if (resolved === null) {
            return null;
          }
          if (resolved.kind === "static") {
            media = resolved.value;
          } else {
            computedMediaKeyExpr = resolved.keyExpr;
            media = undefined;
          }
        }

        const selector = (rule.selector ?? "").trim();
        const pseudoEntries = resolveRulePseudoEntries(selector);
        if (!pseudoEntries) {
          return null;
        }

        // Convert expanded animation values (mix of AST nodes and primitives) to ExpressionKind
        const applyExpandedAnimation = (expanded: Record<string, unknown>): boolean => {
          for (const [prop, value] of Object.entries(expanded)) {
            const exprValue =
              typeof value === "string" || typeof value === "number"
                ? (staticValueToLiteral(j, value) as ExpressionKind)
                : (value as ExpressionKind);
            if (!setValueForProp(prop, exprValue, media, computedMediaKeyExpr, pseudoEntries)) {
              return false;
            }
          }
          return true;
        };

        for (const d of rule.declarations) {
          if (!d.property) {
            return null;
          }
          // Reject property names containing slot placeholders (ternary in property position)
          if (d.property.includes("__SC_EXPR_")) {
            return null;
          }
          if (d.important) {
            return null;
          }
          if (d.value.kind === "static") {
            // Expand static animation shorthand referencing keyframes
            if (d.property === "animation" && ctx.keyframesNames && ctx.keyframesNames.size > 0) {
              const expanded: Record<string, unknown> = {};
              if (
                expandStaticAnimationShorthand(
                  d.valueRaw,
                  ctx.keyframesNames,
                  j,
                  expanded,
                  ctx.inlineKeyframeNameMap,
                )
              ) {
                if (!applyExpandedAnimation(expanded)) {
                  return null;
                }
                continue;
              }
            }
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              let value = cssValueToJs(mapped.value, d.important, mapped.prop);
              if (mapped.prop === "content" && typeof value === "string") {
                value = normalizeCssContentValue(value);
              }
              if (
                typeof value === "string" ||
                typeof value === "number" ||
                typeof value === "boolean"
              ) {
                if (
                  !setValueForProp(
                    mapped.prop,
                    staticValueToLiteral(j, value) as ExpressionKind,
                    media,
                    computedMediaKeyExpr,
                    pseudoEntries,
                  )
                ) {
                  return null;
                }
              } else {
                return null;
              }
            }
            continue;
          }
          if (d.value.kind !== "interpolated") {
            return null;
          }
          // Resolve interpolated animation declarations referencing keyframes identifiers
          if (
            (d.property === "animation" || d.property === "animation-name") &&
            ctx.keyframesNames &&
            ctx.keyframesNames.size > 0
          ) {
            const expanded = expandInterpolatedAnimationShorthand({
              property: d.property,
              valueRaw: d.valueRaw,
              slotExprById,
              keyframesNames: ctx.keyframesNames,
              j,
              inlineKeyframeNameMap: ctx.inlineKeyframeNameMap,
            });
            if (expanded) {
              if (!applyExpandedAnimation(expanded)) {
                return null;
              }
              continue;
            }
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
          const slotExprNode = slotExpr as ExpressionKind;
          const slotValueExpr =
            slotExprNode.type === "ArrowFunctionExpression" ||
            slotExprNode.type === "FunctionExpression"
              ? getFunctionBodyExpr(slotExprNode)
              : slotExprNode;
          if (!slotValueExpr) {
            return null;
          }
          const localBindings =
            slotExprNode.type === "ArrowFunctionExpression" ||
            slotExprNode.type === "FunctionExpression"
              ? getArrowFnParamBindings(slotExprNode as ArrowFunctionNode)
              : undefined;
          const rawExpr = replaceParamWithProps(
            slotValueExpr,
            getFunctionParamName(slotExprNode),
            localBindings ?? undefined,
          );
          let resolvedExpr: ExpressionKind = rawExpr;
          if (rawExpr.type === "CallExpression") {
            const resolvedCall = tryResolveAdapterCall(rawExpr, d.property, {
              resolveCall,
              resolveImportInScope,
              parseExpr,
              resolverImports,
              filePath,
            });
            if (resolvedCall) {
              resolvedExpr = resolvedCall.ast as ExpressionKind;
            }
          }
          const memberPath =
            paramName && isMemberExpression(slotExpr)
              ? getMemberPathFromIdentifier(slotExpr as any, paramName)
              : null;
          if (rawExpr.type !== "CallExpression" && memberPath?.[0] === "theme") {
            const themePath = memberPath.slice(1).join(".");
            const resolved = resolveValue({
              kind: "theme",
              path: themePath,
              filePath,
              loc: getNodeLocStart(slotExpr) ?? undefined,
            });
            if (!resolved || "directional" in resolved || resolved.usage === "props") {
              return null;
            }
            registerImports(resolved.imports, resolverImports);
            const parsed = parseExpr(resolved.expr);
            if (!parsed) {
              return null;
            }
            resolvedExpr = parsed as ExpressionKind;
          }
          const { prefix, suffix } = extractStaticPartsForDecl(d);
          const valueExpr =
            prefix || suffix
              ? buildTemplateWithStaticParts(j, resolvedExpr, prefix, suffix)
              : resolvedExpr;
          for (const mapped of cssDeclarationToStylexDeclarations(d)) {
            if (
              !setValueForProp(mapped.prop, valueExpr, media, computedMediaKeyExpr, pseudoEntries)
            ) {
              return null;
            }
          }
        }
      }

      // Merge @media values into the output map as nested StyleX objects:
      // { default: baseValue, "@media (...)": mediaValue }
      // Also handles computed media keys: { default: baseValue, [breakpoints.phone]: mediaValue }
      const allMediaProps = new Set([...mediaValues.keys(), ...computedMediaValues.keys()]);
      for (const prop of allMediaProps) {
        const baseValue = out.get(prop);
        const properties = [
          j.property(
            "init",
            j.identifier("default"),
            baseValue ?? (j.literal(null) as unknown as ExpressionKind),
          ),
        ];
        const queries = mediaValues.get(prop);
        if (queries) {
          for (const [query, value] of queries) {
            properties.push(j.property("init", j.literal(query), value));
          }
        }
        const computed = computedMediaValues.get(prop);
        if (computed) {
          for (const { keyExpr, value } of computed) {
            const p = j.property("init", keyExpr as ExpressionKind, value);
            (p as { computed?: boolean }).computed = true;
            properties.push(p);
          }
        }
        out.set(prop, j.objectExpression(properties) as unknown as ExpressionKind);
      }

      if (opts?.requireResolvedPseudoSelector && !sawInterpolatedPseudoSelector) {
        return null;
      }

      if (runtimePseudoAliases.length > 0) {
        inlineMapPseudoAliases.set(out, runtimePseudoAliases);
      }
      return out;
    };

    const inlineMapPseudoAliases = new WeakMap<Map<string, ExpressionKind>, RuntimePseudoAlias[]>();
    const inlineMapPseudoRootDefaults = new WeakMap<object, true>();

    type DynamicPropEntry = { jsxProp: string; stylexProp: string; callArg?: ExpressionKind };

    // Bucket a single optional prop's dynamic style into static `prop === value` variants when
    // consumer usage is exhaustively observed. `buildStyle` computes the evaluated style for one
    // observed value, or returns null to bail the whole optimization (non-static value). Only
    // values for which `testInfo.when` holds get a bucket.
    const tryApplyObservedVariants = (
      testInfo: TestInfo,
      propName: string,
      buildStyle: (propValue: string | number) => Record<string, unknown> | null,
    ): boolean => {
      const observedValues = resolveObservedVariantValues({
        usage: ctx.propUsageByComponent?.get(decl.localName),
        propName,
        isOptional: isJsxPropOptional(propName),
        isExported: ctx.exportedComponentNames.has(decl.localName),
        escapesAsValue: ctx.componentsUsedAsValue.has(decl.localName),
      });
      const testExpr = parseExpr(testInfo.when);
      if (!observedValues || !testExpr) {
        return false;
      }
      return emitObservedVariantBuckets({
        decl,
        propName,
        observedValues,
        applyVariant,
        ensurePropDrop: (prop) => ensureShouldForwardPropDrop(decl, prop),
        buildBucket: (propValue) => {
          const testValue = evaluateObservedDynamicExpression({
            j,
            root,
            expression: testExpr,
            propName,
            propValue,
          });
          if (testValue !== true) {
            return { kind: "skip" };
          }
          const style = buildStyle(propValue);
          return style === null ? { kind: "bail" } : { kind: "emit", style };
        },
      });
    };

    const tryApplyObservedDynamicPropVariants = (
      testInfo: TestInfo,
      dynamicProps: DynamicPropEntry[],
    ): boolean => {
      if (dynamicProps.length === 0) {
        return false;
      }
      const propNames = [...new Set(dynamicProps.map((entry) => entry.jsxProp))];
      if (propNames.length !== 1) {
        return false;
      }
      const propName = propNames[0]!;
      return tryApplyObservedVariants(testInfo, propName, (propValue) => {
        const style: Record<string, unknown> = {};
        for (const dyn of dynamicProps) {
          if (!dyn.callArg) {
            return null;
          }
          const cssValue = evaluateObservedDynamicExpression({
            j,
            root,
            expression: dyn.callArg,
            propName,
            propValue,
          });
          if (typeof cssValue !== "string" && typeof cssValue !== "number") {
            return null;
          }
          style[dyn.stylexProp] = cssValue;
        }
        return style;
      });
    };

    const tryApplyObservedRuntimeStyleVariants = (
      testInfo: TestInfo,
      style: Record<string, unknown>,
      basePropNames: ReadonlySet<string>,
    ): boolean => {
      if (Object.keys(style).length === 0 || basePropNames.size !== 1) {
        return false;
      }
      const propName = [...basePropNames][0]!;
      return tryApplyObservedVariants(testInfo, propName, (propValue) => {
        const evaluatedStyle: Record<string, unknown> = {};
        for (const [stylexProp, value] of Object.entries(style)) {
          if (!value || typeof value !== "object") {
            evaluatedStyle[stylexProp] = value;
            continue;
          }
          const cssValue = evaluateObservedDynamicExpression({
            j,
            root,
            expression: value,
            propName,
            propValue,
          });
          if (typeof cssValue !== "string" && typeof cssValue !== "number") {
            return null;
          }
          evaluatedStyle[stylexProp] = cssValue;
        }
        return evaluatedStyle;
      });
    };

    const sameVariantCondition = (left: string, right: string): boolean =>
      normalizeTransientWhen(left) === normalizeTransientWhen(right);

    const hasParenthesizedLogicalOperator = (when: string): boolean =>
      /\([^)]*(?:&&|\|\|)[^)]*\)/.test(when);

    const composeVariantTestInfo = (outer: TestInfo, inner: TestInfo): TestInfo | null => {
      if (
        hasParenthesizedLogicalOperator(outer.when) ||
        hasParenthesizedLogicalOperator(inner.when)
      ) {
        return null;
      }
      const outerProps = outer.allPropNames ?? (outer.propName ? [outer.propName] : []);
      const innerProps = inner.allPropNames ?? (inner.propName ? [inner.propName] : []);
      const allPropNames = [...new Set([...outerProps, ...innerProps])];
      return {
        when: `${outer.when} && ${inner.when}`,
        propName: inner.propName ?? outer.propName,
        ...(allPropNames.length > 0 ? { allPropNames } : {}),
      };
    };

    const parseRuntimeConditionalTestInfo = (test: ExpressionKind): TestInfo | null => {
      const parsed = parseChainedTestInfo(test);
      if (parsed) {
        return parsed;
      }
      if (test.type === "Identifier" && (test as { name?: string }).name?.startsWith("$")) {
        const propName = (test as { name: string }).name;
        return { when: propName, propName };
      }
      if (test.type === "UnaryExpression" && (test as { operator?: string }).operator === "!") {
        const argument = (test as { argument?: ExpressionKind }).argument;
        if (
          argument?.type === "Identifier" &&
          (argument as { name?: string }).name?.startsWith("$")
        ) {
          const propName = (argument as { name: string }).name;
          return { when: `!${propName}`, propName };
        }
      }
      return null;
    };

    const splitStaticConditionalExpression = (
      value: unknown,
    ): {
      testInfo: TestInfo;
      consequentValue: string | number;
      alternateValue: string | number;
    } | null => {
      if (!value || typeof value !== "object") {
        return null;
      }
      const node = value as ASTNodeRecord;
      if (node.type !== "ConditionalExpression") {
        return null;
      }
      const testInfo = parseRuntimeConditionalTestInfo(node.test as ExpressionKind);
      if (!testInfo) {
        return null;
      }
      const consequentValue = staticValueFromExpression(node.consequent);
      const alternateValue = staticValueFromExpression(node.alternate);
      if (
        (typeof consequentValue !== "string" && typeof consequentValue !== "number") ||
        (typeof alternateValue !== "string" && typeof alternateValue !== "number")
      ) {
        return null;
      }
      return { testInfo, consequentValue, alternateValue };
    };

    const referencesRuntimeStyleValue = (value: unknown): boolean =>
      !!value &&
      typeof value === "object" &&
      referencesRuntimeValue(styleValueToExpression(j, value));

    const splitStaticConditionalRuntimeStyle = (
      testInfo: TestInfo,
      style: Record<string, unknown>,
    ): {
      baseStyle: Record<string, unknown>;
      remainingStyle: Record<string, unknown>;
      variants: Array<{ testInfo: TestInfo; style: Record<string, unknown> }>;
    } | null => {
      const baseStyle: Record<string, unknown> = {};
      const remainingStyle: Record<string, unknown> = {};
      const variants: Array<{ testInfo: TestInfo; style: Record<string, unknown> }> = [];
      let splitAny = false;

      for (const [stylexProp, value] of Object.entries(style)) {
        const split = splitStaticConditionalExpression(value);
        if (!split) {
          if (referencesRuntimeStyleValue(value)) {
            remainingStyle[stylexProp] = value;
          } else {
            baseStyle[stylexProp] = value;
          }
          continue;
        }

        splitAny = true;
        const innerWhen = split.testInfo.when;
        const outerWhen = testInfo.when;
        const invertedInnerWhen = invertWhen(innerWhen);
        if (sameVariantCondition(innerWhen, outerWhen)) {
          baseStyle[stylexProp] = split.consequentValue;
        } else if (invertedInnerWhen && sameVariantCondition(invertedInnerWhen, outerWhen)) {
          baseStyle[stylexProp] = split.alternateValue;
        } else {
          baseStyle[stylexProp] = split.alternateValue;
          const composedTestInfo = composeVariantTestInfo(testInfo, split.testInfo);
          if (!composedTestInfo) {
            return null;
          }
          variants.push({
            testInfo: composedTestInfo,
            style: { [stylexProp]: split.consequentValue },
          });
        }
      }

      return splitAny ? { baseStyle, remainingStyle, variants } : null;
    };

    const applyStaticConditionalRuntimeStyleVariants = (
      testInfo: TestInfo,
      style: Record<string, unknown>,
    ): Record<string, unknown> | null => {
      const split = splitStaticConditionalRuntimeStyle(testInfo, style);
      if (!split) {
        return null;
      }

      if (Object.keys(split.baseStyle).length > 0) {
        applyVariant(testInfo, split.baseStyle);
      }
      for (const variant of split.variants) {
        applyVariant(variant.testInfo, variant.style);
      }
      dropAllTestInfoProps(testInfo);
      return split.remainingStyle;
    };

    const tryApplyRuntimeStyleFunction = (
      testInfo: TestInfo,
      style: Record<string, unknown>,
      opts?: {
        dynamicProps?: DynamicPropEntry[];
      },
    ): boolean => {
      const importedStylexIdentifiers = getImportedStylexIdentifiers(importMap, resolverImports);
      const basePropNames = collectRuntimeStylePropNames(
        style,
        importMap,
        importedStylexIdentifiers,
      );
      const referencesTheme = styleReferencesRuntimeTheme(style);
      const dynamicProps = opts?.dynamicProps ?? [];
      if (basePropNames.size === 0 && dynamicProps.length === 0 && !referencesTheme) {
        return false;
      }

      if (!referencesTheme) {
        const remainingStyle = applyStaticConditionalRuntimeStyleVariants(testInfo, style);
        if (remainingStyle) {
          if (Object.keys(remainingStyle).length === 0 && dynamicProps.length === 0) {
            return true;
          }
          return tryApplyRuntimeStyleFunction(testInfo, remainingStyle, opts);
        }
      }

      if (
        !referencesTheme &&
        tryApplyObservedRuntimeStyleVariants(testInfo, style, basePropNames)
      ) {
        return true;
      }

      if (
        Object.keys(style).length === 0 &&
        !referencesTheme &&
        tryApplyObservedDynamicPropVariants(testInfo, dynamicProps)
      ) {
        return true;
      }

      if (Object.keys(style).length === 0 && dynamicProps.length > 0 && !referencesTheme) {
        for (const dyn of dynamicProps) {
          const fnKey = styleKeyWithSuffix(decl.styleKey, dyn.stylexProp);
          const isGuardedBySameProp =
            !!testInfo.propName &&
            normalizeTransientPropName(dyn.jsxProp) ===
              normalizeTransientPropName(testInfo.propName);
          const conditionWhen = isGuardedBySameProp ? undefined : testInfo.when;
          const condition = isGuardedBySameProp ? ("truthy" as const) : undefined;
          if (!styleFnDecls.has(fnKey)) {
            const dynParamName = cssPropertyToIdentifier(dyn.stylexProp, avoidNames);
            const param = j.identifier(dynParamName);
            annotateParamFromJsxProp(param, dyn.jsxProp);
            const p = makeCssProperty(j, dyn.stylexProp, dynParamName);
            const bodyExpr = j.objectExpression([p]);
            styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
          }
          if (
            !styleFnFromProps.some(
              (p) =>
                p.fnKey === fnKey &&
                p.jsxProp === dyn.jsxProp &&
                p.condition === condition &&
                p.conditionWhen === conditionWhen,
            )
          ) {
            styleFnFromProps.push({
              fnKey,
              jsxProp: dyn.jsxProp,
              ...(condition ? { condition } : {}),
              ...(conditionWhen ? { conditionWhen } : {}),
            });
          }
          ensureShouldForwardPropDrop(decl, dyn.jsxProp);
        }
        for (const propName of testInfo.allPropNames ??
          (testInfo.propName ? [testInfo.propName] : [])) {
          if (propName) {
            ensureShouldForwardPropDrop(decl, propName);
          }
        }
        decl.needsWrapperComponent = true;
        return true;
      }

      const runtimeStyle = { ...style };
      for (const dyn of dynamicProps) {
        runtimeStyle[dyn.stylexProp] = j.memberExpression(
          j.identifier("props"),
          j.identifier(normalizeTransientPropName(dyn.jsxProp)),
        );
      }

      const propNames = collectRuntimeStylePropNames(
        runtimeStyle,
        importMap,
        importedStylexIdentifiers,
      );

      for (const propName of testInfo.allPropNames ??
        (testInfo.propName ? [testInfo.propName] : [])) {
        if (propName) {
          propNames.add(normalizeTransientPropName(propName));
        }
      }

      const fnKey = ensureUniqueKey(
        [styleFnDecls as Map<string, unknown>, extraStyleObjects, resolvedStyleObjects],
        styleKeyWithSuffix(
          decl.styleKey,
          testInfo.propName ? normalizeTransientPropName(testInfo.propName) : "dynamic",
        ),
      );
      const params = [j.identifier("props")];
      if (referencesTheme) {
        params.push(j.identifier("theme"));
      }

      const callArg = j.objectExpression(
        [...propNames].sort().map((propName) => {
          const id = j.identifier(propName);
          const prop = j.property("init", id, id) as ReturnType<typeof j.property> & {
            shorthand?: boolean;
          };
          prop.shorthand = true;
          return prop;
        }),
      ) as ExpressionKind;
      const addRuntimeStyleFn = (key: string, body: ExpressionKind): void => {
        styleFnDecls.set(
          key,
          j.arrowFunctionExpression(
            params.map((param) => cloneAstNode(param)),
            body,
          ),
        );
        styleFnFromProps.push({
          fnKey: key,
          jsxProp: "__props",
          callArg: cloneAstNode(callArg) as ExpressionKind,
          conditionWhen: testInfo.when,
          ...(referencesTheme
            ? {
                extraCallArgs: [
                  {
                    jsxProp: "__helper" as const,
                    callArg: j.identifier("theme") as ExpressionKind,
                  },
                ],
              }
            : {}),
        });
      };

      const styleProperties = Object.entries(runtimeStyle).flatMap(([prop, value]) => {
        const { expression, customProps } = bridgeRuntimePseudoColorValues(
          j,
          fnKey,
          prop,
          toRuntimeStyleExpression(j, value, importedStylexIdentifiers),
        );
        return [...customProps, j.property("init", makeCssPropKey(j, prop), expression)];
      });
      addRuntimeStyleFn(fnKey, j.objectExpression(styleProperties) as ExpressionKind);

      for (const propName of propNames) {
        ensureShouldForwardPropDrop(decl, propName);
      }
      if (referencesTheme) {
        decl.needsUseThemeHook ??= [];
        if (!decl.needsUseThemeHook.some((entry) => entry.themeProp === "__runtime")) {
          decl.needsUseThemeHook.push({
            themeProp: "__runtime",
            trueStyleKey: null,
            falseStyleKey: null,
          });
        }
      }
      decl.needsWrapperComponent = true;
      return true;
    };

    const applyStaticPseudoAliasVariants = (
      testInfo: TestInfo,
      style: Record<string, unknown>,
      pseudoAliases: RuntimePseudoAlias[],
    ): boolean => {
      let rootStyle = style;
      for (const pseudoAlias of pseudoAliases) {
        const split = splitStaticPseudoAliasStyle(
          j,
          rootStyle,
          pseudoAlias.pseudoNames,
          pseudoAlias.pseudoKeys,
          inlineMapPseudoRootDefaults,
          (propName) =>
            !hasPriorRootStyleFnForProps(styleFnFromProps, styleFnDecls, new Set([propName])),
        );
        const { pseudoAliasStyles } = split;
        if (!pseudoAliasStyles) {
          return false;
        }
        if (styleReferencesRuntimeTheme(Object.fromEntries(pseudoAliasStyles))) {
          return false;
        }
        const importedStylexIdentifiers = getImportedStylexIdentifiers(importMap, resolverImports);
        for (const pseudoStyle of pseudoAliasStyles.values()) {
          if (
            collectRuntimeStylePropNames(pseudoStyle, importMap, importedStylexIdentifiers).size > 0
          ) {
            warnings.push({
              severity: "warning",
              type: "Conditional `css` block: runtime pseudo-alias styles are not supported",
              loc: decl.loc,
            });
            return false;
          }
        }

        const styleKeys: string[] = [];
        const guardBase = styleKeyWithSuffix(decl.styleKey, testInfo.when);
        for (const pseudoName of pseudoAlias.pseudoNames) {
          const styleKey = ensureUniqueKey(
            [styleFnDecls as Map<string, unknown>, extraStyleObjects, resolvedStyleObjects],
            `${guardBase}Pseudo${capitalize(kebabToCamelCase(pseudoName))}`,
          );
          const pseudoStyle = pseudoAliasStyles.get(pseudoName);
          if (!pseudoStyle) {
            return false;
          }
          styleKeys.push(styleKey);
          extraStyleObjects.set(styleKey, pseudoStyle);
        }

        const aliasPropNames = collectStylePropNames(pseudoAliasStyles.values());
        const canApplySourceOrder =
          !hasRootStyleForProps(styleObj, aliasPropNames) &&
          !hasRootStyleForProps(split.rootStyle, aliasPropNames) &&
          !hasPriorRootStyleFnForProps(styleFnFromProps, styleFnDecls, aliasPropNames);
        const sourceOrder = canApplySourceOrder ? allocateSourceOrder() : undefined;
        decl.pseudoAliasSelectors ??= [];
        decl.pseudoAliasSelectors.push({
          styleKeys,
          styleSelectorExpr: cloneAstNode(pseudoAlias.styleSelectorExpr),
          pseudoNames: pseudoAlias.pseudoNames,
          guard: { when: testInfo.when },
          ...(sourceOrder !== undefined ? { sourceOrder } : {}),
        });
        rootStyle = split.rootStyle;
      }

      if (Object.keys(rootStyle).length > 0) {
        if (!tryApplyRuntimeStyleFunction(testInfo, rootStyle)) {
          const rootStyleKey = ensureUniqueKey(
            [styleFnDecls as Map<string, unknown>, extraStyleObjects, resolvedStyleObjects],
            `${styleKeyWithSuffix(decl.styleKey, testInfo.when)}Root`,
          );
          extraStyleObjects.set(rootStyleKey, rootStyle);
          decl.pseudoExpandSelectors ??= [];
          decl.pseudoExpandSelectors.push({
            styleKey: rootStyleKey,
            guard: { when: normalizeTransientWhen(testInfo.when) },
          });
        }
      }

      dropAllTestInfoProps(testInfo);
      decl.needsWrapperComponent = true;
      return true;
    };

    // Handle LogicalExpression: props.$x && css`...` or chained: props.$x && props.$y && css`...`
    const body = expr.body;
    if (body?.type === "LogicalExpression" && body.operator === "&&") {
      if (
        pseudoElement &&
        (isCssHelperTaggedTemplate(body.right) ||
          body.right?.type === "TemplateLiteral" ||
          body.right?.type === "StringLiteral" ||
          (body.right?.type === "Literal" && typeof body.right.value === "string"))
      ) {
        return bailPseudoElementConditional();
      }
      // Use parseChainedTestInfo to handle both simple and chained && conditions
      const testInfo = parseChainedTestInfo(body.left);
      if (!testInfo) {
        return false;
      }
      if (isCssHelperTaggedTemplate(body.right)) {
        const inlineMap = resolveCssBranchToInlineMap(body.right as ExpressionKind, {
          requireResolvedPseudoSelector: true,
        });
        if (inlineMap) {
          const inlineStyle = Object.fromEntries(inlineMap);
          const pseudoAliases = inlineMapPseudoAliases.get(inlineMap);
          if (pseudoAliases) {
            const handled = applyStaticPseudoAliasVariants(testInfo, inlineStyle, pseudoAliases);
            if (!handled) {
              markBail();
            }
          } else if (!tryApplyRuntimeStyleFunction(testInfo, inlineStyle)) {
            applyVariant(testInfo, inlineStyle);
          }
          return true;
        }
        const cssNode = body.right as { quasi: ExpressionKind };
        const resolved = resolveCssHelperTemplate(
          cssNode.quasi,
          paramName,
          decl.loc,
          cssHelperTemplateOptions,
        );
        if (!resolved) {
          markBail();
          return true;
        }
        const { style: consStyle, dynamicProps, conditionalVariants } = resolved;

        if (tryApplyRuntimeStyleFunction(testInfo, consStyle, { dynamicProps })) {
          applyConditionalVariantsInline(conditionalVariants, testInfo.when);
          dropAllTestInfoProps(testInfo);
          return true;
        }

        if (dynamicProps.length > 0) {
          const propName = testInfo.propName;
          const isComparison = testInfo.when.includes("===") || testInfo.when.includes("!==");
          if (!propName || testInfo.when.startsWith("!") || isComparison) {
            return false;
          }
          for (const dyn of dynamicProps) {
            const fnKey = styleKeyWithSuffix(decl.styleKey, dyn.stylexProp);
            const conditionWhen =
              normalizeTransientPropName(dyn.jsxProp) === normalizeTransientPropName(propName)
                ? undefined
                : testInfo.when;
            if (!styleFnDecls.has(fnKey)) {
              const dynParamName = cssPropertyToIdentifier(dyn.stylexProp, avoidNames);
              const param = j.identifier(dynParamName);
              annotateParamFromJsxProp(param, dyn.jsxProp);
              const p = makeCssProperty(j, dyn.stylexProp, dynParamName);
              const bodyExpr = j.objectExpression([p]);
              styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
            }
            if (
              !styleFnFromProps.some(
                (p) =>
                  p.fnKey === fnKey &&
                  p.jsxProp === dyn.jsxProp &&
                  p.condition === "truthy" &&
                  p.conditionWhen === conditionWhen,
              )
            ) {
              styleFnFromProps.push({
                fnKey,
                jsxProp: dyn.jsxProp,
                condition: "truthy",
                ...(conditionWhen ? { conditionWhen } : {}),
              });
            }
            ensureShouldForwardPropDrop(decl, dyn.jsxProp);
          }
        }

        if (Object.keys(consStyle).length > 0) {
          applyVariant(testInfo, consStyle);
        }

        // Apply conditional variants from nested ternaries within the css block
        applyConditionalVariantsInline(conditionalVariants, testInfo.when);

        // Ensure the outer condition's props are dropped from DOM forwarding.
        // This covers the case where all styles ended up as conditional variants
        // (e.g., theme ternary) and consStyle is empty, so applyVariant was never called.
        dropAllTestInfoProps(testInfo);

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
          const resolved = resolveTemplateLiteralBranch(tplCtx, {
            node: body.right,
            paramName,
            bindings,
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
              const fnKey = styleKeyWithSuffix(decl.styleKey, entry.stylexProp);
              if (!styleFnDecls.has(fnKey)) {
                const entryParamName = cssPropertyToIdentifier(entry.stylexProp, avoidNames);
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
        const rawCss = tpl.quasis?.map((q) => q.value?.cooked ?? q.value?.raw ?? "").join("") ?? "";
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
      entries: Array<{
        jsxProp: string;
        stylexProp: string;
        callArg: ExpressionKind;
        condition?: "always";
      }>,
      conditionWhen?: string,
    ): void => {
      const inferParamTypeFromCallArg = (
        callArg: ExpressionKind,
        condition?: "always",
      ): ASTNode | null => {
        if (callArg.type === "TemplateLiteral") {
          return j.tsStringKeyword();
        }
        // ConditionalExpression with theme-resolved branches (condition: "always")
        // produces string values (StyleXVar<string>), not the original prop type.
        if (callArg.type === "ConditionalExpression" && condition === "always") {
          return j.tsStringKeyword();
        }
        const staticValue = literalToStaticValue(callArg);
        if (typeof staticValue === "string") {
          return j.tsStringKeyword();
        }
        if (typeof staticValue === "number") {
          return j.tsNumberKeyword();
        }
        if (typeof staticValue === "boolean") {
          return j.tsBooleanKeyword();
        }
        return null;
      };

      for (const entry of entries) {
        const fnKey = styleKeyWithSuffix(decl.styleKey, entry.stylexProp);
        if (!styleFnDecls.has(fnKey)) {
          const entryParamName = cssPropertyToIdentifier(entry.stylexProp, avoidNames);
          const param = j.identifier(entryParamName);
          const inferredParamType = inferParamTypeFromCallArg(entry.callArg, entry.condition);
          if (inferredParamType) {
            (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
              inferredParamType as any,
            );
          } else {
            annotateParamFromJsxProp(param, entry.jsxProp);
          }
          const p = makeCssProperty(j, entry.stylexProp, entryParamName);
          const bodyExpr = j.objectExpression([p]);
          styleFnDecls.set(fnKey, j.arrowFunctionExpression([param], bodyExpr));
        }
        if (
          !styleFnFromProps.some(
            (p) =>
              p.fnKey === fnKey && p.jsxProp === entry.jsxProp && p.conditionWhen === conditionWhen,
          )
        ) {
          styleFnFromProps.push({
            fnKey,
            jsxProp: entry.jsxProp,
            condition: entry.condition,
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

    const tryApplyFiniteUnionStaticMap = (args: {
      map: Map<string, ExpressionKind>;
      test: ExpressionKind;
      propName: string;
      paramName: string | null;
    }): boolean => {
      const unionValues = extractUnionLiteralValues(findJsxPropTsType(args.propName));
      if (!unionValues || unionValues.length < 2 || unionValues.length > 20) {
        return false;
      }

      const buckets: Array<{ propValue: string | number; style: Record<string, unknown> }> = [];
      for (const propValue of unionValues) {
        const testValue = evaluateObservedDynamicExpression({
          j,
          root,
          expression: args.test,
          propName: args.propName,
          propValue,
          paramName: args.paramName,
        });
        if (typeof testValue !== "boolean") {
          return false;
        }
        if (!testValue) {
          continue;
        }
        const style: Record<string, unknown> = {};
        for (const [stylexProp, valueExpr] of args.map) {
          const cssValue = evaluateObservedDynamicExpression({
            j,
            root,
            expression: valueExpr,
            propName: args.propName,
            propValue,
            paramName: args.paramName,
          });
          if (typeof cssValue !== "string" && typeof cssValue !== "number") {
            return false;
          }
          style[stylexProp] = cssValue;
        }
        if (Object.keys(style).length > 0) {
          buckets.push({ propValue, style });
        }
      }
      if (buckets.length === 0) {
        return false;
      }
      for (const { propValue, style } of buckets) {
        applyVariant(
          {
            when: formatObservedVariantCondition(args.propName, propValue),
            propName: args.propName,
          },
          style,
        );
      }
      decl.variantLookupCastProps ??= new Set<string>();
      decl.variantLookupCastProps.add(args.propName);
      ensureShouldForwardPropDrop(decl, args.propName);
      return true;
    };

    // Handle direct TemplateLiteral body: (props) => `width: ${props.$width}px;`
    // Applies styles unconditionally - static styles merge into base, dynamic become style functions.
    if (body?.type === "TemplateLiteral") {
      const resolved = resolveTemplateLiteralBranch(tplCtx, {
        node: body,
        paramName,
        bindings,
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
          // Type inferred from component's prop types (e.g. { size: number | string })
          const propsTypeProperties = valuePropParams.map((p) => {
            const propName = p.startsWith("$") ? p.slice(1) : p;
            const prop = j.tsPropertySignature(
              j.identifier(propName),
              j.tsTypeAnnotation(resolveStyleFnPropType(p) as any),
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

    if (pseudoElement) {
      return bailPseudoElementConditional();
    }

    const testInfo = parseChainedTestInfo(conditional.test);

    // Handle block-level theme conditionals (e.g., props.theme.isDark ? "color: white;" : "color: black;")
    // by resolving both branches and emitting theme-conditional style objects.
    if (isThemeAccessTest(conditional.test, paramName)) {
      const handled = tryResolveBlockLevelThemeConditional({
        conditional,
        paramName,
        replaceParamWithProps,
        isPlainTemplateLiteral,
        isCssHelperTaggedTemplate,
        resolveStaticCssBlock,
        decl,
        extraStyleObjects,
        pseudos: pseudos ?? null,
        j,
        filePath,
        parseExpr,
        resolveValue,
        resolveCall,
        resolveImportInScope,
        resolverImports,
        componentInfo,
        handlerContext,
        warnings,
        keyframesNames: ctx.keyframesNames,
        inlineKeyframeNameMap: ctx.inlineKeyframeNameMap,
      });
      if (handled) {
        return true;
      }
      // Fall through to bail if resolution failed
      const loc = getNodeLocStart(conditional.test);
      warnings.push({
        severity: "warning",
        type: "Theme-dependent block-level conditional could not be fully resolved (branches may contain dynamic interpolations)",
        loc: loc ?? decl.loc,
        context: {},
      });
      markBail();
      return true;
    }

    // Inside pseudo-class selectors, only theme conditionals are handled here.
    // Non-theme cases (call expressions, css blocks, template literals) fall
    // through to the existing pseudo-aware resolution paths.
    if (pseudos?.length) {
      return false;
    }

    const cons = conditional.consequent;
    const alt = conditional.alternate;
    const consIsCss = isCssHelperTaggedTemplate(cons);
    const altIsCss = isCssHelperTaggedTemplate(alt);
    const consIsTpl = isPlainTemplateLiteral(cons);
    const altIsTpl = isPlainTemplateLiteral(alt);
    const consIsEmpty = isEmptyCssBranch(cons);
    const altIsEmpty = isEmptyCssBranch(alt);
    const isNonEmptyStringLiteral = (node: ExpressionKind): boolean =>
      (node.type === "StringLiteral" && node.value !== "") ||
      (node.type === "Literal" &&
        typeof (node as { value?: unknown }).value === "string" &&
        (node as { value: string }).value !== "");
    const consIsStr = isNonEmptyStringLiteral(cons);
    const altIsStr = isNonEmptyStringLiteral(alt);

    // Shared helper: replace `props.X` member expressions with bare `X` identifiers
    // in a cloned AST node. Used when converting from object-param to single-param style.
    const replacePropsWithBareIdent = (node: ExpressionKind): ExpressionKind => {
      const cloned = cloneAstNode(node);
      const visit = (n: unknown): unknown => {
        if (!n || typeof n !== "object") {
          return n;
        }
        if (Array.isArray(n)) {
          return n.map((c) => visit(c));
        }
        const rec = n as ASTNodeRecord;
        if (
          isMemberExpression(rec) &&
          (rec.object as { type?: string; name?: string })?.type === "Identifier" &&
          (rec.object as { name?: string })?.name === "props" &&
          (rec.property as { type?: string; name?: string })?.type === "Identifier" &&
          !rec.computed
        ) {
          return j.identifier((rec.property as { name: string }).name);
        }
        for (const key of Object.keys(rec)) {
          if (key === "loc" || key === "comments") {
            continue;
          }
          const child = rec[key];
          if (child && typeof child === "object") {
            rec[key] = visit(child);
          }
        }
        return rec;
      };
      return visit(cloned) as ExpressionKind;
    };

    // Shared helper: detect a ternary expression in the CSS property name position of a
    // template literal, and return substituted templates for each branch.
    // e.g., `${column ? "column" : "row"}-gap: ${wrapGap}px` →
    //   consTpl: `column-gap: ${wrapGap}px`, altTpl: `row-gap: ${wrapGap}px`
    const findTernaryPropertySplit = (
      tplNode: ExpressionKind,
      skipIndices?: Set<number>,
    ): {
      ternaryTest: ExpressionKind;
      consTpl: ExpressionKind;
      altTpl: ExpressionKind;
      ternaryCondName: string | null;
      ternaryIdx: number;
    } | null => {
      const tpl = tplNode as {
        type: string;
        quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
        expressions?: ExpressionKind[];
      };
      if (tpl.type !== "TemplateLiteral") {
        return null;
      }
      const quasis = tpl.quasis ?? [];
      const expressions = tpl.expressions ?? [];

      // Find a ConditionalExpression whose next quasi contains ":" (property name position)
      let ternaryIdx = -1;
      let fallbackIdx = -1;
      for (let i = 0; i < expressions.length; i++) {
        if (skipIndices?.has(i)) {
          continue;
        }
        const exprNode = expressions[i]!;
        if (exprNode.type !== "ConditionalExpression") {
          continue;
        }
        const cond = exprNode as {
          test: ExpressionKind;
          consequent: ExpressionKind;
          alternate: ExpressionKind;
        };
        const consVal = literalToStaticValue(cond.consequent);
        const altVal = literalToStaticValue(cond.alternate);
        if (typeof consVal !== "string" || typeof altVal !== "string") {
          continue;
        }
        const nextQuasi = quasis[i + 1];
        const nextRaw = nextQuasi?.value?.raw ?? nextQuasi?.value?.cooked ?? "";
        if (nextRaw.includes(":")) {
          ternaryIdx = i;
          break;
        }
        // Track first valid ternary as fallback for value-position ternaries
        if (fallbackIdx < 0) {
          fallbackIdx = i;
        }
      }
      // Prefer property-name position ternary; fall back to value-position ternary
      if (ternaryIdx < 0) {
        ternaryIdx = fallbackIdx;
      }
      if (ternaryIdx < 0) {
        return null;
      }

      const ternaryExpr = expressions[ternaryIdx]! as {
        test: ExpressionKind;
        consequent: ExpressionKind;
        alternate: ExpressionKind;
      };
      const consStrVal = literalToStaticValue(ternaryExpr.consequent) as string;
      const altStrVal = literalToStaticValue(ternaryExpr.alternate) as string;

      // Build a substituted template by replacing the ternary with each branch's string
      const buildSubstitutedTpl = (branchValue: string) => {
        const newQuasis: Array<ReturnType<typeof j.templateElement>> = [];
        const newExpressions: ExpressionKind[] = [];
        for (let i = 0; i < quasis.length; i++) {
          const raw = quasis[i]?.value?.raw ?? quasis[i]?.value?.cooked ?? "";
          if (i === ternaryIdx) {
            const nextRaw = quasis[i + 1]?.value?.raw ?? quasis[i + 1]?.value?.cooked ?? "";
            const merged = raw + branchValue + nextRaw;
            newQuasis.push(
              j.templateElement({ raw: merged, cooked: merged }, i + 1 === quasis.length - 1),
            );
            i++;
          } else {
            newQuasis.push(j.templateElement({ raw, cooked: raw }, i === quasis.length - 1));
          }
          if (i < expressions.length && i !== ternaryIdx) {
            newExpressions.push(expressions[i]!);
          }
        }
        return j.templateLiteral(newQuasis, newExpressions);
      };

      return {
        ternaryTest: ternaryExpr.test,
        consTpl: buildSubstitutedTpl(consStrVal) as ExpressionKind,
        altTpl: buildSubstitutedTpl(altStrVal) as ExpressionKind,
        ternaryCondName: extractConditionName(ternaryExpr.test),
        ternaryIdx,
      };
    };

    if (!testInfo) {
      // Non-prop conditional: generate StyleX parameterized style functions.
      // Only support css`` or template-literal CSS branches.

      // `typeof x === "type"` narrows that specific prop away from undefined,
      // so its style function parameter doesn't need `| undefined`.
      const typeofGuardProp = getTypeofGuardProp(conditional.test);

      const consMap =
        consIsCss || consIsTpl ? resolveCssBranchToInlineMap(cons) : consIsEmpty ? new Map() : null;
      const altMap =
        altIsCss || altIsTpl ? resolveCssBranchToInlineMap(alt) : altIsEmpty ? new Map() : null;
      if (!consMap || !altMap) {
        // Fallback: try splitting dynamic property name ternaries in the template literal
        const failedTplNode = consIsTpl && !consMap ? cons : altIsTpl && !altMap ? alt : null;
        const otherIsEmpty =
          consIsTpl && !consMap ? altIsEmpty : altIsTpl && !altMap ? consIsEmpty : false;
        if (failedTplNode && otherIsEmpty) {
          const splitResult = findTernaryPropertySplit(failedTplNode);
          if (splitResult) {
            const { ternaryTest, ternaryCondName } = splitResult;
            const splitConsMap = resolveCssBranchToInlineMap(splitResult.consTpl);
            const splitAltMap = resolveCssBranchToInlineMap(splitResult.altTpl);
            if (!splitConsMap || !splitAltMap) {
              return false;
            }

            const propsUsed = collectPropsFromArrowFn(expr);
            collectPropsFromExpressions(
              [...splitConsMap.values(), ...splitAltMap.values()],
              propsUsed,
            );
            const valuePropParams = Array.from(propsUsed);

            // Create style function and call for a resolved branch map.
            const makeBranchFnAndCall = (
              map: Map<string, ExpressionKind>,
              label: string,
            ): ExpressionKind => {
              if (map.size === 0) {
                return j.identifier("undefined") as ExpressionKind;
              }
              const mapEntries = Array.from(map.entries());
              const firstPropSuffix = capitalize(cssPropertyToIdentifier(mapEntries[0]![0]));
              const restPropSuffix = mapEntries
                .slice(1)
                .map(([cssProp]) => capitalize(cssPropertyToIdentifier(cssProp)))
                .join("");
              const branchSuffix = label
                ? `${label}${restPropSuffix}`
                : `${firstPropSuffix}${restPropSuffix}`;
              const fnKey = `${decl.styleKey}${branchSuffix}`;
              if (!styleFnDecls.has(fnKey) && !resolvedStyleObjects.has(fnKey)) {
                if (valuePropParams.length === 1) {
                  const singleProp = valuePropParams[0]!;
                  const paramIdent = singleProp.startsWith("$") ? singleProp.slice(1) : singleProp;
                  const param = j.identifier(paramIdent);
                  (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                    resolveStyleFnPropType(singleProp, {
                      required: singleProp === typeofGuardProp,
                    }) as any,
                  );
                  const properties = mapEntries.map(([cssProp, valueExpr]) =>
                    j.property(
                      "init",
                      makeCssPropKey(j, cssProp),
                      replacePropsWithBareIdent(normalizeDollarProps(j, valueExpr)),
                    ),
                  );
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([param], j.objectExpression(properties)),
                  );
                } else {
                  const propsTypeProperties = valuePropParams.map((p) => {
                    const propName = p.startsWith("$") ? p.slice(1) : p;
                    return j.tsPropertySignature(
                      j.identifier(propName),
                      j.tsTypeAnnotation(
                        resolveStyleFnPropType(p, { required: p === typeofGuardProp }) as any,
                      ),
                    );
                  });
                  const propsParam = j.identifier("props");
                  (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
                    j.tsTypeLiteral(propsTypeProperties),
                  );
                  const properties = mapEntries.map(([cssProp, valueExpr]) =>
                    j.property(
                      "init",
                      makeCssPropKey(j, cssProp),
                      normalizeDollarProps(j, valueExpr),
                    ),
                  );
                  styleFnDecls.set(
                    fnKey,
                    j.arrowFunctionExpression([propsParam], j.objectExpression(properties)),
                  );
                }
              }
              // Build call expression with bare identifiers (component destructures props)
              if (valuePropParams.length === 1) {
                const singleProp = valuePropParams[0]!;
                const paramIdent = singleProp.startsWith("$") ? singleProp.slice(1) : singleProp;
                return j.callExpression(
                  j.memberExpression(j.identifier("styles"), j.identifier(fnKey)),
                  [j.identifier(paramIdent) as ExpressionKind],
                );
              }
              const callArgProperties = valuePropParams.map((p) => {
                const propName = p.startsWith("$") ? p.slice(1) : p;
                return j.property.from({
                  kind: "init",
                  key: j.identifier(propName),
                  value: j.identifier(p),
                  shorthand: propName === p,
                });
              });
              return j.callExpression(
                j.memberExpression(j.identifier("styles"), j.identifier(fnKey)),
                [j.objectExpression(callArgProperties) as unknown as ExpressionKind],
              );
            };

            // When the ternary splits on the CSS property name, the properties already
            // differ (e.g. columnGap vs rowGap), so an extra condition label is redundant.
            const consLabel = ternaryCondName
              ? ""
              : capitalize(cssPropertyToIdentifier(Array.from(splitConsMap.keys())[0] ?? ""));
            const altLabel = ternaryCondName
              ? ""
              : capitalize(cssPropertyToIdentifier(Array.from(splitAltMap.keys())[0] ?? ""));
            const consCallExpr = makeBranchFnAndCall(splitConsMap, consLabel);
            const altCallExpr = makeBranchFnAndCall(splitAltMap, altLabel);

            // Build inner ternary: ternaryTest ? consCall : altCall
            const innerTernary = j.conditionalExpression(
              replacePropsWithBareIdent(ternaryTest as ExpressionKind),
              consCallExpr,
              altCallExpr,
            );

            // Build outer conditional: outerTest ? innerTernary : undefined
            // Replace props.X with bare X since the component destructures all props.
            const outerCondExpr = j.conditionalExpression(
              replacePropsWithBareIdent(conditional.test as ExpressionKind),
              innerTernary,
              j.identifier("undefined") as ExpressionKind,
            );

            decl.extraStylexPropsArgs ??= [];
            decl.extraStylexPropsArgs.push({ expr: outerCondExpr, afterVariants: true });
            decl.needsWrapperComponent = true;

            for (const propName of propsUsed) {
              ensureShouldForwardPropDrop(decl, propName);
            }
            // Collect only actual prop names from the ternary test expression.
            // Normalize param refs first (e.g., bare `column` → `props.column`),
            // then extract props via collectPropsFromExpressions which only picks
            // up `props.X` member accesses and `$`-prefixed identifiers.
            const ternaryPropNames = new Set<string>();
            const normalizedTest = replaceParamWithProps(ternaryTest as ExpressionKind);
            collectPropsFromExpressions([normalizedTest], ternaryPropNames);
            for (const prop of ternaryPropNames) {
              ensureShouldForwardPropDrop(decl, prop);
            }
            return true;
          }
        }
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

      if (
        valuePropParams.length === 1 &&
        consMap.size > 0 &&
        altMap.size === 0 &&
        tryApplyFiniteUnionStaticMap({
          map: consMap,
          test: conditional.test as ExpressionKind,
          propName: valuePropParams[0]!,
          paramName,
        })
      ) {
        decl.needsWrapperComponent = true;
        return true;
      }

      // Single-prop case: use direct parameter instead of props object
      // e.g., (gap: number) => ({ gap: `${gap}px` }) instead of (props: { gap: number }) => (...)
      const useSingleParam = valuePropParams.length === 1;
      const singlePropName = useSingleParam ? valuePropParams[0]! : "";
      const singleParamName = useSingleParam
        ? singlePropName.startsWith("$")
          ? singlePropName.slice(1)
          : singlePropName
        : "";

      const createStyleFn = (map: Map<string, ExpressionKind>) => {
        if (useSingleParam) {
          const param = j.identifier(singleParamName);
          (param as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
            resolveStyleFnPropType(singlePropName, {
              required: singlePropName === typeofGuardProp,
            }) as any,
          );

          const properties = Array.from(map.entries()).map(([prop, propExpr]) => {
            const replacedExpr = replacePropsWithBareIdent(normalizeDollarProps(j, propExpr));
            return j.property(
              "init",
              makeCssPropKey(j, prop),
              maybeOmitPxUnitFromStylexStyleValue(j, replacedExpr, prop) as ExpressionKind,
            );
          });
          return j.arrowFunctionExpression([param], j.objectExpression(properties));
        }

        const propsTypeProperties = valuePropParams.map((p) => {
          const propName = p.startsWith("$") ? p.slice(1) : p;
          const prop = j.tsPropertySignature(
            j.identifier(propName),
            j.tsTypeAnnotation(
              resolveStyleFnPropType(p, { required: p === typeofGuardProp }) as any,
            ),
          );
          return prop;
        });
        const propsParam = j.identifier("props");
        (propsParam as { typeAnnotation?: unknown }).typeAnnotation = j.tsTypeAnnotation(
          j.tsTypeLiteral(propsTypeProperties),
        );

        const properties = Array.from(map.entries()).map(([prop, propExpr]) => {
          const replacedExpr = normalizeDollarProps(j, propExpr);
          return j.property(
            "init",
            makeCssPropKey(j, prop),
            maybeOmitPxUnitFromStylexStyleValue(j, replacedExpr, prop) as ExpressionKind,
          );
        });
        return j.arrowFunctionExpression([propsParam], j.objectExpression(properties));
      };

      // Generate style function keys with descriptive names when possible
      const conditionName = extractConditionName(conditional.test);
      const { truthyKey: rawConsKey, falsyKey: rawAltKey } = buildConditionalStyleFnKeys(
        decl.styleKey,
        conditionName,
        consMap,
        altMap,
      );
      const uniqueKeyMaps = [resolvedStyleObjects, styleFnDecls as Map<string, unknown>];
      const consKey = ensureUniqueKey(uniqueKeyMaps, rawConsKey);
      const altKey = ensureUniqueKey(uniqueKeyMaps, rawAltKey);

      if (consMap.size > 0) {
        styleFnDecls.set(consKey, createStyleFn(consMap));
      }
      if (altMap.size > 0) {
        styleFnDecls.set(altKey, createStyleFn(altMap));
      }

      // Create function call expressions with bare prop identifiers.
      // The emitted component destructures props, so bare identifiers are always valid.
      const makeStyleCall = (key: string) => {
        if (useSingleParam) {
          return j.callExpression(j.memberExpression(j.identifier("styles"), j.identifier(key)), [
            j.identifier(singlePropName) as ExpressionKind,
          ]);
        }

        const callArgProperties = valuePropParams.map((p) => {
          const propName = p.startsWith("$") ? p.slice(1) : p;
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

      // Create conditional expression for stylex.props.
      // Replace props.X with bare X since the component destructures all props.
      const condExpr = j.conditionalExpression(
        replacePropsWithBareIdent(conditional.test as ExpressionKind),
        consMap.size > 0 ? makeStyleCall(consKey) : (j.identifier("undefined") as ExpressionKind),
        altMap.size > 0 ? makeStyleCall(altKey) : (j.identifier("undefined") as ExpressionKind),
      );

      // Add to extraStylexPropsArgs (afterVariants preserves CSS cascade: standalone
      // conditional interpolations appear after property-level declarations in the
      // template literal, so they must override variant styles from earlier declarations)
      if (!decl.extraStylexPropsArgs) {
        decl.extraStylexPropsArgs = [];
      }
      decl.extraStylexPropsArgs.push({ expr: condExpr, afterVariants: true });

      decl.needsWrapperComponent = true;
      for (const propName of propsUsed) {
        ensureShouldForwardPropDrop(decl, propName);
      }
      return true;
    }

    // Check for CallExpression branches (e.g., truncate() helpers)
    const consIsCall = isCallExpressionNode(cons);
    const altIsCall = isCallExpressionNode(alt);

    if (
      !(
        consIsCss ||
        altIsCss ||
        consIsTpl ||
        altIsTpl ||
        consIsCall ||
        altIsCall ||
        consIsStr ||
        altIsStr
      )
    ) {
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
      return resolveCssHelperTemplate(tplNode.quasi, paramName, decl.loc, cssHelperTemplateOptions);
    };

    // Reuse the shared helper for the ternary handler path
    const applyConditionalVariants = applyConditionalVariantsInline;

    // Helper to resolve a template literal branch and apply its entries
    const resolveTplBranch = (
      node: ExpressionKind,
    ): ReturnType<typeof resolveTemplateLiteralBranch> =>
      resolveTemplateLiteralBranch(tplCtx, { node: node as any, paramName, bindings });

    // Helper to apply all entries (style, dynamic, inline) from a resolved branch
    const applyResolvedEntries = (
      resolved: NonNullable<ReturnType<typeof resolveTemplateLiteralBranch>>,
      info: TestInfo,
      when: string,
    ): void => {
      if (Object.keys(resolved.style).length > 0) {
        applyVariant(info, resolved.style);
      }
      if (resolved.dynamicEntries.length > 0) {
        applyDynamicEntries(resolved.dynamicEntries, when);
      }
      if (resolved.inlineEntries.length > 0) {
        applyInlineEntries(resolved.inlineEntries, when);
      }
    };

    if (consIsCss && altIsCss) {
      const consResolved = resolveCssBranch(cons);
      const altResolved = resolveCssBranch(alt);
      const hasDynamicProps =
        (consResolved?.dynamicProps.length ?? 0) > 0 || (altResolved?.dynamicProps.length ?? 0) > 0;
      if (!consResolved || !altResolved || hasDynamicProps) {
        // Fallback: extract quasi from css tagged templates and resolve as template literals.
        // This handles inner ternaries with theme access (e.g. props.color ? $colors[props.color] : $colors.default)
        // that css-helper can't resolve to static values.
        const consQuasi = (cons as { quasi?: unknown }).quasi as ExpressionKind | undefined;
        const altQuasi = (alt as { quasi?: unknown }).quasi as ExpressionKind | undefined;
        if (consQuasi && altQuasi) {
          const consTplResolved = resolveTplBranch(consQuasi);
          const altTplResolved = resolveTplBranch(altQuasi);
          if (consTplResolved && altTplResolved) {
            dropAllTestInfoProps(testInfo);
            const invertedWhen = invertWhen(testInfo.when);
            if (!invertedWhen) {
              markBail();
              return true;
            }
            applyResolvedEntries(consTplResolved, testInfo, testInfo.when);
            applyResolvedEntries(altTplResolved, { ...testInfo, when: invertedWhen }, invertedWhen);
            return true;
          }
        }
        if (!consResolved || !altResolved) {
          markBail();
          return true;
        }
        return false;
      }
      // When the cons variant overrides all alt properties, merge alt to base (cons will
      // override). When alt has properties NOT in cons (e.g. outline vs background), both
      // must be conditional variants to avoid leaking styles into the wrong branch.
      const altKeys = Object.keys(altResolved.style);
      const altSubsetOfCons = altKeys.every((k) => k in consResolved.style);

      if (altSubsetOfCons) {
        mergeStyleObjects(styleObj, altResolved.style);
        applyVariant(testInfo, consResolved.style);
      } else {
        const invertedWhen = invertWhen(testInfo.when);
        if (!invertedWhen) {
          markBail();
          return true;
        }
        applyVariant(testInfo, consResolved.style);
        applyVariant({ ...testInfo, when: invertedWhen }, altResolved.style);
      }
      // Apply conditional variants from both branches
      applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
      const invertedWhenForVariants = invertWhen(testInfo.when);
      if (invertedWhenForVariants && altResolved.conditionalVariants.length > 0) {
        applyConditionalVariants(altResolved.conditionalVariants, invertedWhenForVariants);
      }
      return true;
    }

    if (consIsCss && altIsEmpty) {
      const consMap = resolveCssBranchToInlineMap(cons as ExpressionKind, {
        requireResolvedPseudoSelector: true,
      });
      if (consMap) {
        const consStyle = Object.fromEntries(consMap);
        const pseudoAliases = inlineMapPseudoAliases.get(consMap);
        if (pseudoAliases) {
          const handled = applyStaticPseudoAliasVariants(testInfo, consStyle, pseudoAliases);
          if (!handled) {
            markBail();
          }
        } else if (!tryApplyRuntimeStyleFunction(testInfo, consStyle)) {
          applyVariant(testInfo, consStyle);
        }
        return true;
      }
      const consResolved = resolveCssBranch(cons);
      if (!consResolved) {
        markBail();
        return true;
      }
      if (
        tryApplyRuntimeStyleFunction(testInfo, consResolved.style, {
          dynamicProps: consResolved.dynamicProps,
        })
      ) {
        applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
        dropAllTestInfoProps(testInfo);
        return true;
      }
      if (consResolved.dynamicProps.length > 0) {
        return false;
      }
      if (!tryApplyRuntimeStyleFunction(testInfo, consResolved.style)) {
        applyVariant(testInfo, consResolved.style);
      }
      applyConditionalVariants(consResolved.conditionalVariants, testInfo.when);
      return true;
    }

    if (consIsEmpty && altIsCss) {
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      const invertedTestInfo = { ...testInfo, when: invertedWhen };
      const altMap = resolveCssBranchToInlineMap(alt as ExpressionKind, {
        requireResolvedPseudoSelector: true,
      });
      if (altMap) {
        const altStyle = Object.fromEntries(altMap);
        const pseudoAliases = inlineMapPseudoAliases.get(altMap);
        if (pseudoAliases) {
          const handled = applyStaticPseudoAliasVariants(invertedTestInfo, altStyle, pseudoAliases);
          if (!handled) {
            markBail();
          }
        } else if (!tryApplyRuntimeStyleFunction(invertedTestInfo, altStyle)) {
          applyVariant(invertedTestInfo, altStyle);
        }
        return true;
      }
      const altResolved = resolveCssBranch(alt);
      if (!altResolved) {
        markBail();
        return true;
      }
      if (
        tryApplyRuntimeStyleFunction(invertedTestInfo, altResolved.style, {
          dynamicProps: altResolved.dynamicProps,
        })
      ) {
        applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
        dropAllTestInfoProps(testInfo);
        return true;
      }
      if (altResolved.dynamicProps.length > 0) {
        return false;
      }
      if (!tryApplyRuntimeStyleFunction(invertedTestInfo, altResolved.style)) {
        applyVariant(invertedTestInfo, altResolved.style);
      }
      applyConditionalVariants(altResolved.conditionalVariants, invertedWhen);
      return true;
    }

    // Attempt to resolve a template literal with a ternary-based CSS property name
    // by splitting into separate style functions for each ternary branch.
    // e.g., `${column ? "column" : "row"}-gap: ${wrapGap}px` splits into
    // separate "column-gap" and "row-gap" style functions.
    const tryResolveDynamicPropertyNameTpl = (tplNode: ExpressionKind): boolean => {
      const skipIndices = new Set<number>();
      // Retry with different ternaries if the first attempt fails
      for (let attempt = 0; attempt < 5; attempt++) {
        const split = findTernaryPropertySplit(
          tplNode,
          skipIndices.size > 0 ? skipIndices : undefined,
        );
        if (!split) {
          return false;
        }
        const { ternaryTest } = split;

        const ternaryTestInfo = parseChainedTestInfo(ternaryTest);
        if (!ternaryTestInfo) {
          skipIndices.add(split.ternaryIdx);
          continue;
        }
        const invertedTernaryWhen = invertWhen(ternaryTestInfo.when);
        if (!invertedTernaryWhen) {
          skipIndices.add(split.ternaryIdx);
          continue;
        }

        const consResolved = resolveTplBranch(split.consTpl as ExpressionKind);
        const altResolved = resolveTplBranch(split.altTpl as ExpressionKind);
        if (!consResolved || !altResolved) {
          skipIndices.add(split.ternaryIdx);
          continue;
        }

        const composeWhen = (innerWhen: string): string => `${testInfo.when} && ${innerWhen}`;
        const outerProps = testInfo.allPropNames ?? (testInfo.propName ? [testInfo.propName] : []);
        const innerProps =
          ternaryTestInfo.allPropNames ??
          (ternaryTestInfo.propName ? [ternaryTestInfo.propName] : []);
        const composedPropNames = [...new Set([...outerProps, ...innerProps])];
        const buildComposedTestInfo = (when: string): TestInfo => ({
          when,
          propName: testInfo.propName ?? ternaryTestInfo.propName,
          allPropNames: composedPropNames.length > 0 ? composedPropNames : undefined,
        });

        const consWhen = composeWhen(ternaryTestInfo.when);
        const altWhen = composeWhen(invertedTernaryWhen);
        let handled = false;

        if (Object.keys(consResolved.style).length > 0) {
          applyVariant(buildComposedTestInfo(consWhen), consResolved.style);
          handled = true;
        }
        if (Object.keys(altResolved.style).length > 0) {
          applyVariant(buildComposedTestInfo(altWhen), altResolved.style);
          handled = true;
        }
        if (consResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(consResolved.dynamicEntries, consWhen);
          handled = true;
        }
        if (altResolved.dynamicEntries.length > 0) {
          applyDynamicEntries(altResolved.dynamicEntries, altWhen);
          handled = true;
        }
        if (consResolved.inlineEntries.length > 0) {
          applyInlineEntries(consResolved.inlineEntries, consWhen);
          handled = true;
        }
        if (altResolved.inlineEntries.length > 0) {
          applyInlineEntries(altResolved.inlineEntries, altWhen);
          handled = true;
        }

        if (!handled) {
          skipIndices.add(split.ternaryIdx);
          continue;
        }

        dropAllTestInfoProps(ternaryTestInfo);
        return true;
      }
      return false;
    };

    // Check altIsEmpty BEFORE altIsTpl since empty templates are also template literals
    // and the altIsEmpty case doesn't require invertWhen (which fails for compound conditions)
    if (consIsTpl && altIsEmpty) {
      dropAllTestInfoProps(testInfo);
      const consResolved = resolveTplBranch(cons);
      if (!consResolved) {
        // Fallback: try splitting dynamic property name ternaries
        if (tryResolveDynamicPropertyNameTpl(cons)) {
          return true;
        }
        return false;
      }
      applyResolvedEntries(consResolved, testInfo, testInfo.when);
      return true;
    }

    if (consIsTpl && altIsTpl) {
      dropAllTestInfoProps(testInfo);
      const consResolved = resolveTplBranch(cons);
      const altResolved = resolveTplBranch(alt);
      if (!consResolved || !altResolved) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      applyResolvedEntries(consResolved, testInfo, testInfo.when);
      applyResolvedEntries(altResolved, { ...testInfo, when: invertedWhen }, invertedWhen);
      return true;
    }

    if (consIsEmpty && altIsTpl) {
      dropAllTestInfoProps(testInfo);
      const altResolved = resolveTplBranch(alt);
      if (!altResolved) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      applyResolvedEntries(altResolved, { ...testInfo, when: invertedWhen }, invertedWhen);
      return true;
    }

    // Handle StringLiteral CSS branches: props.wrap ? "flex-wrap: wrap;" : ""
    if (consIsStr && altIsEmpty) {
      const rawCss = (cons as { value: string }).value;
      const consStyle = resolveStaticCssBlock(rawCss);
      if (!consStyle) {
        return false;
      }
      if (Object.keys(consStyle).length > 0) {
        applyVariant(testInfo, consStyle);
      }
      dropAllTestInfoProps(testInfo);
      return true;
    }

    if (consIsEmpty && altIsStr) {
      const rawCss = (alt as { value: string }).value;
      const altStyle = resolveStaticCssBlock(rawCss);
      if (!altStyle) {
        return false;
      }
      const invertedWhen = invertWhen(testInfo.when);
      if (!invertedWhen) {
        return false;
      }
      if (Object.keys(altStyle).length > 0) {
        applyVariant({ ...testInfo, when: invertedWhen }, altStyle);
      }
      dropAllTestInfoProps(testInfo);
      return true;
    }

    if (consIsStr && altIsStr) {
      const consStyle = resolveStaticCssBlock((cons as { value: string }).value);
      const altStyle = resolveStaticCssBlock((alt as { value: string }).value);
      if (!consStyle || !altStyle) {
        return false;
      }
      mergeStyleObjects(styleObj, altStyle);
      applyVariant(testInfo, consStyle);
      dropAllTestInfoProps(testInfo);
      return true;
    }

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
      registerImports(resolved.imports, resolverImports);
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
}

// ---------------------------------------------------------------------------
// Block-level theme conditional handler
// ---------------------------------------------------------------------------

/**
 * Extracts theme property info from a condition expression for style key naming.
 *
 * Returns the primary theme property name and optional comparison value:
 * - `theme.isDark` → { themeProp: "isDark" }
 * - `theme.mode === "dark"` → { themeProp: "mode", comparisonValue: "dark" }
 * - `theme.isDark && props.enabled` → { themeProp: "isDark" }
 */
function extractThemeConditionInfo(
  node: ExpressionKind,
): { themeProp: string; comparisonValue?: string } | null {
  const rec = node as ASTNodeRecord;

  if (rec.type === "BinaryExpression") {
    const left = rec.left as ExpressionKind;
    const right = rec.right as ASTNodeRecord;
    const leftInfo = extractThemeConditionInfo(left);
    if (leftInfo && !leftInfo.comparisonValue) {
      const val = literalToStaticValue(right as unknown);
      if (val !== null && typeof val === "string") {
        return { themeProp: leftInfo.themeProp, comparisonValue: val };
      }
    }
    return leftInfo ?? extractThemeConditionInfo(right as ExpressionKind);
  }

  if (isMemberExpression(rec)) {
    const obj = rec.object as { type?: string; name?: string } | undefined;
    const prop = rec.property as { type?: string; name?: string } | undefined;
    if (obj?.type === "Identifier" && obj.name === "theme" && prop?.type === "Identifier") {
      return prop.name ? { themeProp: prop.name } : null;
    }
    return extractThemeConditionInfo(rec.object as ExpressionKind);
  }

  if (rec.type === "LogicalExpression") {
    return (
      extractThemeConditionInfo(rec.left as ExpressionKind) ??
      extractThemeConditionInfo(rec.right as ExpressionKind)
    );
  }
  if (rec.type === "UnaryExpression") {
    return extractThemeConditionInfo(rec.argument as ExpressionKind);
  }
  return null;
}

type BlockThemeConditionalArgs = Pick<
  CssHelperConditionalContext,
  | "decl"
  | "extraStyleObjects"
  | "j"
  | "filePath"
  | "parseExpr"
  | "resolveValue"
  | "resolveCall"
  | "resolveImportInScope"
  | "resolverImports"
  | "handlerContext"
  | "isCssHelperTaggedTemplate"
  | "isPlainTemplateLiteral"
  | "resolveStaticCssBlock"
  | "warnings"
  | "keyframesNames"
  | "inlineKeyframeNameMap"
> & {
  conditional: { test: ExpressionKind; consequent: ExpressionKind; alternate: ExpressionKind };
  paramName: string | null;
  replaceParamWithProps: (exprNode: ExpressionKind) => ExpressionKind;
  componentInfo: { localName: string; base: string; tagOrIdent: string };
  pseudos: string[] | null;
};

/**
 * Attempts to resolve a block-level theme conditional (where `isThemeAccessTest` is true)
 * by resolving both CSS branches and emitting theme-conditional style objects.
 *
 * Returns true if successfully handled, false if should fall through to bail.
 */
function tryResolveBlockLevelThemeConditional(args: BlockThemeConditionalArgs): boolean {
  const {
    conditional,
    paramName,
    replaceParamWithProps,
    isPlainTemplateLiteral,
    isCssHelperTaggedTemplate,
    resolveStaticCssBlock,
    decl,
    extraStyleObjects,
    pseudos,
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo,
    handlerContext,
    warnings,
  } = args;

  const cons = conditional.consequent;
  const alt = conditional.alternate;
  const consIsEmpty = isEmptyCssBranch(cons);
  const altIsEmpty = isEmptyCssBranch(alt);

  const tplCtx: TemplateLiteralContext = {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveImportInScope,
    resolverImports,
    componentInfo: componentInfo as TemplateLiteralContext["componentInfo"],
    handlerContext,
    warnings,
    keyframesNames: args.keyframesNames,
    inlineKeyframeNameMap: args.inlineKeyframeNameMap,
  };

  const resolveTemplateNode = (
    tplNode: import("jscodeshift").TemplateLiteral,
  ): Record<string, unknown> | null => {
    const resolved = resolveTemplateLiteralBranch(tplCtx, {
      node: tplNode,
      paramName,
    });
    if (!resolved) {
      return null;
    }
    // Block-level theme conditionals cannot handle dynamic/inline entries
    if (resolved.dynamicEntries.length > 0 || resolved.inlineEntries.length > 0) {
      return null;
    }
    return resolved.style;
  };

  const resolveBranch = (node: ExpressionKind): Record<string, unknown> | null => {
    // String literal: "color: white;"
    if (
      node.type === "StringLiteral" ||
      (node.type === "Literal" && typeof (node as { value?: unknown }).value === "string")
    ) {
      const rawCss = (node as { value: string }).value;
      return resolveStaticCssBlock(rawCss);
    }
    // Template literal (with or without interpolations)
    if (isPlainTemplateLiteral(node)) {
      return resolveTemplateNode(node as import("jscodeshift").TemplateLiteral);
    }
    // css`` tagged template
    if (isCssHelperTaggedTemplate(node)) {
      return resolveTemplateNode((node as { quasi: import("jscodeshift").TemplateLiteral }).quasi);
    }
    return null;
  };

  const consStyle = consIsEmpty ? {} : resolveBranch(cons);
  const altStyle = altIsEmpty ? {} : resolveBranch(alt);

  if (consStyle === null || altStyle === null) {
    return false;
  }

  if (Object.keys(consStyle).length === 0 && Object.keys(altStyle).length === 0) {
    return false;
  }

  // Build condition expression:
  // 1. replaceParamWithProps: rewrites param refs (handles destructured ({ theme }) patterns)
  // 2. rewriteThemeToUseThemeVar: replaces `props.theme.X` → `theme.X`
  const propsCondition = replaceParamWithProps(conditional.test);
  const conditionExpr = rewritePropsThemeToThemeVar(propsCondition);

  const themeInfo = extractThemeConditionInfo(conditionExpr);
  if (!themeInfo) {
    return false;
  }
  const { themeProp } = themeInfo;

  const { trueKey, falseKey } = buildThemeStyleKeys(
    decl.styleKey,
    themeProp,
    themeInfo.comparisonValue,
  );
  const hasTrue = Object.keys(consStyle).length > 0;
  const hasFalse = Object.keys(altStyle).length > 0;
  const trueStyleKey = hasTrue ? trueKey : null;
  const falseStyleKey = hasFalse ? falseKey : null;

  // When inside a pseudo selector (e.g., &[data-state="active"]), wrap each resolved
  // property value with the pseudo selector map: { default: null, pseudo: value }
  if (pseudos?.length) {
    const wrapWithPseudo = (style: Record<string, unknown>): Record<string, unknown> => {
      const wrapped: Record<string, unknown> = {};
      for (const [prop, value] of Object.entries(style)) {
        wrapped[prop] = {
          default: null,
          ...Object.fromEntries(pseudos.map((p) => [p, value])),
        };
      }
      return wrapped;
    };
    if (trueStyleKey) {
      extraStyleObjects.set(trueStyleKey, wrapWithPseudo(consStyle));
    }
    if (falseStyleKey) {
      extraStyleObjects.set(falseStyleKey, wrapWithPseudo(altStyle));
    }
  } else {
    if (trueStyleKey) {
      extraStyleObjects.set(trueStyleKey, consStyle);
    }
    if (falseStyleKey) {
      extraStyleObjects.set(falseStyleKey, altStyle);
    }
  }

  if (!decl.needsUseThemeHook) {
    decl.needsUseThemeHook = [];
  }
  decl.needsUseThemeHook.push({
    themeProp,
    conditionExpr,
    trueStyleKey,
    falseStyleKey,
  });

  decl.needsWrapperComponent = true;
  return true;
}

function styleValueToExpression(j: any, value: unknown): ExpressionKind {
  if (value === null) {
    return j.literal(null) as ExpressionKind;
  }
  if (value !== null && typeof value === "object" && "type" in value) {
    return cloneAstNode(value) as ExpressionKind;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return j.objectExpression(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) =>
        j.property(
          "init",
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? j.identifier(key) : j.literal(key),
          styleValueToExpression(j, nestedValue),
        ),
      ),
    ) as ExpressionKind;
  }
  return staticValueToLiteral(j, value as string | number | boolean) as ExpressionKind;
}

function toRuntimeStyleExpression(
  j: JSCodeshift,
  value: unknown,
  stylexTokenIdentifiers: ReadonlySet<string>,
): ExpressionKind {
  const expr = styleValueToExpression(j, value);
  return rewritePropsThemeToThemeVar(
    normalizeDollarProps(j, expr, { skipIdentifiers: stylexTokenIdentifiers }),
  );
}

function splitStaticPseudoAliasStyle(
  j: JSCodeshift,
  style: Record<string, unknown>,
  pseudoNames: string[],
  pseudoKeys: string[],
  rootDefaultObjects: WeakMap<object, true>,
  shouldPreserveAliasDefault: (propName: string) => boolean,
): {
  rootStyle: Record<string, unknown>;
  pseudoAliasStyles: Map<string, Record<string, unknown>> | null;
} {
  const rootStyle: Record<string, unknown> = {};
  const pseudoAliasStyles = new Map<string, Record<string, unknown>>();
  for (const pseudoName of pseudoNames) {
    pseudoAliasStyles.set(pseudoName, {});
  }

  let hasAliasStyle = false;
  for (const [prop, value] of Object.entries(style)) {
    const split = splitPseudoObjectByAliasName(
      j,
      value,
      pseudoNames,
      pseudoKeys,
      rootDefaultObjects,
      shouldPreserveAliasDefault(prop),
    );
    if (!split) {
      rootStyle[prop] = value;
      continue;
    }
    hasAliasStyle = true;
    if (split.rootValue) {
      rootStyle[prop] = split.rootValue;
    }
    for (const [pseudoName, pseudoValue] of split.byPseudoName) {
      const styleForPseudo = pseudoAliasStyles.get(pseudoName);
      if (styleForPseudo) {
        styleForPseudo[prop] = pseudoValue;
      }
    }
  }

  return {
    rootStyle,
    pseudoAliasStyles: hasAliasStyle ? pseudoAliasStyles : null,
  };
}

function splitPseudoObjectByAliasName(
  j: JSCodeshift,
  value: unknown,
  pseudoNames: string[],
  pseudoKeys: string[],
  rootDefaultObjects: WeakMap<object, true>,
  preserveAliasDefault: boolean,
): {
  byPseudoName: Map<string, ExpressionKind>;
  rootValue?: Record<string, unknown>;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const node = value as ASTNodeRecord;
  if (node.type !== "ObjectExpression") {
    return null;
  }

  const properties = node.properties as ASTNodeRecord[] | undefined;
  const byKey = new Map<string, ExpressionKind>();
  const pseudoKeySet = new Set(pseudoKeys);
  const rootValue: Record<string, unknown> = {};
  let aliasDefaultValue: ExpressionKind | null = null;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (keyName) {
      byKey.set(keyName, property.value as ExpressionKind);
      if (preserveAliasDefault && keyName === "default" && !rootDefaultObjects.has(node)) {
        const staticDefault = staticValueFromExpression(property.value);
        if (staticDefault !== null && staticDefault !== undefined) {
          aliasDefaultValue = property.value as ExpressionKind;
        }
      }
      if (!pseudoKeySet.has(keyName) && (keyName !== "default" || rootDefaultObjects.has(node))) {
        if (
          keyName === "default" &&
          (property.value as ASTNodeRecord | undefined)?.type === "ObjectExpression"
        ) {
          copyObjectExpressionPropertiesToRootValue(rootValue, property.value as ASTNodeRecord);
        } else {
          rootValue[keyName] =
            staticValueFromExpression(property.value) ?? cloneAstNode(property.value);
        }
      }
    }
  }

  const byPseudoName = new Map<string, ExpressionKind>();
  for (let index = 0; index < pseudoNames.length; index++) {
    const pseudoName = pseudoNames[index]!;
    const pseudoKey = pseudoKeys[index] ?? `:${pseudoName}`;
    const pseudoValue = byKey.get(pseudoKey);
    if (!pseudoValue) {
      return null;
    }
    byPseudoName.set(
      pseudoName,
      j.objectExpression([
        ...(aliasDefaultValue
          ? [
              j.property(
                "init",
                j.identifier("default"),
                cloneAstNode(aliasDefaultValue) as ExpressionKind,
              ),
            ]
          : []),
        j.property("init", j.literal(pseudoKey), cloneAstNode(pseudoValue) as ExpressionKind),
      ]) as ExpressionKind,
    );
  }
  return {
    byPseudoName,
    ...(Object.keys(rootValue).length > 0 ? { rootValue } : {}),
  };
}

function bridgeRuntimePseudoColorValues(
  j: JSCodeshift,
  styleKey: string,
  stylexProp: string,
  expression: ExpressionKind,
): { expression: ExpressionKind; customProps: ReturnType<typeof j.property>[] } {
  if (!isColorLikeStylexProp(stylexProp) || expression.type !== "ObjectExpression") {
    return { expression, customProps: [] };
  }

  const customProps: ReturnType<typeof j.property>[] = [];
  for (const property of expression.properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property as unknown as ASTNodeRecord);
    if (!keyName?.startsWith(":")) {
      continue;
    }
    const value = property.value as ExpressionKind;
    if (!referencesRuntimeValue(value)) {
      continue;
    }

    const variableName = buildRuntimePseudoVariableName(styleKey, stylexProp, keyName);
    customProps.push(j.property("init", j.literal(variableName), cloneAstNode(value)));
    property.value = j.literal(`var(${variableName})`);
  }

  return { expression, customProps };
}

function isColorLikeStylexProp(stylexProp: string): boolean {
  return (
    stylexProp === "color" ||
    stylexProp === "fill" ||
    stylexProp === "stroke" ||
    stylexProp.endsWith("Color")
  );
}

function referencesRuntimeValue(value: ExpressionKind): boolean {
  return findInAst(value, (node) => {
    if (node.type === "Identifier") {
      const name = (node as { name?: string }).name;
      if (name === "theme" || name?.startsWith("$")) {
        return true;
      }
    }
    return (
      isMemberExpression(node) &&
      (node.object as ASTNodeRecord | undefined)?.type === "Identifier" &&
      ((node.object as { name?: string }).name === "props" ||
        (node.object as { name?: string }).name === "theme") &&
      node.computed === false
    );
  });
}

function getStaticObjectPropertyKeyName(property: ASTNodeRecord): string | null {
  const key = property.key as ASTNodeRecord | undefined;
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return (key as { name?: string }).name ?? null;
  }
  if (key.type === "Literal" || key.type === "StringLiteral") {
    const value = (key as { value?: unknown }).value;
    return typeof value === "string" ? value : null;
  }
  return null;
}

function buildRuntimePseudoVariableName(
  styleKey: string,
  stylexProp: string,
  pseudo: string,
): string {
  const pseudoSuffix =
    pseudo
      .replace(/^:+/, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "state";
  return `--${camelToKebabCase(styleKey)}-${camelToKebabCase(stylexProp)}-${pseudoSuffix}`;
}

function collectRuntimeStylePropNames(
  style: Record<string, unknown>,
  importMap: Map<string, unknown>,
  stylexTokenIdentifiers: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(style)) {
    collectRuntimePropNames(value, names, importMap, stylexTokenIdentifiers);
  }
  return names;
}

function collectRuntimePropNames(
  value: unknown,
  names: Set<string>,
  importMap: Map<string, unknown>,
  stylexTokenIdentifiers: ReadonlySet<string>,
): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRuntimePropNames(item, names, importMap, stylexTokenIdentifiers);
    }
    return;
  }
  const node = value as ASTNodeRecord;
  if (node.type === "Identifier") {
    const name = (node as { name?: string }).name;
    if (name?.startsWith("$") && !importMap.has(name) && !stylexTokenIdentifiers.has(name)) {
      names.add(normalizeTransientPropName(name));
    }
    return;
  }
  if (isMemberExpression(node)) {
    const object = node.object as ASTNodeRecord | undefined;
    const property = node.property as ASTNodeRecord | undefined;
    if (
      object?.type === "Identifier" &&
      (object as { name?: string }).name === "props" &&
      property?.type === "Identifier" &&
      node.computed === false
    ) {
      const propName = (property as { name?: string }).name;
      if (propName && propName !== "theme") {
        names.add(normalizeTransientPropName(propName));
      }
      if (propName === "theme") {
        return;
      }
    }
    collectRuntimePropNames(node.object, names, importMap, stylexTokenIdentifiers);
    if (node.computed) {
      collectRuntimePropNames(node.property, names, importMap, stylexTokenIdentifiers);
    }
    return;
  }
  if (node.type === "Property") {
    if (node.computed) {
      collectRuntimePropNames(node.key, names, importMap, stylexTokenIdentifiers);
    }
    collectRuntimePropNames(node.value, names, importMap, stylexTokenIdentifiers);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "loc" || key === "comments" || key === "type") {
      continue;
    }
    collectRuntimePropNames(child, names, importMap, stylexTokenIdentifiers);
  }
}

function styleReferencesRuntimeTheme(style: Record<string, unknown>): boolean {
  return Object.values(style).some((value) =>
    findInAst(
      value,
      (node) =>
        isMemberExpression(node) &&
        (node.object as ASTNodeRecord | undefined)?.type === "Identifier" &&
        (node.object as { name?: string }).name === "props" &&
        (node.property as ASTNodeRecord | undefined)?.type === "Identifier" &&
        (node.property as { name?: string }).name === "theme" &&
        node.computed === false,
    ),
  );
}

function normalizeTransientPropName(propName: string): string {
  return propName.startsWith("$") ? propName.slice(1) : propName;
}

function normalizeTransientWhen(when: string): string {
  return when.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, "$1");
}

function collectStylePropNames(styles: Iterable<Record<string, unknown>>): Set<string> {
  const propNames = new Set<string>();
  for (const style of styles) {
    for (const propName of Object.keys(style)) {
      propNames.add(propName);
    }
  }
  return propNames;
}

function hasRootStyleForProps(
  style: Record<string, unknown>,
  propNames: ReadonlySet<string>,
): boolean {
  for (const propName of propNames) {
    if (
      Object.prototype.hasOwnProperty.call(style, propName) &&
      styleValueIncludesRootDefault(style[propName])
    ) {
      return true;
    }
  }
  return false;
}

function hasPriorRootStyleFnForProps(
  styleFnFromProps: StyleFnFromPropsEntry[],
  styleFnDecls: Map<string, unknown>,
  propNames: ReadonlySet<string>,
): boolean {
  for (const entry of styleFnFromProps) {
    const styleFn = styleFnDecls.get(entry.fnKey);
    if (
      styleFn &&
      typeof styleFn === "object" &&
      (styleFn as { type?: string }).type === "ArrowFunctionExpression"
    ) {
      const body = (styleFn as { body?: unknown }).body;
      if (objectExpressionHasRootStyleForProps(body, propNames)) {
        return true;
      }
    }
  }
  return false;
}

function objectExpressionHasRootStyleForProps(
  node: unknown,
  propNames: ReadonlySet<string>,
): boolean {
  if (
    !node ||
    typeof node !== "object" ||
    (node as { type?: string }).type !== "ObjectExpression"
  ) {
    return false;
  }
  const properties = (node as ASTNodeRecord).properties as ASTNodeRecord[] | undefined;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (keyName && propNames.has(keyName) && styleValueIncludesRootDefault(property.value)) {
      return true;
    }
  }
  return false;
}

function styleValueIncludesRootDefault(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return true;
  }
  if ((value as { type?: string }).type === "ObjectExpression") {
    const properties = (value as ASTNodeRecord).properties as ASTNodeRecord[] | undefined;
    for (const property of properties ?? []) {
      if (!property || property.type !== "Property") {
        continue;
      }
      const keyName = getStaticObjectPropertyKeyName(property);
      if (keyName && isRootStyleValueKey(keyName)) {
        return true;
      }
    }
    return false;
  }
  for (const keyName of Object.keys(value)) {
    if (isRootStyleValueKey(keyName)) {
      return true;
    }
  }
  return false;
}

function isRootStyleValueKey(keyName: string): boolean {
  return keyName === "default" || (!keyName.startsWith(":") && !keyName.startsWith("@"));
}

function copyObjectExpressionPropertiesToRootValue(
  rootValue: Record<string, unknown>,
  objectExpression: ASTNodeRecord,
): void {
  const properties = objectExpression.properties as ASTNodeRecord[] | undefined;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (!keyName) {
      continue;
    }
    rootValue[keyName] = staticValueFromExpression(property.value) ?? cloneAstNode(property.value);
  }
}

function staticValueFromExpression(node: unknown): string | number | boolean | null | undefined {
  if (
    node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Literal" &&
    (node as { value?: unknown }).value === null
  ) {
    return null;
  }
  const value = literalToStaticValue(node);
  return value === null ? undefined : value;
}

/**
 * If the node is a `typeof x === "type"` expression (a TypeScript type guard),
 * returns the name of the narrowed identifier. Returns null otherwise.
 */
function getTypeofGuardProp(node: ExpressionKind): string | null {
  if (node.type !== "BinaryExpression") {
    return null;
  }
  const { operator, left, right } = node as {
    operator: string;
    left: ExpressionKind;
    right: ExpressionKind;
  };
  if (operator !== "===" && operator !== "!==") {
    return null;
  }
  const extractTypeofArg = (n: ExpressionKind): string | null => {
    if (n.type !== "UnaryExpression" || (n as { operator: string }).operator !== "typeof") {
      return null;
    }
    const arg = (n as { argument: ExpressionKind }).argument;
    return arg?.type === "Identifier" ? (arg as { name: string }).name : null;
  };
  return extractTypeofArg(left) ?? extractTypeofArg(right);
}

/** Returns a unique key by appending a numeric suffix if the key already exists in any of the maps. */
function ensureUniqueKey(maps: Map<string, unknown>[], key: string): string {
  const has = (k: string): boolean => maps.some((m) => m.has(k));
  if (!has(key)) {
    return key;
  }
  let i = 2;
  while (has(`${key}${i}`)) {
    i++;
  }
  return `${key}${i}`;
}

function buildConditionalStyleFnKeys(
  styleKey: string,
  conditionName: string | null,
  consMap: Map<string, unknown>,
  altMap: Map<string, unknown>,
): { truthyKey: string; falsyKey: string } {
  if (conditionName) {
    return {
      truthyKey: `${styleKey}${conditionName}`,
      falsyKey: `${styleKey}Default`,
    };
  }

  const fallbackSuffix = buildFallbackPropSuffix(consMap, altMap);
  return {
    truthyKey: `${styleKey}With${fallbackSuffix}`,
    falsyKey: `${styleKey}Without${fallbackSuffix}`,
  };
}

function buildFallbackPropSuffix(
  consMap: Map<string, unknown>,
  altMap: Map<string, unknown>,
): string {
  const propName =
    consMap.size > 0 ? Array.from(consMap.keys())[0] : (Array.from(altMap.keys())[0] ?? null);
  if (!propName) {
    return "Styles";
  }
  return capitalize(cssPropertyToIdentifier(propName));
}
