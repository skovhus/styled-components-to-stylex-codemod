/**
 * Pseudo-selector token helpers and interpolated pseudo-class resolution.
 *
 * Resolves interpolated pseudo-class selectors (`&:${expr}`) via the adapter
 * (`pseudoAlias` / `pseudoExpand`), and provides pseudo-token parsing helpers
 * plus recovery of standalone conditional interpolations inside pseudo blocks.
 */
import type { SelectorResolveResult } from "../../adapter.js";
import type { DeclProcessingState } from "./decl-setup.js";
import {
  cloneAstNode,
  extractRootAndPath,
  getArrowFnParamBindings,
  getNodeLocStart,
} from "../utilities/jscodeshift-utils.js";
import { capitalize, kebabToCamelCase } from "../utilities/string-utils.js";
import { styleKeyWithSuffix } from "../transform/helpers.js";
import { createPropTestHelpers } from "./variant-utils.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { parseCssDeclarationBlock } from "../builtin-handlers/css-parsing.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { ExpressionKind } from "./decl-types.js";
import { registerImports, type AdapterCallResolver } from "./utils.js";
import { processDeclarationsIntoBucket } from "./decl-bucket-resolution.js";

/**
 * Attempts to resolve an interpolated pseudo-class selector (`&:${expr}`) via the
 * adapter's `resolveSelector`. Handles `pseudoAlias` (builds N separate style
 * objects, one per pseudo value) and `media` (merges into perPropPseudo
 * with nested media guards).
 *
 * Returns "bail" if resolution fails or the pattern isn't supported.
 */
export function tryResolveInterpolatedPseudo(
  slotExpr: unknown,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
  prefixPseudo?: string | null,
): "bail" | void {
  const { state } = ctx;
  const { resolveSelector, resolveImportInScope } = state;

  if (!slotExpr) {
    return "bail";
  }

  // Extract root + path from the expression (works for both Identifier and MemberExpression)
  const info = extractRootAndPath(slotExpr);
  if (!info) {
    return "bail";
  }

  const imp = resolveImportInScope(info.rootName, info.rootNode);
  if (!imp) {
    return "bail";
  }

  const selectorResult = resolveSelector({
    kind: "selectorInterpolation",
    importedName: imp.importedName,
    source: imp.source,
    path: info.path.length > 0 ? info.path.join(".") : undefined,
    filePath: state.filePath,
    loc: getNodeLocStart(slotExpr) ?? undefined,
  });

  if (!selectorResult) {
    return "bail";
  }

  if (selectorResult.kind === "pseudoAlias") {
    // pseudoAlias emits separate style objects per pseudo value — prefix pseudo
    // composition (e.g. `:not(:disabled):${highlight}`) is not supported here.
    if (prefixPseudo) {
      return "bail";
    }
    return handlePseudoAlias(selectorResult, rule, ctx);
  }

  if (selectorResult.kind === "pseudoExpand") {
    if (prefixPseudo && containsPseudoToken(prefixPseudo, "enabled")) {
      return "bail";
    }
    return handlePseudoExpand(selectorResult, imp.importedName, rule, ctx, prefixPseudo);
  }

  // "media" kind is not applicable for pseudo selectors
  return "bail";
}

export function hasEnabledCompoundPseudoSelector(selector: string): boolean {
  return selector.split(",").some((part) => {
    const trimmed = part.trim();
    if (!trimmed.startsWith("&")) {
      return false;
    }
    const pseudoTokens = extractPseudoTokens(trimmed);
    return pseudoTokens.includes("enabled") && pseudoTokens.length > 1;
  });
}

export function isStylexCompilerPseudoElement(selector: string): boolean {
  // StyleX Babel treats any selector key that starts with `::` as a pseudo-element.
  // Keep this broader than the eslint plugin's finite allowlist so linter lag does not force bailouts.
  return selector.startsWith("::");
}

function containsPseudoToken(selector: string, token: string): boolean {
  return extractPseudoTokens(selector).includes(token);
}

function extractPseudoTokens(selector: string): string[] {
  return [...selector.matchAll(/:(?!:)([a-zA-Z][a-zA-Z0-9-]*)/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined);
}

/**
 * Handles `pseudoAlias` result: builds N extra style objects (one per pseudo value)
 * and registers them on `decl.pseudoAliasSelectors` for the emit phase.
 *
 * Wraps the style args in a `styleSelectorExpr` function call for runtime selection.
 */
function handlePseudoAlias(
  result: Extract<SelectorResolveResult, { kind: "pseudoAlias" }>,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): "bail" | void {
  const prepared = preparePseudoBucket(rule, ctx);
  if (prepared === "bail") {
    return "bail";
  }
  const { flatBucket, guard } = prepared;
  const { state, decl, extraStyleObjects, styleObj, cssHelperPropValues, getComposedDefaultValue } =
    ctx;
  const { parseExpr, resolverImports } = state;

  // Build N style objects (one per pseudo value)
  const styleKeys: string[] = [];
  const guardBase = guard ? styleKeyWithSuffix(decl.styleKey, guard.when) : decl.styleKey;
  for (const pseudoName of result.values) {
    const pseudo = `:${pseudoName}`;
    const styleKey = `${guardBase}Pseudo${capitalize(kebabToCamelCase(pseudoName))}`;
    styleKeys.push(styleKey);

    const styleObjForPseudo: Record<string, unknown> = {};
    for (const prop of Object.keys(flatBucket)) {
      const value = flatBucket[prop];
      const baseValue =
        (styleObj as Record<string, unknown>)[prop] ??
        (cssHelperPropValues.has(prop) ? getComposedDefaultValue(prop) : null);
      styleObjForPseudo[prop] = { default: baseValue, [pseudo]: value };
    }
    extraStyleObjects.set(styleKey, styleObjForPseudo);
  }

  // Parse the styleSelectorExpr
  const parsedSelectorExpr = parseExpr(result.styleSelectorExpr);
  if (!parsedSelectorExpr) {
    return "bail";
  }

  // Register on the decl for the emit phase
  decl.pseudoAliasSelectors ??= [];
  decl.pseudoAliasSelectors.push({
    styleKeys,
    styleSelectorExpr: parsedSelectorExpr,
    pseudoNames: result.values,
    ...(guard ? { guard } : {}),
  });

  // Add imports from the adapter result
  registerImports(result.imports, resolverImports);

  decl.needsWrapperComponent = true;
}

/**
 * Handles `pseudoExpand` result: merges pseudo expansions into the root style
 * object (via perPropPseudo) when unguarded, or creates a separate guarded
 * style object for conditional application.
 *
 * For each CSS property, creates a nested structure like:
 * ```
 * { default: baseValue, ':active': value, ':hover': { default: null, [condition]: value } }
 * ```
 */
function handlePseudoExpand(
  result: Extract<SelectorResolveResult, { kind: "pseudoExpand" }>,
  importedName: string,
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
  prefixPseudo?: string | null,
): "bail" | void {
  const prepared = preparePseudoBucket(rule, ctx);
  if (prepared === "bail") {
    return "bail";
  }
  const { flatBucket, guard } = prepared;
  const {
    state,
    decl,
    extraStyleObjects,
    perPropPseudo,
    styleObj,
    cssHelperPropValues,
    getComposedDefaultValue,
  } = ctx;
  const { parseExpr, resolverImports } = state;

  // Pre-parse condition expressions once (reused across all CSS properties via cloneAstNode)
  const parsedConditions = result.expansions.map((e) =>
    e.condition ? parseExpr(e.condition.expr) : null,
  );
  if (parsedConditions.some((c, i) => result.expansions[i]!.condition && !c)) {
    return "bail";
  }

  const applyExpansionPseudos = (target: Record<string, unknown>, value: unknown): void => {
    for (let i = 0; i < result.expansions.length; i++) {
      const expansion = result.expansions[i]!;
      // When a prefix pseudo is present (e.g. ":not(:disabled)" from `&:not(:disabled):${highlight}`),
      // prepend it to the expansion pseudo to produce `:not(:disabled):hover` etc.
      const pseudo = prefixPseudo ? `${prefixPseudo}:${expansion.pseudo}` : `:${expansion.pseudo}`;
      if (expansion.condition) {
        const newEntry = {
          keyExpr: cloneAstNode(parsedConditions[i]!),
          value: cloneAstNode(value),
        };
        const existing = target[pseudo];
        if (existing && typeof existing === "object" && "__computedKeys" in existing) {
          (existing.__computedKeys as unknown[]).push(newEntry);
        } else {
          target[pseudo] = { default: target.default ?? null, __computedKeys: [newEntry] };
        }
      } else {
        target[pseudo] = cloneAstNode(value);
      }
    }
  };

  if (!guard) {
    // No guard: merge directly into perPropPseudo so expansions become part of the root style.
    // NOTE: when after-base segments are active (from resolved styles helpers mid-template),
    // the pseudo-expand properties still merge into the base styleObj rather than the segment.
    // This is acceptable because pseudo-expand produces per-property pseudo maps whose
    // `default` values are copies of the base — they don't introduce new cascade conflicts
    // beyond what the base already has.
    for (const prop of Object.keys(flatBucket)) {
      const value = flatBucket[prop];
      const baseValue =
        (styleObj as Record<string, unknown>)[prop] ??
        (cssHelperPropValues.has(prop) ? getComposedDefaultValue(prop) : null);
      perPropPseudo[prop] ??= {};
      const existing = perPropPseudo[prop]!;
      if (!("default" in existing)) {
        existing.default = baseValue;
      }
      applyExpansionPseudos(existing, value);
    }
  } else {
    // Guarded: create separate style object for conditional application
    const guardBase = styleKeyWithSuffix(decl.styleKey, guard.when);
    const styleKey = `${guardBase}${capitalize(kebabToCamelCase(importedName))}`;
    const mergedStyleObj: Record<string, unknown> = {};
    for (const prop of Object.keys(flatBucket)) {
      const value = flatBucket[prop];
      const baseValue =
        (styleObj as Record<string, unknown>)[prop] ??
        (cssHelperPropValues.has(prop) ? getComposedDefaultValue(prop) : null);
      const nested: Record<string, unknown> = { default: baseValue };
      applyExpansionPseudos(nested, value);
      mergedStyleObj[prop] = nested;
    }
    extraStyleObjects.set(styleKey, mergedStyleObj);
    decl.pseudoExpandSelectors ??= [];
    decl.pseudoExpandSelectors.push({ styleKey, guard });
    decl.needsWrapperComponent = true;
  }

  // Collect imports: shared + per-condition
  registerImports(result.imports, resolverImports);
  for (const expansion of result.expansions) {
    if (expansion.condition) {
      registerImports(expansion.condition.imports, resolverImports);
    }
  }
}

/**
 * Shared preamble for pseudo-alias and pseudo-expand handlers.
 * Bails on at-rules, processes declarations into a flat bucket,
 * and recovers standalone interpolations if the bucket is empty.
 */
function preparePseudoBucket(
  rule: DeclProcessingState["decl"]["rules"][number],
  ctx: DeclProcessingState,
): { flatBucket: Record<string, unknown>; guard?: { when: string } } | "bail" {
  if (rule.atRuleStack.length > 0) {
    return "bail";
  }

  const { state, decl } = ctx;
  const {
    j,
    resolveThemeValue,
    resolveThemeValueFromFn,
    resolveCall,
    resolveImportInScope,
    parseExpr,
    resolverImports,
    filePath,
  } = state;

  const callResolver: AdapterCallResolver = {
    resolveCall,
    resolveImportInScope,
    parseExpr,
    resolverImports,
    filePath,
  };

  const flatBucket: Record<string, unknown> = {};
  const writeResult = processDeclarationsIntoBucket(
    rule,
    flatBucket,
    j,
    decl,
    resolveThemeValue,
    resolveThemeValueFromFn,
    { bailOnUnresolved: true, callResolver },
  );
  if (writeResult === "bail") {
    return "bail";
  }

  let guard: { when: string } | undefined;
  if (Object.keys(flatBucket).length === 0) {
    const recovered = recoverStandaloneInterpolationsInPseudoBlock(rule, decl);
    if (!recovered) {
      return "bail";
    }
    Object.assign(flatBucket, recovered.cssProps);
    guard = { when: recovered.when };

    if (recovered.propName && !recovered.propName.startsWith("$")) {
      ensureShouldForwardPropDrop(decl, recovered.propName);
    }
  }

  return { flatBucket, guard };
}

/**
 * Recovers standalone conditional interpolations from inside a pseudo-alias block.
 *
 * When Stylis drops standalone placeholders at brace depth > 0, the pseudo-alias
 * rule ends up empty. This function reads the raw CSS template to find the block,
 * extracts the arrow function condition and CSS text, and returns parsed CSS props.
 */
function recoverStandaloneInterpolationsInPseudoBlock(
  rule: DeclProcessingState["decl"]["rules"][number],
  decl: DeclProcessingState["decl"],
): {
  when: string;
  propName: string;
  cssProps: Record<string, unknown>;
} | null {
  const { rawCss, templateExpressions } = decl;
  if (!rawCss) {
    return null;
  }

  // Extract pseudo slot ID from rule selector
  const pseudoSlotMatch = rule.selector.match(PLACEHOLDER_RE);
  if (!pseudoSlotMatch) {
    return null;
  }
  const pseudoSlotId = pseudoSlotMatch[1];

  // Find the pseudo block in rawCss: `&:__SC_EXPR_<id>__` or `&&:__SC_EXPR_<id>__`
  const blockRegex = new RegExp(`&&?:\\s*__SC_EXPR_${pseudoSlotId}__\\s*\\{([^}]*)\\}`);
  const blockMatch = rawCss.match(blockRegex);
  if (!blockMatch?.[1]) {
    return null;
  }

  // Find standalone __SC_EXPR_N__ in the block content
  const standaloneSlotRegex = new RegExp(PLACEHOLDER_RE.source, "g");
  const slots: number[] = [];
  let slotMatch;
  while ((slotMatch = standaloneSlotRegex.exec(blockMatch[1])) !== null) {
    slots.push(Number(slotMatch[1]));
  }

  // Only handle single standalone interpolation for now
  if (slots.length !== 1) {
    return null;
  }

  const slotId = slots[0]!;
  const expr = templateExpressions[slotId];
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ArrowFunctionExpression"
  ) {
    return null;
  }

  const bindings = getArrowFnParamBindings(expr as any);
  if (!bindings) {
    return null;
  }

  const { parseTestInfo } = createPropTestHelpers(bindings);

  // Extract condition and CSS text from the arrow function body
  const body = (expr as { body?: unknown }).body as
    | {
        type: string;
        operator?: string;
        left?: unknown;
        right?: unknown;
        test?: unknown;
        consequent?: unknown;
        alternate?: unknown;
      }
    | undefined;
  if (!body) {
    return null;
  }

  let test: unknown;
  let cssNode: unknown;
  let needsNegation = false;

  if (body.type === "LogicalExpression" && body.operator === "&&") {
    test = body.left;
    cssNode = body.right;
  } else if (body.type === "ConditionalExpression") {
    test = body.test;
    const consequentCss = extractCssTextFromNode(body.consequent);
    const alternateCss = extractCssTextFromNode(body.alternate);
    // Both branches have CSS - bail (we can't represent both in a single guard)
    if (consequentCss && alternateCss) {
      return null;
    }
    if (consequentCss) {
      cssNode = body.consequent;
    } else if (alternateCss) {
      cssNode = body.alternate;
      needsNegation = true;
    } else {
      return null;
    }
  } else {
    return null;
  }

  const testInfo = parseTestInfo(test as ExpressionKind);
  if (!testInfo?.propName) {
    return null;
  }

  const cssText = extractCssTextFromNode(cssNode);
  if (!cssText) {
    return null;
  }

  const cssProps = parseCssDeclarationBlock(cssText);
  if (!cssProps || Object.keys(cssProps).length === 0) {
    return null;
  }

  const when = needsNegation ? negateWhen(testInfo.when) : testInfo.when;
  return { when, propName: testInfo.propName, cssProps };
}

/** Negates a `when` condition string (e.g. `$active` → `!$active`, `!$x` → `$x`). */
function negateWhen(when: string): string {
  if (when.startsWith("!(") && when.endsWith(")")) {
    return when.slice(2, -1);
  }
  if (when.startsWith("!")) {
    return when.slice(1);
  }
  // Composite conditions (e.g. `big === undefined || big`) cannot be negated by
  // flipping an operator — wrap the whole condition instead.
  if (when.includes(" || ") || when.includes(" && ")) {
    return `!(${when})`;
  }
  if (when.includes(" === ")) {
    return when.replace(" === ", " !== ");
  }
  if (when.includes(" !== ")) {
    return when.replace(" !== ", " === ");
  }
  return `!${when}`;
}

/** Extracts static CSS text from a StringLiteral or zero-expression TemplateLiteral. */
function extractCssTextFromNode(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    type?: string;
    value?: unknown;
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string } }>;
  };
  if (n.type === "StringLiteral" || (n.type === "Literal" && typeof n.value === "string")) {
    return n.value as string;
  }
  if (n.type === "TemplateLiteral" && (!n.expressions || n.expressions.length === 0)) {
    return (n.quasis ?? []).map((q) => q.value?.raw ?? "").join("");
  }
  return null;
}
