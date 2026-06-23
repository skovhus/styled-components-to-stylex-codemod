/**
 * Parses css`` helper templates into IR and resolves helper styles.
 * Core concepts: Stylis parsing, selector normalization, and dynamic slots.
 */
import { compile } from "stylis";

import type {
  Adapter,
  ImportSource,
  ImportSpec,
  ResolveValueContext,
  ResolveValueResult,
} from "../../adapter.js";
import { computeSelectorWarningLoc, normalizeStylisAstToIR } from "../css-ir.js";
import {
  cssDeclarationToStylexDeclarations,
  isUnsupportedBackgroundShorthandValue,
  parseInterpolatedBorderStaticParts,
} from "../css-prop-mapping.js";
import {
  extractRootAndPath,
  getFunctionBodyExpr,
  getMemberPathFromIdentifier,
  getNodeLocStart,
  isAstNode,
} from "../utilities/jscodeshift-utils.js";
import type { WarningLog, WarningType } from "../logger.js";
import {
  parseStyledTemplateLiteral,
  terminateStandaloneInterpolationStatements,
} from "../styled-css.js";
import { normalizeSpecificityHacks, parseSelector } from "../selectors.js";
import { addPropComments } from "./comments.js";
import { buildSpecificityStrippedComment } from "./specificity-comments.js";
import { wrapExprWithStaticParts } from "./interpolations.js";
import type { ExpressionKind } from "./decl-types.js";
import { isStylexShorthandCamelCase } from "../stylex-shorthands.js";
import { cssValueToJs, normalizeCssContentValue } from "../transform/helpers.js";
import { tryExpandInterpolatedAnimation, expandStaticAnimationShorthand } from "../keyframes.js";
import {
  findInAst,
  findSupportedAtRule,
  hasUnsupportedAtRule,
  isMemberExpression,
  registerImports,
  resolveMediaAtRulePlaceholders,
  setStyleObjectValue,
  tryResolveAdapterCall,
  type AdapterCallResolver,
  type ResolvedMedia,
} from "./utils.js";

type ImportMapEntry = {
  importedName: string;
  source: ImportSource;
};

export type ConditionalVariant = {
  when: string;
  propName: string;
  style: Record<string, unknown>;
};

type CssHelperTemplateOptions = {
  rejectStrippedSpecificity?: boolean;
};

type ValuePart = { kind: string; value?: string; slotId?: number };
type ValueSlotPart = ValuePart & { kind: "slot"; slotId: number };
type StaticSlotResolution = {
  ast: ExpressionKind;
  exprString: string;
  staticValue?: string | number;
};
type TernaryBranchResolution = StaticSlotResolution & { staticValue?: string | number };

/**
 * Parses a CSS template literal to IR rules and slot expression map.
 * This is the shared parsing logic used by both resolveCssHelperTemplate and resolveCssBranchToInlineMap.
 */
export function parseCssTemplateToRules(template: any): {
  rules: ReturnType<typeof normalizeStylisAstToIR>;
  slotExprById: Map<number, unknown>;
  rawCss: string;
} {
  const parsed = parseStyledTemplateLiteral(template);
  const rawCss = parsed.rawCss;
  const stylisRawCss = terminateStandaloneInterpolationStatements(rawCss);
  const wrappedRawCss = `& { ${stylisRawCss} }`;
  const stylisAst = compile(wrappedRawCss);
  const rules = normalizeStylisAstToIR(stylisAst, parsed.slots, { rawCss: wrappedRawCss });
  const slotExprById = new Map(parsed.slots.map((s) => [s.index, s.expression]));
  return { rules, slotExprById, rawCss };
}

/**
 * Extracts prefix and suffix static parts from a value parts array.
 * Given parts like ["static:1px", "slot", "static:solid"], returns { prefix: "1px", suffix: "solid" }
 */
function extractPrefixSuffix(parts: ValuePart[]): { prefix: string; suffix: string } {
  let prefix = "";
  let suffix = "";
  let foundSlot = false;
  for (const part of parts) {
    if (part.kind === "slot") {
      foundSlot = true;
      continue;
    }
    if (part.kind === "static") {
      if (foundSlot) {
        suffix += part.value ?? "";
      } else {
        prefix += part.value ?? "";
      }
    }
  }
  return { prefix, suffix };
}

export function createCssHelperResolver(args: {
  importMap: Map<string, ImportMapEntry>;
  filePath: string;
  resolveValue: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  resolveCall?: AdapterCallResolver["resolveCall"];
  resolveImportInScope?: AdapterCallResolver["resolveImportInScope"];
  resolveSelector?: Adapter["resolveSelector"];
  parseExpr: (exprSource: string) => any;
  resolverImports: Map<string, ImportSpec>;
  warnings: WarningLog[];
  keyframesNames?: Set<string>;
  inlineKeyframeNameMap?: Map<string, string>;
  j?: import("jscodeshift").JSCodeshift;
}): {
  isCssHelperTaggedTemplate: (expr: any) => expr is { quasi: any };
  resolveCssHelperTemplate: (
    template: any,
    paramName: string | null,
    loc: { line: number; column: number } | null | undefined,
    options?: CssHelperTemplateOptions,
  ) => {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
    conditionalVariants: ConditionalVariant[];
  } | null;
} {
  const { importMap, filePath, resolveValue, parseExpr, resolverImports, warnings } = args;

  const adapterCallResolver: AdapterCallResolver | null =
    args.resolveCall && args.resolveImportInScope
      ? {
          resolveCall: args.resolveCall,
          resolveImportInScope: args.resolveImportInScope,
          parseExpr,
          resolverImports,
          filePath,
        }
      : null;

  const isCssHelperTaggedTemplate = (expr: any): expr is { quasi: any } => {
    if (!expr || expr.type !== "TaggedTemplateExpression") {
      return false;
    }
    if (expr.tag?.type !== "Identifier") {
      return false;
    }
    const localName = expr.tag.name;
    const imp = importMap.get(localName);
    return (
      !!imp &&
      imp.importedName === "css" &&
      imp.source?.kind === "specifier" &&
      imp.source.value === "styled-components"
    );
  };

  const resolveHelperExprToAst = (
    expr: any,
    paramName: string | null,
  ): StaticSlotResolution | null => {
    if (!expr || typeof expr !== "object") {
      return null;
    }
    if (expr.type === "StringLiteral") {
      return { ast: expr, exprString: JSON.stringify(expr.value), staticValue: expr.value };
    }
    if (expr.type === "NumericLiteral") {
      return { ast: expr, exprString: String(expr.value), staticValue: expr.value };
    }
    if (expr.type === "Literal") {
      const value = expr.value;
      if (typeof value === "string") {
        return { ast: expr, exprString: JSON.stringify(value), staticValue: value };
      }
      if (typeof value === "number") {
        return { ast: expr, exprString: String(value), staticValue: value };
      }
      return { ast: expr, exprString: JSON.stringify(value) };
    }
    const path =
      paramName && isMemberExpression(expr)
        ? getMemberPathFromIdentifier(expr as any, paramName)
        : null;
    if (!path || path[0] !== "theme") {
      return null;
    }
    const themePath = path.slice(1).join(".");
    const res = resolveValue({
      kind: "theme",
      path: themePath,
      filePath,
      loc: getNodeLocStart(expr) ?? undefined,
    });
    if (!res) {
      return null;
    }
    registerImports(res.imports, resolverImports);
    const exprAst = parseExpr(res.expr);
    return exprAst ? { ast: exprAst, exprString: res.expr } : null;
  };

  const hasThemeAccessInExpr = (expr: any, paramName: string | null): boolean => {
    if (!expr || typeof expr !== "object" || !paramName) {
      return false;
    }
    return findInAst(
      expr,
      (node) =>
        isMemberExpression(node) &&
        (node.object as any)?.type === "Identifier" &&
        (node.object as any)?.name === paramName &&
        (node.property as any)?.type === "Identifier" &&
        (node.property as any)?.name === "theme" &&
        node.computed === false,
    );
  };

  const hasCallExpressionInExpr = (expr: any): boolean => {
    if (!expr || typeof expr !== "object") {
      return false;
    }
    return findInAst(expr, (node) => node.type === "CallExpression");
  };

  const isExpressionKind = (node: unknown): node is ExpressionKind =>
    !!node && typeof node === "object" && typeof (node as { type?: unknown }).type === "string";

  const isSlotPart = (part: ValuePart): part is ValueSlotPart =>
    part.kind === "slot" && typeof part.slotId === "number";

  const resolveStaticSlot = (
    expr: any,
    property: string,
    paramName: string | null,
  ): StaticSlotResolution | null => {
    const resolved = resolveHelperExprToAst(expr, paramName);
    if (resolved) {
      return resolved;
    }

    if (!hasCallExpressionInExpr(expr)) {
      return null;
    }

    const callResolved =
      adapterCallResolver && tryResolveAdapterCall(expr, property, adapterCallResolver);
    if (!callResolved) {
      return null;
    }
    if (!isExpressionKind(callResolved.ast)) {
      return null;
    }
    return { ast: callResolved.ast, exprString: callResolved.exprString };
  };

  const buildStaticInterpolatedValue = (
    parts: ValuePart[],
    resolvedSlots: Map<number, StaticSlotResolution>,
  ): ExpressionKind | null => {
    const j = args.j;
    if (!j) {
      return null;
    }
    const quasis: Array<ReturnType<typeof j.templateElement>> = [];
    const expressions: ExpressionKind[] = [];
    let currentStaticPart = "";

    for (const part of parts) {
      if (part.kind === "static") {
        currentStaticPart += part.value ?? "";
        continue;
      }
      if (!isSlotPart(part)) {
        return null;
      }
      quasis.push(j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, false));
      currentStaticPart = "";
      const resolved = resolvedSlots.get(part.slotId);
      if (!resolved) {
        return null;
      }
      expressions.push(resolved.ast);
    }

    quasis.push(j.templateElement({ raw: currentStaticPart, cooked: currentStaticPart }, true));
    if (expressions.length === 1 && quasis.every((q) => !q.value.raw && !q.value.cooked)) {
      const onlyExpression = expressions[0];
      return onlyExpression ?? null;
    }
    return j.templateLiteral(quasis, expressions);
  };

  /**
   * Resolves a ternary branch expression to an AST node and string representation.
   * Supports:
   * - Numeric literals (0, 24)
   * - String literals ("value")
   * - Identifiers (local constants or resolved imports)
   */
  const resolveTernaryBranchToAst = (branch: any): TernaryBranchResolution | null => {
    if (!branch || typeof branch !== "object") {
      return null;
    }
    if (branch.type === "NumericLiteral") {
      return { ast: branch, exprString: String(branch.value), staticValue: branch.value };
    }
    if (branch.type === "StringLiteral") {
      return { ast: branch, exprString: JSON.stringify(branch.value), staticValue: branch.value };
    }
    if (branch.type === "Literal") {
      const v = branch.value;
      if (typeof v === "number") {
        return { ast: branch, exprString: String(v), staticValue: v };
      }
      if (typeof v === "string") {
        return { ast: branch, exprString: JSON.stringify(v), staticValue: v };
      }
    }
    // Handle identifiers and member expressions (local constants or imports)
    const info = extractRootAndPath(branch);
    if (info) {
      const imp = importMap.get(info.rootName);
      if (imp) {
        const res = resolveValue({
          kind: "importedValue",
          importedName: imp.importedName,
          source: imp.source,
          ...(info.path.length > 0 ? { path: info.path.join(".") } : {}),
          filePath,
          loc: getNodeLocStart(branch) ?? undefined,
        });
        if (!res) {
          return null;
        }
        registerImports(res.imports, resolverImports);
        const exprAst = parseExpr(res.expr);
        return exprAst ? { ast: exprAst, exprString: res.expr } : null;
      }
      // Local identifier (not an import) - use as-is
      if (branch.type === "Identifier") {
        return { ast: branch, exprString: info.rootName };
      }
    }
    return null;
  };

  const getFunctionParamName = (node: any): string | null => {
    if (node?.type !== "ArrowFunctionExpression" && node?.type !== "FunctionExpression") {
      return null;
    }
    const firstParam = node.params?.[0];
    return firstParam?.type === "Identifier" ? firstParam.name : null;
  };

  /**
   * Parses a ternary test expression to extract the prop name.
   * Supports:
   * - Simple prop access: props.x
   * - Member expression: props.$collapsed
   */
  const parseTernaryTestPropName = (test: any, paramName: string | null): string | null => {
    if (!test || !paramName) {
      return null;
    }
    const propPath = getMemberPathFromIdentifier(test, paramName);
    if (propPath && propPath.length === 1) {
      const propName = propPath[0]!;
      // Don't treat theme access as a prop-based condition
      if (propName !== "theme") {
        return propName;
      }
    }
    return null;
  };

  /**
   * Extracts the theme path from a ternary test that accesses `props.theme.*`.
   * e.g., `props.theme.isDark` → "isDark", `props.theme.mode` → "mode"
   */
  const extractThemePathFromCondTest = (test: any, paramName: string | null): string | null => {
    if (!test || !paramName) {
      return null;
    }
    const path = getMemberPathFromIdentifier(test, paramName);
    return path && path[0] === "theme" && path.length > 1 ? path.slice(1).join(".") : null;
  };

  const resolveCssHelperTemplate = (
    template: any,
    paramName: string | null,
    loc: { line: number; column: number } | null | undefined,
    options?: CssHelperTemplateOptions,
  ): {
    style: Record<string, unknown>;
    dynamicProps: Array<{ jsxProp: string; stylexProp: string }>;
    conditionalVariants: ConditionalVariant[];
  } | null => {
    const bail = (
      type: WarningType,
      context?: { property?: string },
      exprLoc?: { line: number; column: number } | null,
    ): null => {
      warnings.push({
        severity: "warning",
        type,
        loc: exprLoc ?? loc,
        context,
      });
      return null;
    };

    const templateLoc = getNodeLocStart(template) ?? loc;
    const { rules, slotExprById, rawCss } = parseCssTemplateToRules(template);

    const out: Record<string, unknown> = {};
    const dynamicProps: Array<{ jsxProp: string; stylexProp: string }> = [];
    const dynamicPropKeys = new Set<string>();
    const conditionalVariants: ConditionalVariant[] = [];

    const lookupImport = (localName: string) => importMap.get(localName) ?? null;

    for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
      const rule = rules[ruleIndex]!;
      const rawMedia = findSupportedAtRule(rule.atRuleStack);
      // Support StyleX condition at-rules; bail on non-StyleX at-rules or unsafe mixed stacks.
      // Mixed stacks must also bail because preserving only one condition would be too broad.
      if (hasUnsupportedAtRule(rule.atRuleStack)) {
        return bail(
          "Conditional `css` block: unsupported or mixed @-rules require manual handling",
        );
      }

      // Resolve __SC_EXPR_N__ placeholders inside the media query
      let media: string | undefined = rawMedia;
      let computedMediaKey: ResolvedMedia | null = null;
      if (rawMedia) {
        const resolved = resolveMediaAtRulePlaceholders(
          rawMedia,
          (slotId) => slotExprById.get(slotId),
          {
            lookupImport,
            resolveValue,
            resolveSelector: args.resolveSelector,
            parseExpr,
            filePath,
            resolverImports,
          },
        );
        if (resolved === null) {
          return bail(
            "Conditional `css` block: media query interpolation must be a simple imported reference (expressions like `value + 1` are not supported)",
          );
        }
        if (resolved.kind === "static") {
          media = resolved.value;
        } else {
          computedMediaKey = resolved;
          media = undefined;
        }
      }

      const rawSelector = (rule.selector ?? "").trim();
      const specificityResult = normalizeSpecificityHacks(rawSelector);
      if (specificityResult.hasHigherTier) {
        return bail(
          "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
        );
      }
      if (specificityResult.wasStripped && options?.rejectStrippedSpecificity) {
        return bail(
          "Styled-components specificity hacks like `&&` / `&&&` are not representable in StyleX",
          undefined,
          computeSelectorWarningLoc(templateLoc ?? undefined, rawCss, rawSelector) ?? templateLoc,
        );
      }
      const selector = specificityResult.normalized.trim();
      const specificityStripped = specificityResult.wasStripped;
      const allowDynamicValues = selector === "&";
      let target = out;
      // Track pseudo-class context for property-first format (e.g., ":hover")
      // Pseudo-elements (::before, ::after) use selector-first format in StyleX,
      // so they use nested target objects instead.
      let currentPseudoClass: string | null = null;
      // For comma-separated pseudo-elements (e.g., "&:before, &:after"),
      // declarations are duplicated into each pseudo-element's nested object.
      let pseudoElementTargets: Array<{ key: string; obj: Record<string, unknown> }> | null = null;
      if (selector !== "&") {
        const parsed = parseSelector(selector);

        if (parsed.kind === "pseudoElement") {
          const nested = (out[parsed.element] as Record<string, unknown>) ?? {};
          out[parsed.element] = nested;
          target = nested;
        } else if (parsed.kind === "pseudoElements") {
          pseudoElementTargets = parsed.elements.map((el) => {
            const nested = (out[el] as Record<string, unknown>) ?? {};
            out[el] = nested;
            return { key: el, obj: nested };
          });
          // Use the first pseudo-element's target as the primary target for iteration below
          target = pseudoElementTargets[0]?.obj ?? out;
        } else if (parsed.kind === "pseudoElementWithPseudo" && parsed.pseudos.length === 1) {
          const nested = (out[parsed.element] as Record<string, unknown>) ?? {};
          out[parsed.element] = nested;
          target = nested;
          currentPseudoClass = parsed.pseudos[0]!;
        } else if (parsed.kind === "pseudo" && parsed.pseudos.length === 1) {
          const simplePseudo = parsed.pseudos[0]!;
          // Pseudo-classes (:hover, :focus, etc.) use property-first format:
          // { prop: { default: null, ":hover": value } }
          currentPseudoClass = simplePseudo;
        } else {
          return bail(
            "Conditional `css` block: unsupported selector",
            undefined,
            computeSelectorWarningLoc(templateLoc ?? undefined, rawCss, selector) ?? templateLoc,
          );
        }
      }

      // Merge a value into the appropriate nested context (pseudo-class, @media, or computed key).
      // Handles all combinations: base, pseudo-only, media-only, computed-media, pseudo+media.
      const mergeIntoContext = (
        value: unknown,
        prop: string,
        targetObj: Record<string, unknown>,
      ): unknown => {
        const existing = targetObj[prop];
        if (computedMediaKey) {
          const nested: Record<string, unknown> =
            existing &&
            typeof existing === "object" &&
            !Array.isArray(existing) &&
            !isAstNode(existing)
              ? (existing as Record<string, unknown>)
              : { default: existing ?? null };
          if (!("default" in nested)) {
            nested.default = null;
          }
          const prev = (nested.__computedKeys as Array<{ keyExpr: unknown; value: unknown }>) ?? [];
          nested.__computedKeys = [...prev, { keyExpr: computedMediaKey.keyExpr, value }];
          return nested;
        }
        if (media && currentPseudoClass) {
          // Nested pseudo + media: { ":hover": { default: null, "@media (...)": value } }
          const pseudoExisting =
            existing &&
            typeof existing === "object" &&
            !Array.isArray(existing) &&
            !isAstNode(existing)
              ? (existing as Record<string, unknown>)[currentPseudoClass]
              : undefined;
          const mediaWrapped = mergeIntoPseudoContext(value, media, pseudoExisting);
          return mergeIntoPseudoContext(mediaWrapped, currentPseudoClass, existing);
        }
        if (media) {
          return mergeIntoPseudoContext(value, media, existing);
        }
        return mergeIntoPseudoContext(value, currentPseudoClass, existing);
      };

      // Snapshot existing keys so we only duplicate NEW properties set by this rule
      // (not stale state accumulated from earlier rules).
      const preRuleKeys =
        pseudoElementTargets && pseudoElementTargets.length > 1
          ? new Set(Object.keys(pseudoElementTargets[0]!.obj))
          : null;

      for (let declIndex = 0; declIndex < rule.declarations.length; declIndex++) {
        const d = rule.declarations[declIndex]!;
        if (!d.property) {
          return bail("Conditional `css` block: missing CSS property name");
        }
        if (d.value.kind === "static") {
          // Expand animation shorthand referencing inline @keyframes
          if (
            d.property === "animation" &&
            args.keyframesNames &&
            args.keyframesNames.size > 0 &&
            args.j
          ) {
            const expanded: Record<string, unknown> = {};
            if (
              expandStaticAnimationShorthand(
                d.valueRaw,
                args.keyframesNames,
                args.j,
                expanded,
                args.inlineKeyframeNameMap,
              )
            ) {
              for (const [prop, value] of Object.entries(expanded)) {
                setStyleObjectValue(
                  target as Record<string, unknown>,
                  prop,
                  mergeIntoContext(value, prop, target as any),
                );
              }
              continue;
            }
          }
          for (const mapped of cssDeclarationToStylexDeclarations(d)) {
            let value = cssValueToJs(mapped.value, d.important, mapped.prop);
            if (mapped.prop === "content" && typeof value === "string") {
              value = normalizeCssContentValue(value);
            }
            if (specificityStripped) {
              addPropComments(target, mapped.prop, {
                leadingLine: buildSpecificityStrippedComment(rawSelector, mapped.prop),
              });
            }
            setStyleObjectValue(
              target as Record<string, unknown>,
              mapped.prop,
              mergeIntoContext(value, mapped.prop, target as any),
            );
          }
          continue;
        }

        if (d.important) {
          return bail("Conditional `css` block: !important is not supported in StyleX", {
            property: d.property,
          });
        }

        // Resolve interpolated animation declarations referencing keyframes identifiers
        const expandedAnimation = tryExpandInterpolatedAnimation({
          property: d.property,
          valueRaw: d.valueRaw,
          slotExprById,
          keyframesNames: args.keyframesNames,
          j: args.j,
          inlineKeyframeNameMap: args.inlineKeyframeNameMap,
        });
        if (expandedAnimation) {
          for (const [prop, value] of Object.entries(expandedAnimation)) {
            setStyleObjectValue(
              target as Record<string, unknown>,
              prop,
              mergeIntoContext(value, prop, target as any),
            );
          }
          continue;
        }

        const parts = d.value.parts ?? [];

        // Find slots in the value parts
        const slotParts = parts.filter(isSlotPart);
        if (slotParts.length > 1) {
          if (
            d.property === "background" &&
            isUnsupportedBackgroundShorthandValue(d.valueRaw ?? "")
          ) {
            return bail(
              "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand",
              { property: d.property },
            );
          }
          const mappedDecls = cssDeclarationToStylexDeclarations(d);
          if (mappedDecls.some((mapped) => isStylexShorthandCamelCase(mapped.prop))) {
            return bail(
              "Conditional `css` block: multiple interpolation slots in a single property value",
              { property: d.property },
            );
          }
          const resolvedSlots = new Map<number, StaticSlotResolution>();
          for (const part of slotParts) {
            const expr = slotExprById.get(part.slotId);
            if (!expr) {
              return bail("Conditional `css` block: missing interpolation expression", {
                property: d.property,
              });
            }
            const resolved = resolveStaticSlot(expr, d.property, paramName);
            if (!resolved) {
              return bail(
                "Conditional `css` block: multiple interpolation slots in a single property value",
                { property: d.property },
              );
            }
            resolvedSlots.set(part.slotId, resolved);
          }
          const valueAst = buildStaticInterpolatedValue(parts, resolvedSlots);
          if (!valueAst) {
            return bail(
              "Conditional `css` block: multiple interpolation slots in a single property value",
              { property: d.property },
            );
          }
          for (const mapped of mappedDecls) {
            setStyleObjectValue(
              target as Record<string, unknown>,
              mapped.prop,
              mergeIntoContext(valueAst, mapped.prop, target as any),
            );
          }
          continue;
        }
        if (slotParts.length !== 1) {
          // Only support single-slot values
          return bail(
            "Conditional `css` block: multiple interpolation slots in a single property value",
            { property: d.property },
          );
        }

        // Check if there are static parts around the slot (e.g., box-shadow: 0 0 0 1px ${theme})
        const hasStaticParts = parts.length > 1;

        const slotPart = slotParts[0] as { kind: "slot"; slotId: number };
        const slotId = slotPart.slotId;
        const expr = slotExprById.get(slotId);
        if (!expr) {
          return bail("Conditional `css` block: missing interpolation expression", {
            property: d.property,
          });
        }
        const exprLoc = (expr as { loc?: { start?: { line: number; column: number } } }).loc?.start;
        if (hasCallExpressionInExpr(expr)) {
          // Try resolving imported function calls via the adapter before bailing.
          // This handles patterns like colorCSS("labelMuted") inside conditional css blocks.
          const callResolved =
            adapterCallResolver && tryResolveAdapterCall(expr, d.property, adapterCallResolver);
          if (callResolved) {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              if (hasStaticParts) {
                const { prefix, suffix } = extractPrefixSuffix(parts);
                const wrappedExpr = wrapExprWithStaticParts(
                  callResolved.exprString,
                  prefix,
                  suffix,
                );
                const templateAst = parseExpr(wrappedExpr);
                if (templateAst) {
                  setStyleObjectValue(
                    target as Record<string, unknown>,
                    mapped.prop,
                    mergeIntoContext(templateAst, mapped.prop, target as any),
                  );
                }
              } else {
                setStyleObjectValue(
                  target as Record<string, unknown>,
                  mapped.prop,
                  mergeIntoContext(callResolved.ast, mapped.prop, target as any),
                );
              }
            }
            continue;
          }
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        const slotExprNode = expr as any;
        const slotBodyExpr =
          slotExprNode.type === "ArrowFunctionExpression" ||
          slotExprNode.type === "FunctionExpression"
            ? getFunctionBodyExpr(slotExprNode)
            : slotExprNode;
        const slotParamName = getFunctionParamName(slotExprNode) ?? paramName;
        const resolved = resolveHelperExprToAst(slotBodyExpr, slotParamName);
        const branchStaticParts = hasStaticParts
          ? extractPrefixSuffix(parts)
          : { prefix: "", suffix: "" };
        const buildResolvedBranchStyle = (
          branchResolved: TernaryBranchResolution,
        ): Record<string, unknown> | null => {
          const branchStyle: Record<string, unknown> = {};
          if (branchResolved.staticValue !== undefined) {
            const rawValue = `${branchStaticParts.prefix}${branchResolved.staticValue}${branchStaticParts.suffix}`;
            if (
              d.property?.trim() === "background" &&
              isUnsupportedBackgroundShorthandValue(rawValue)
            ) {
              return null;
            }
            for (const mapped of cssDeclarationToStylexDeclarations({
              ...d,
              value: { kind: "static", value: rawValue },
              valueRaw: rawValue,
            })) {
              setStyleObjectValue(
                branchStyle,
                mapped.prop,
                mergeIntoContext(
                  cssValueToJs(mapped.value, d.important, mapped.prop),
                  mapped.prop,
                  target as any,
                ),
              );
            }
            const borderMatch = d.property?.trim().match(/^border(?:-(top|right|bottom|left))?$/);
            if (borderMatch) {
              const direction = borderMatch[1]
                ? borderMatch[1].charAt(0).toUpperCase() + borderMatch[1].slice(1)
                : "";
              if (
                !(`border${direction}Width` in branchStyle) ||
                !(`border${direction}Style` in branchStyle) ||
                !(`border${direction}Color` in branchStyle)
              ) {
                return null;
              }
            }
            if (d.property?.trim() === "background") {
              if ("backgroundImage" in branchStyle && !("backgroundColor" in branchStyle)) {
                branchStyle.backgroundColor = mergeIntoContext(
                  cssValueToJs(
                    { kind: "static", value: "transparent" },
                    d.important,
                    "backgroundColor",
                  ),
                  "backgroundColor",
                  target as any,
                );
              }
              if ("backgroundColor" in branchStyle && !("backgroundImage" in branchStyle)) {
                const imageResetValue = [
                  "inherit",
                  "initial",
                  "unset",
                  "revert",
                  "revert-layer",
                ].includes(rawValue.trim())
                  ? rawValue.trim()
                  : "none";
                branchStyle.backgroundImage = mergeIntoContext(
                  cssValueToJs(
                    { kind: "static", value: imageResetValue },
                    d.important,
                    "backgroundImage",
                  ),
                  "backgroundImage",
                  target as any,
                );
              }
            }
            return branchStyle;
          }

          if (d.important || d.property?.trim() === "background") {
            return null;
          }
          const wrappedExpr = wrapExprWithStaticParts(
            branchResolved.exprString,
            branchStaticParts.prefix,
            branchStaticParts.suffix,
          );
          const ast = parseExpr(wrappedExpr);
          if (!ast) {
            return null;
          }
          const mappedDecls = cssDeclarationToStylexDeclarations(d);
          if (mappedDecls.some((mapped) => isStylexShorthandCamelCase(mapped.prop))) {
            return null;
          }
          for (const mapped of mappedDecls) {
            setStyleObjectValue(
              branchStyle,
              mapped.prop,
              mergeIntoContext(ast, mapped.prop, target as any),
            );
          }
          return branchStyle;
        };
        const haveSameStyleProps = (
          left: Record<string, unknown>,
          right: Record<string, unknown>,
        ): boolean => {
          const leftKeys = Object.keys(left);
          const rightKeys = Object.keys(right);
          return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right);
        };
        const conflictsWithLaterCssProperty = (stylexProp: string, cssProp: string): boolean => {
          const normalizedCssProp = cssProp.trim();
          if (
            (stylexProp.startsWith("padding") && normalizedCssProp.startsWith("padding")) ||
            (stylexProp.startsWith("margin") && normalizedCssProp.startsWith("margin")) ||
            (stylexProp.startsWith("background") && normalizedCssProp.startsWith("background"))
          ) {
            return true;
          }
          const borderCategory = stylexProp.match(
            /^border(?:Top|Right|Bottom|Left)?(Width|Style|Color)$/,
          )?.[1];
          if (!borderCategory || !normalizedCssProp.startsWith("border")) {
            return false;
          }
          if (
            normalizedCssProp === "border" ||
            /^border-(top|right|bottom|left)$/.test(normalizedCssProp)
          ) {
            return true;
          }
          return normalizedCssProp.endsWith(`-${borderCategory.toLowerCase()}`);
        };
        const hasLaterStylexPropOverlap = (style: Record<string, unknown>): boolean => {
          const props = new Set(Object.keys(style));
          const declarationOverlaps = (laterDecl: (typeof rule.declarations)[number]): boolean => {
            if (!laterDecl.property) {
              return false;
            }
            for (const prop of props) {
              if (conflictsWithLaterCssProperty(prop, laterDecl.property)) {
                return true;
              }
            }
            for (const mapped of cssDeclarationToStylexDeclarations(laterDecl)) {
              if (props.has(mapped.prop)) {
                return true;
              }
            }
            return false;
          };
          for (const laterDecl of rule.declarations.slice(declIndex + 1)) {
            if (declarationOverlaps(laterDecl)) {
              return true;
            }
          }
          for (const laterRule of rules.slice(ruleIndex + 1)) {
            if ((laterRule.selector ?? "") !== (rule.selector ?? "")) {
              continue;
            }
            if (laterRule.declarations.some(declarationOverlaps)) {
              return true;
            }
          }
          return false;
        };
        // Handle ConditionalExpression with theme test: ${props.theme.isDark ? "a" : "b"}
        if (!resolved && (slotBodyExpr as any)?.type === "ConditionalExpression") {
          const ternaryExpr = slotBodyExpr as {
            test: any;
            consequent: any;
            alternate: any;
          };
          const themePath = extractThemePathFromCondTest(ternaryExpr.test, slotParamName);
          if (themePath) {
            const consResolved = resolveTernaryBranchToAst(ternaryExpr.consequent);
            const altResolved = resolveTernaryBranchToAst(ternaryExpr.alternate);
            if (consResolved && altResolved) {
              const consStyle = buildResolvedBranchStyle(consResolved);
              const altStyle = buildResolvedBranchStyle(altResolved);
              if (!consStyle || !altStyle) {
                return bail(
                  "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)",
                  { property: d.property },
                );
              }
              if (hasLaterStylexPropOverlap(consStyle) || hasLaterStylexPropOverlap(altStyle)) {
                return bail(
                  "Conditional `css` block: finite ternary before a later overlapping declaration requires manual source-order handling",
                  { property: d.property },
                );
              }
              conditionalVariants.push({
                when: `theme.${themePath}`,
                propName: "",
                style: consStyle,
              });
              conditionalVariants.push({
                when: `!theme.${themePath}`,
                propName: "",
                style: altStyle,
              });
              continue;
            }
          }
        }
        if (!resolved && hasThemeAccessInExpr(slotBodyExpr, slotParamName)) {
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        if (resolved) {
          if (resolved.staticValue !== undefined) {
            const rawValue = hasStaticParts
              ? `${branchStaticParts.prefix}${resolved.staticValue}${branchStaticParts.suffix}`
              : String(resolved.staticValue);
            if (
              d.property?.trim() === "background" &&
              isUnsupportedBackgroundShorthandValue(rawValue)
            ) {
              return bail(
                "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand",
                { property: d.property },
              );
            }
            const resolvedStaticStyle: Record<string, unknown> = {};
            for (const mapped of cssDeclarationToStylexDeclarations({
              ...d,
              value: { kind: "static", value: rawValue },
              valueRaw: rawValue,
            })) {
              setStyleObjectValue(
                resolvedStaticStyle,
                mapped.prop,
                mergeIntoContext(
                  cssValueToJs(mapped.value, d.important, mapped.prop),
                  mapped.prop,
                  target as any,
                ),
              );
            }
            const borderMatch = d.property?.trim().match(/^border(?:-(top|right|bottom|left))?$/);
            if (borderMatch) {
              const direction = borderMatch[1]
                ? borderMatch[1].charAt(0).toUpperCase() + borderMatch[1].slice(1)
                : "";
              if (
                !(`border${direction}Width` in resolvedStaticStyle) ||
                !(`border${direction}Style` in resolvedStaticStyle) ||
                !(`border${direction}Color` in resolvedStaticStyle)
              ) {
                return bail(
                  "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)",
                  { property: d.property },
                );
              }
            }
            if (d.property?.trim() === "background") {
              if (
                "backgroundImage" in resolvedStaticStyle &&
                !("backgroundColor" in resolvedStaticStyle)
              ) {
                resolvedStaticStyle.backgroundColor = mergeIntoContext(
                  cssValueToJs(
                    { kind: "static", value: "transparent" },
                    d.important,
                    "backgroundColor",
                  ),
                  "backgroundColor",
                  target as any,
                );
              }
              if (
                "backgroundColor" in resolvedStaticStyle &&
                !("backgroundImage" in resolvedStaticStyle)
              ) {
                const imageResetValue = [
                  "inherit",
                  "initial",
                  "unset",
                  "revert",
                  "revert-layer",
                ].includes(rawValue.trim())
                  ? rawValue.trim()
                  : "none";
                resolvedStaticStyle.backgroundImage = mergeIntoContext(
                  cssValueToJs(
                    { kind: "static", value: imageResetValue },
                    d.important,
                    "backgroundImage",
                  ),
                  "backgroundImage",
                  target as any,
                );
              }
            }
            for (const [prop, value] of Object.entries(resolvedStaticStyle)) {
              setStyleObjectValue(target as Record<string, unknown>, prop, value);
            }
            continue;
          }
          if (hasStaticParts) {
            const { prefix, suffix } = extractPrefixSuffix(parts);
            const borderParts = parseInterpolatedBorderStaticParts({
              prop: d.property.trim(),
              prefix,
              suffix,
            });
            if (borderParts) {
              if (borderParts.width) {
                setStyleObjectValue(
                  target as Record<string, unknown>,
                  borderParts.widthProp,
                  mergeIntoContext(borderParts.width, borderParts.widthProp, target as any),
                );
              }
              if (borderParts.style) {
                setStyleObjectValue(
                  target as Record<string, unknown>,
                  borderParts.styleProp,
                  mergeIntoContext(borderParts.style, borderParts.styleProp, target as any),
                );
              }
              setStyleObjectValue(
                target as Record<string, unknown>,
                borderParts.colorProp,
                mergeIntoContext(resolved.ast, borderParts.colorProp, target as any),
              );
              continue;
            }
            // Create a template literal string using the shared helper (same logic as top-level)
            const wrappedExpr = wrapExprWithStaticParts(resolved.exprString, prefix, suffix);
            const templateAst = parseExpr(wrappedExpr);
            if (templateAst) {
              for (const mapped of cssDeclarationToStylexDeclarations(d)) {
                setStyleObjectValue(
                  target as Record<string, unknown>,
                  mapped.prop,
                  mergeIntoContext(templateAst, mapped.prop, target as any),
                );
              }
              continue;
            }
            // Fall through if parsing failed
            return bail(
              "Conditional `css` block: failed to parse expression",
              { property: d.property },
              exprLoc,
            );
          } else {
            for (const mapped of cssDeclarationToStylexDeclarations(d)) {
              setStyleObjectValue(
                target as Record<string, unknown>,
                mapped.prop,
                mergeIntoContext(resolved.ast, mapped.prop, target as any),
              );
            }
            continue;
          }
        }

        // Handle ConditionalExpression: ${prop ? val1 : val2} or ${prop ? val1 : val2}px
        // We can create variants for each branch, wrapping in pseudo context when needed
        if (slotBodyExpr && (slotBodyExpr as any).type === "ConditionalExpression") {
          const ternaryExpr = slotBodyExpr as {
            type: "ConditionalExpression";
            test: any;
            consequent: any;
            alternate: any;
          };
          const propName = parseTernaryTestPropName(ternaryExpr.test, slotParamName);
          if (propName) {
            const consResolved = resolveTernaryBranchToAst(ternaryExpr.consequent);
            const altResolved = resolveTernaryBranchToAst(ternaryExpr.alternate);
            // If resolution failed (e.g., unresolved import), bail with specific message
            if (!consResolved || !altResolved) {
              return bail(
                "Conditional `css` block: ternary branch value could not be resolved (imported values require adapter support)",
                { property: d.property },
              );
            }
            const altStyle = buildResolvedBranchStyle(altResolved);
            const variantStyle = buildResolvedBranchStyle(consResolved);
            if (altStyle && variantStyle) {
              if (hasLaterStylexPropOverlap(variantStyle) || hasLaterStylexPropOverlap(altStyle)) {
                return bail(
                  "Conditional `css` block: finite ternary before a later overlapping declaration requires manual source-order handling",
                  { property: d.property },
                );
              }
              if (haveSameStyleProps(altStyle, variantStyle)) {
                for (const [prop, value] of Object.entries(altStyle)) {
                  setStyleObjectValue(target as Record<string, unknown>, prop, value);
                }
                conditionalVariants.push({
                  when: propName,
                  propName,
                  style: variantStyle,
                });
              } else {
                conditionalVariants.push({
                  when: propName,
                  propName,
                  style: variantStyle,
                });
                conditionalVariants.push({
                  when: `!${propName}`,
                  propName,
                  style: altStyle,
                });
              }

              continue;
            }
          }
        }

        // Mixed static/dynamic values with non-theme expressions cannot be safely transformed
        // (e.g., border: 1px solid ${props.color} would lose the "1px solid " prefix)
        if (hasStaticParts) {
          return bail(
            "Conditional `css` block: mixed static/dynamic values with non-theme expressions cannot be safely transformed",
            { property: d.property },
          );
        }

        const propPath =
          paramName && (expr as any)?.type
            ? getMemberPathFromIdentifier(expr as any, paramName)
            : null;
        if (!allowDynamicValues || !propPath || propPath.length !== 1) {
          return bail(
            "Conditional `css` block: dynamic interpolation could not be resolved to a single component prop",
            { property: d.property },
            exprLoc,
          );
        }
        const jsxProp = propPath[0]!;
        if (jsxProp === "theme") {
          return bail(
            "Conditional `css` block: failed to parse expression",
            { property: d.property },
            exprLoc,
          );
        }
        for (const mapped of cssDeclarationToStylexDeclarations(d)) {
          const key = `${jsxProp}:${mapped.prop}`;
          if (!dynamicPropKeys.has(key)) {
            dynamicPropKeys.add(key);
            dynamicProps.push({ jsxProp, stylexProp: mapped.prop });
          }
        }
      }

      // For comma-separated pseudo-elements, duplicate only the declarations
      // added by THIS rule (not stale state from earlier rules) to remaining targets.
      if (pseudoElementTargets && pseudoElementTargets.length > 1 && preRuleKeys) {
        const source = pseudoElementTargets[0]!.obj;
        for (const key of Object.keys(source)) {
          if (!preRuleKeys.has(key)) {
            for (let i = 1; i < pseudoElementTargets.length; i++) {
              pseudoElementTargets[i]!.obj[key] = source[key];
            }
          }
        }
      }
    }

    return { style: out, dynamicProps, conditionalVariants };
  };

  return { isCssHelperTaggedTemplate, resolveCssHelperTemplate };
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

/**
 * Merges a value into a pseudo-class context map for StyleX property-first format.
 *
 * When `pseudoClass` is non-null:
 * - If `existing` is already a pseudo map (plain object, not an AST node),
 *   adds/overwrites the pseudo entry
 * - If `existing` is a scalar or AST node, promotes it to `default` and adds the pseudo entry
 * - Otherwise creates `{ default: null, [pseudoClass]: value }`
 *
 * When `pseudoClass` is null (root selector), returns the value unchanged.
 */
function mergeIntoPseudoContext(
  value: unknown,
  pseudoClass: string | null,
  existing: unknown,
): unknown {
  if (!pseudoClass) {
    return value;
  }
  // Plain objects (not AST nodes, not arrays) are existing pseudo maps — extend them
  if (
    existing &&
    typeof existing === "object" &&
    !Array.isArray(existing) &&
    !isAstNode(existing)
  ) {
    return { ...(existing as Record<string, unknown>), [pseudoClass]: value };
  }
  // Scalar base value, AST node, or no existing value — create a new pseudo map
  const defaultVal = existing !== undefined ? existing : null;
  return { default: defaultVal, [pseudoClass]: value };
}
