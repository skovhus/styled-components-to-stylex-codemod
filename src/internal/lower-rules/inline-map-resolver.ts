/**
 * Resolves a css`` branch (tagged template or plain template literal) into an
 * inline map of StyleX property -> value expression, handling @media queries,
 * pseudo selectors, interpolated selectors, keyframes animation shorthands, and
 * runtime pseudo aliases. Split out of `css-helper-conditional.ts`.
 *
 * Created once per handler invocation so the resolver can capture the
 * invocation-scoped param helpers and shared pseudo-alias WeakMaps.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import type { LowerRulesState } from "./state.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  staticValueToLiteral,
} from "../utilities/jscodeshift-utils.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { parseCssTemplateToRules } from "./css-helper.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import { buildTemplateWithStaticParts } from "./inline-styles.js";
import { cssValueToJs, normalizeCssContentValue } from "../transform/helpers.js";
import {
  findSupportedAtRule,
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
import { styleValueToExpression } from "./css-conditional-ast-utils.js";
import type {
  InlineMapPseudoAliases,
  InlineMapPseudoRootDefaults,
  ResolvedPseudoEntry,
  RuntimePseudoAlias,
} from "./inline-map-types.js";

type ArrowFunctionNode = Parameters<typeof getArrowFnParamBindings>[0];

type InlineMapResolverDeps = {
  j: JSCodeshift;
  filePath: string;
  parseExpr: LowerRulesState["parseExpr"];
  resolveValue: LowerRulesState["resolveValue"];
  resolveCall: LowerRulesState["resolveCall"];
  resolveSelector: LowerRulesState["resolveSelector"];
  resolveImportInScope: LowerRulesState["resolveImportInScope"];
  resolverImports: LowerRulesState["resolverImports"];
  isCssHelperTaggedTemplate: LowerRulesState["isCssHelperTaggedTemplate"];
  keyframesNames: LowerRulesState["keyframesNames"];
  inlineKeyframeNameMap: LowerRulesState["inlineKeyframeNameMap"];
  styleObj: Record<string, unknown>;
  paramName: string | null;
  replaceParamWithProps: (
    exprNode: ExpressionKind,
    localParamName?: string,
    localBindings?: NonNullable<ReturnType<typeof getArrowFnParamBindings>>,
  ) => ExpressionKind;
  getFunctionParamName: (node: ExpressionKind) => string | undefined;
  inlineMapPseudoAliases: InlineMapPseudoAliases;
  inlineMapPseudoRootDefaults: InlineMapPseudoRootDefaults;
};

export function createInlineMapResolver(deps: InlineMapResolverDeps): {
  resolveCssBranchToInlineMap: (
    node: ExpressionKind,
    opts?: { requireResolvedPseudoSelector?: boolean },
  ) => Map<string, ExpressionKind> | null;
} {
  const {
    j,
    filePath,
    parseExpr,
    resolveValue,
    resolveCall,
    resolveSelector,
    resolveImportInScope,
    resolverImports,
    isCssHelperTaggedTemplate,
    keyframesNames,
    inlineKeyframeNameMap,
    styleObj,
    paramName,
    replaceParamWithProps,
    getFunctionParamName,
    inlineMapPseudoAliases,
    inlineMapPseudoRootDefaults,
  } = deps;

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
          if (d.property === "animation" && keyframesNames && keyframesNames.size > 0) {
            const expanded: Record<string, unknown> = {};
            if (
              expandStaticAnimationShorthand(
                d.valueRaw,
                keyframesNames,
                j,
                expanded,
                inlineKeyframeNameMap,
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
          keyframesNames &&
          keyframesNames.size > 0
        ) {
          const expanded = expandInterpolatedAnimationShorthand({
            property: d.property,
            valueRaw: d.valueRaw,
            slotExprById,
            keyframesNames: keyframesNames,
            j,
            inlineKeyframeNameMap: inlineKeyframeNameMap,
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

  return { resolveCssBranchToInlineMap };
}
