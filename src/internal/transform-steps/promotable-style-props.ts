/**
 * Promotable style-prop analysis (plus the prop-comment metadata helpers it
 * depends on) extracted from analyze-before-emit. Promotes JSX call-site
 * `style={{ ... }}` objects on intrinsic styled components into proper
 * `stylex.create` entries when they are static or single-use dynamic, while
 * leaving multi-use dynamic caller style props inline.
 */
import type { JSCodeshift } from "jscodeshift";
import type { PromotedStyleEntry, StyledDecl } from "../transform-types.js";
import { hasInlineableStyleFnOnly } from "../utilities/delegation-utils.js";
import {
  astNodesEqual,
  type ExpressionKind,
  isAstNode,
  isConditionalExpressionNode,
  isPureIdempotentExpression,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import {
  camelToKebabCase,
  isSingleBackgroundComponent,
  isValidIdentifierName,
} from "../utilities/string-utils.js";
import {
  cssDeclarationToStylexDeclarations,
  isStylexStringOnlyCssProp,
} from "../css-prop-mapping.js";
import { extractConditionName } from "../utilities/style-key-naming.js";
import { addPropComments } from "../lower-rules/comments.js";
import {
  propCommentMetadataToAstComments,
  SOURCE_CSS_PROPERTIES_KEY,
  type PropCommentMetadata,
} from "../transform/helpers.js";

/**
 * React-style camelCase CSS property names that promotion refuses to emit into
 * `stylex.create`. Membership means: even when the value is a literal we can
 * read statically, the property is structurally too unconstrained for the
 * codemod to know it's safe (multi-component shorthands, `all`, etc.). Anything
 * NOT in this set is allowed through — StyleX's `valid-styles` and TypeScript
 * types remain the ultimate source of truth for typo/unsupported-prop errors.
 *
 * Keep in sync with the kebab-case sources of truth in this repo:
 * - `STYLEX_LONGHAND_ONLY_SHORTHANDS` in `stylex-shorthands.ts` (handled by
 *   `cssDeclarationToStylexDeclarations`, so they don't appear here).
 * - `NOT_APPLICABLE_SHORTHANDS` in `stylex-property-priorities.test.ts`
 *   (multi-component shorthands the codemod refuses to expand — mirrored here
 *   in camelCase).
 */
export const NON_PROMOTABLE_STYLE_PROPS = new Set<string>([
  // Mirror of NOT_APPLICABLE_SHORTHANDS in `stylex-property-priorities.test.ts`.
  "all",
  "animation",
  "borderBlock",
  "borderInline",
  "font",
  "grid",
  "gridArea",
  "gridTemplate",
  "inset",
  // Additional multi-component shorthands StyleX rejects when given multiple
  // tokens, but which aren't classified by StyleX as shorthandsOfShorthands so
  // they don't appear in NOT_APPLICABLE_SHORTHANDS above.
  "transition",
]);

/**
 * Analyzes JSX call-site `style={{ ... }}` objects for all intrinsic styled components
 * and promotes analyzable static or single-use dynamic style objects to proper
 * `stylex.create` entries.
 *
 * This avoids wrapper components and `mergedSx` calls for components whose
 * call-site style props are static objects. Reused components with dynamic
 * caller styles keep those dynamic values inline so the exceptional call site
 * remains local instead of generating extra StyleX function keys.
 */
export function analyzePromotableStyleProps(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  styledDecls: StyledDecl[],
  /**
   * Every decl in the file, including skipped ones. A preserved `styled(Base)` leaf
   * still references `Base` at runtime, so Base must stay a wrapper — the extends
   * check uses this list so it sees skipped extenders.
   */
  allStyledDecls: StyledDecl[],
  declByLocal: Map<string, StyledDecl>,
  getJsxUsageCount: (name: string) => number,
  resolvedStyleObjects: Map<string, unknown>,
): void {
  // Collect every style key that already exists across the file so promoted
  // entries can be safely deduplicated against unrelated styled components,
  // template-derived variants (`decl.variantStyleKeys`), per-call-site combined
  // styles, and base-component-resolved boolean variants. Without this, a
  // generated variant key like `${baseKey}${ConditionName}` could silently
  // overwrite an unrelated style entry.
  const reservedStyleKeys = collectReservedStyleKeys(resolvedStyleObjects, styledDecls);

  for (const decl of styledDecls) {
    // Only promote for elements that don't already need wrappers and ultimately render
    // as intrinsic elements (either directly or through a chain of styled extensions).
    if (decl.isCssHelper || decl.needsWrapperComponent) {
      continue;
    }
    if (!resolvesToIntrinsic(decl, declByLocal)) {
      continue;
    }
    // Promotion inlines call sites (replacing `<Decl ... style={...}>` with the
    // intrinsic JSX). Inlining is unsafe when the styled decl's resolved style
    // pipeline still has wrapper-scoped expressions or extra-style logic that
    // can't be re-evaluated at the call site. In those cases, the call site
    // would emit unresolved identifiers (e.g. `showProperty(width) ? ...`).
    // Conservatively bail when any of these wrapper-only artifacts are present.
    if (
      decl.inlineStyleProps?.length ||
      decl.extraStylexPropsArgs?.length ||
      decl.extraStyleKeys?.length ||
      decl.styleFnFromProps?.some((p) => p.conditionWhen)
    ) {
      continue;
    }
    // Bail if the base style uses !important on any property — promoting call-site
    // styles to StyleX entries would lose the !important-beats-inline-style semantics.
    if (baseStyleHasImportant(resolvedStyleObjects.get(decl.styleKey))) {
      continue;
    }

    // Collect all JSX call sites for this component.
    const callSites: Array<{ opening: any; children?: unknown[] }> = [];
    root
      .find(j.JSXElement, {
        openingElement: { name: { type: "JSXIdentifier", name: decl.localName } },
      } as object)
      .forEach((p) =>
        callSites.push({ opening: p.node.openingElement, children: p.node.children as unknown[] }),
      );
    root
      .find(j.JSXSelfClosingElement, {
        name: { type: "JSXIdentifier", name: decl.localName },
      } as object)
      .forEach((p) => callSites.push({ opening: p.node }));

    if (callSites.length === 0) {
      continue;
    }

    // Check if ALL call sites with style props are safe to inline. Static style
    // props can be promoted; dynamic style props will be preserved verbatim.
    let allPromotable = true;
    const siteAnalyses: Array<{
      opening: any;
      children?: unknown[];
      styleAttr: any;
      properties: PromotableStyleProperty[];
    }> = [];

    for (const { opening, children } of callSites) {
      const attrs = (opening.attributes ?? []) as any[];

      // Bail condition 6: JSXSpreadAttribute present
      if (attrs.some((a: any) => a.type === "JSXSpreadAttribute")) {
        allPromotable = false;
        break;
      }

      let styleAttr: any = null;
      let hasClassName = false;
      let hasAsProp = false;
      for (const a of attrs) {
        if (a.type !== "JSXAttribute" || a.name?.type !== "JSXIdentifier") {
          continue;
        }
        if (a.name.name === "style") {
          styleAttr = a;
        }
        if (a.name.name === "className") {
          hasClassName = true;
        }
        if (a.name.name === "as" || a.name.name === "forwardedAs") {
          hasAsProp = true;
        }
      }

      // Bail: `as` or `forwardedAs` requires wrapper for polymorphic element handling
      if (hasAsProp) {
        allPromotable = false;
        break;
      }

      // Bail condition 5: className present (needs mergedSx for className merging)
      if (hasClassName) {
        allPromotable = false;
        break;
      }

      // No style prop on this call site → it's fine, no promotion needed
      if (!styleAttr) {
        siteAnalyses.push({ opening, children, styleAttr: null, properties: [] });
        continue;
      }

      // Bail condition 1: style value is not an inline ObjectExpression
      const styleValue = styleAttr.value;
      if (
        !styleValue ||
        styleValue.type !== "JSXExpressionContainer" ||
        !styleValue.expression ||
        styleValue.expression.type !== "ObjectExpression"
      ) {
        allPromotable = false;
        break;
      }

      const objExpr = styleValue.expression;
      const properties: PromotableStyleProperty[] = [];

      let siteBail = false;
      for (const prop of objExpr.properties ?? []) {
        // Bail condition 2: SpreadElement
        if (prop.type === "SpreadElement" || prop.type === "SpreadProperty") {
          siteBail = true;
          break;
        }
        // Bail condition 3: Computed property key
        if (prop.computed) {
          siteBail = true;
          break;
        }
        const keyName =
          prop.key?.type === "Identifier"
            ? prop.key.name
            : prop.key?.type === "StringLiteral"
              ? prop.key.value
              : prop.key?.type === "Literal" && typeof prop.key.value === "string"
                ? prop.key.value
                : null;
        if (!keyName) {
          siteBail = true;
          break;
        }
        // Bail condition 4: CSS custom property keys
        if (keyName.startsWith("--")) {
          siteBail = true;
          break;
        }
        // Promotion only supports React-style identifier keys. Non-identifier keys
        // (e.g. "background-color") are preserved via inline style merging.
        if (!isValidIdentifierName(keyName)) {
          siteBail = true;
          break;
        }
        const comments = extractInlineStylePropComments(prop);
        const staticVal = literalToStaticValue(prop.value);
        if (staticVal !== null) {
          // Route static values through the authoritative CSS → StyleX mapping so
          // shorthands (`padding`, `margin`, `border`, `background`, …) are expanded
          // into longhand-only entries that StyleX accepts.
          const expanded = expandStaticStylePropToStylex(keyName, staticVal);
          if (!expanded) {
            siteBail = true;
            break;
          }
          for (let i = 0; i < expanded.length; i++) {
            const entry = expanded[i]!;
            properties.push({
              key: entry.key,
              staticValue: entry.value,
              dynamicExpr: null,
              comments: i === 0 ? comments : null,
            });
          }
        } else {
          // Dynamic values can't be statically decomposed, so shorthands and
          // multi-component properties on the denylist (or the StyleX-rejected
          // shorthand set) can't be safely promoted with a dynamic value.
          if (isNonPromotableStylexKey(keyName) || FORBIDDEN_SHORTHAND_PROPS.has(keyName)) {
            siteBail = true;
            break;
          }
          properties.push({ key: keyName, staticValue: null, dynamicExpr: prop.value, comments });
        }
      }

      if (siteBail) {
        allPromotable = false;
        break;
      }

      siteAnalyses.push({ opening, children, styleAttr, properties });
    }

    if (!allPromotable) {
      continue;
    }

    // All call sites are safe to inline. Generate static entries and tag JSX nodes.
    const promotedEntries: PromotedStyleEntry[] = [];
    const usageCount = getJsxUsageCount(decl.localName);
    const usedKeyNames = new Set<string>();
    let preservedInlineStylePropCount = 0;

    for (const site of siteAnalyses) {
      if (!site.styleAttr || site.properties.length === 0) {
        continue;
      }

      const allStatic = site.properties.every((p) => p.staticValue !== null);
      const hasDynamic = site.properties.some((p) => p.dynamicExpr !== null);

      if (allStatic && !hasDynamic) {
        // All-static style object
        const staticObj: Record<string, unknown> = {};
        for (const p of site.properties) {
          staticObj[p.key] = coerceToStringForStyleX(p.key, p.staticValue);
          addStylePropComments(staticObj, p.key, p.comments);
        }

        // Single-use component with extending chain: merge into base style key,
        // but only if no promoted property overlaps with existing base properties.
        const canMerge =
          usageCount <= 1 &&
          !decl.isExported &&
          !hasPropertyOverlap(staticObj, resolvedStyleObjects.get(decl.styleKey));
        if (canMerge) {
          promotedEntries.push({
            styleKey: decl.styleKey,
            styleValue: staticObj,
            mergeIntoBase: true,
          });
          (site.opening as any).__promotedMergeIntoBase = true;
        } else {
          // Multi-use or exported: create a new style key.
          const styleKey = generatePromotedStyleKey(decl.styleKey, usedKeyNames, site.children);
          usedKeyNames.add(styleKey);
          promotedEntries.push({ styleKey, styleValue: staticObj });
          (site.opening as any).__promotedStyleKey = styleKey;
        }
      } else if (hasDynamic) {
        if (usageCount > 1) {
          // Reused components read better when the exceptional dynamic caller
          // style stays at the call site instead of generating an extra StyleX
          // function/key alongside the shared wrapper/base style.
          (site.opening as { __preserveInlineStyleProp?: boolean }).__preserveInlineStyleProp =
            true;
          preservedInlineStylePropCount += 1;
          continue;
        }

        // Mixed static+dynamic or all-dynamic: create a dynamic style function.
        // Build static part of the style object and collect dynamic params.
        const inlineStaticObj: Record<string, unknown> = {};
        const dynamicParams: PromotedDynamicParam[] = [];

        for (const p of site.properties) {
          if (p.staticValue !== null) {
            inlineStaticObj[p.key] = coerceToStringForStyleX(p.key, p.staticValue);
            addStylePropComments(inlineStaticObj, p.key, p.comments);
          } else {
            dynamicParams.push({ cssProp: p.key, expr: p.dynamicExpr, comments: p.comments });
          }
        }

        // Don't merge if another styled component extends this one — converting
        // the base style to a function would break the child's static style
        // reference. Also include skipped decls here: a preserved `styled(Base)`
        // leaf references `Base` at runtime and would break if merged.
        const isExtendedByOther = allStyledDecls.some(
          (d) => d !== decl && d.base.kind === "component" && d.base.ident === decl.localName,
        );
        const baseObj = resolvedStyleObjects.get(decl.styleKey);
        const baseIsSimpleObject = isPlainStyleObject(baseObj);
        const isReusable = decl.isExported === true;

        // Shared-ternary promotion: when every dynamic value is the same
        // conditional `cond ? a : b` with literal branches, fold the alternate
        // values into the base and emit the consequent values as a separate
        // boolean-gated variant style. This produces `[styles.x, cond && styles.xVariant]`
        // instead of `styles.x(cond ? a : b, cond ? c : d, ...)`.
        if (!isReusable && !isExtendedByOther && baseIsSimpleObject) {
          const sharedTernary = tryExtractSharedTernaryPromotion({
            dynamicParams,
            inlineStaticObj,
            baseStyleKey: decl.styleKey,
            existingBaseStyles: baseObj,
            usedKeyNames,
            reservedKeys: reservedStyleKeys,
          });
          if (sharedTernary) {
            promotedEntries.push({
              styleKey: decl.styleKey,
              styleValue: sharedTernary.alternateStyles,
              mergeIntoBase: true,
            });
            promotedEntries.push({
              styleKey: sharedTernary.variantKey,
              styleValue: sharedTernary.consequentStyles,
            });
            (site.opening as { __promotedMergeIntoBase?: boolean }).__promotedMergeIntoBase = true;
            (
              site.opening as { __promotedConditionalVariant?: PromotedConditionalVariantTag }
            ).__promotedConditionalVariant = {
              styleKey: sharedTernary.variantKey,
              conditionExpr: sharedTernary.conditionExpr,
            };
            usedKeyNames.add(sharedTernary.variantKey);
            continue;
          }
        }

        // Check if we can merge the base static styles into this dynamic function.
        // This produces a single style entry instead of separate static + dynamic keys.
        const canMergeDynamic =
          !isReusable &&
          !isExtendedByOther &&
          baseIsSimpleObject &&
          !hasPropertyOverlap(inlineStaticObj, baseObj as Record<string, unknown>);

        // Collect all static properties (base + inline) for the merged function body.
        // Dynamic params override base properties with the same key, so filter them out.
        const dynamicPropKeys = new Set(dynamicParams.map((dp) => dp.cssProp));
        const mergedStaticProps: Array<{
          key: string;
          value: unknown;
          comments: PropCommentMetadata | null;
        }> = [];
        if (canMergeDynamic) {
          for (const [k, v] of Object.entries(baseObj as Record<string, unknown>)) {
            if (isPromotedStyleMetadataKey(k)) {
              continue;
            }
            if (!dynamicPropKeys.has(k)) {
              mergedStaticProps.push({
                key: k,
                value: v,
                comments: getStoredPropComments(baseObj as Record<string, unknown>, k),
              });
            }
          }
        }
        for (const [k, v] of Object.entries(inlineStaticObj)) {
          if (isPromotedStyleMetadataKey(k)) {
            continue;
          }
          mergedStaticProps.push({
            key: k,
            value: v,
            comments: getStoredPropComments(inlineStaticObj, k),
          });
        }

        const styleKey = canMergeDynamic
          ? decl.styleKey
          : generatePromotedDynamicStyleKey(decl.styleKey, usedKeyNames, site.children);
        if (!canMergeDynamic) {
          usedKeyNames.add(styleKey);
        }

        // Build the ArrowFunctionExpression AST node.
        // Use CSS property names as function parameter names for self-documenting code.
        // Deduplicate parameters with the same CSS property name.
        const paramEntries: Array<{
          paramName: string;
          cssProp: string;
          type: PromotedParamType;
        }> = [];
        const seenParamNames = new Set<string>();

        for (const dp of dynamicParams) {
          const paramName = dp.cssProp;
          if (!seenParamNames.has(paramName)) {
            seenParamNames.add(paramName);
            paramEntries.push({
              paramName,
              cssProp: dp.cssProp,
              type: inferTypeForCssProp(dp.cssProp, dp.expr),
            });
          }
        }

        const params = paramEntries.map((pe) => {
          const id = j.identifier(pe.paramName);
          const typeNode =
            pe.type === "number"
              ? j.tsNumberKeyword()
              : pe.type === "numberOrString"
                ? j.tsUnionType([j.tsNumberKeyword(), j.tsStringKeyword()])
                : j.tsStringKeyword();
          (id as any).typeAnnotation = j.tsTypeAnnotation(typeNode);
          return id;
        });

        const bodyProperties: ReturnType<typeof j.property>[] = [];
        for (const sp of mergedStaticProps) {
          const val = isAstNode(sp.value)
            ? (sp.value as ExpressionKind)
            : typeof sp.value === "string"
              ? j.stringLiteral(sp.value)
              : typeof sp.value === "number"
                ? j.numericLiteral(sp.value)
                : j.booleanLiteral(sp.value as boolean);
          const prop = j.property("init", j.identifier(sp.key), val);
          attachStylePropComments(prop, sp.comments);
          bodyProperties.push(prop);
        }
        for (const p of site.properties) {
          if (p.dynamicExpr !== null) {
            const prop = j.property("init", j.identifier(p.key), j.identifier(p.key));
            (prop as any).shorthand = true;
            attachStylePropComments(prop, p.comments);
            bodyProperties.push(prop);
          }
        }

        const fnNode = j.arrowFunctionExpression(params, j.objectExpression(bodyProperties));

        if (canMergeDynamic) {
          promotedEntries.push({
            styleKey: decl.styleKey,
            styleValue: fnNode as unknown as Record<string, unknown>,
            mergeIntoBase: true,
          });
          (site.opening as any).__promotedMergeIntoBase = true;
          (site.opening as any).__promotedMergeArgs = dynamicParams.map((dp) =>
            isStylexStringOnlyCssProp(dp.cssProp)
              ? j.callExpression(j.identifier("String"), [dp.expr as ExpressionKind])
              : dp.expr,
          );
        } else {
          promotedEntries.push({
            styleKey,
            styleValue: fnNode as unknown as Record<string, unknown>,
          });

          (site.opening as any).__promotedStyleKey = styleKey;
          const callArgs = dynamicParams.map((dp) =>
            isStylexStringOnlyCssProp(dp.cssProp)
              ? j.callExpression(j.identifier("String"), [dp.expr as ExpressionKind])
              : dp.expr,
          );
          (site.opening as any).__promotedStyleArgs = callArgs;
        }
      }
    }

    if (promotedEntries.length > 0) {
      decl.promotedStyleProps = promotedEntries;
    }
    if (preservedInlineStylePropCount > 0) {
      decl.preserveInlineStyleProps = true;
      decl.preservedInlineStylePropCount = preservedInlineStylePropCount;
    }
  }
}

/**
 * Returns true if an intrinsic styled component's wrapper was set only for
 * styleFnFromProps with transient ($-prefixed) props, and the inline JSX
 * rewrite path can handle the style function calls and prop stripping.
 */
export function canDowngradeStyleFnOnlyWrapper(
  decl: StyledDecl,
  wrapperForcedByPrepass: Set<string>,
): boolean {
  if (!decl.needsWrapperComponent) {
    return false;
  }
  if (wrapperForcedByPrepass.has(decl.localName)) {
    return false;
  }
  if (decl.isCssHelper || decl.isDirectJsxResolution) {
    return false;
  }
  if (decl.base.kind !== "intrinsic") {
    return false;
  }
  if (decl.bridgeClassName || decl.attrWrapper) {
    return false;
  }
  return hasInlineableStyleFnOnly(decl);
}

export function ensureUniqueKey(key: string, ...usedSets: Set<string>[]): string {
  const isUsed = (k: string): boolean => usedSets.some((s) => s.has(k));
  if (!isUsed(key)) {
    return key;
  }
  let i = 2;
  while (isUsed(`${key}${i}`)) {
    i++;
  }
  return `${key}${i}`;
}

/**
 * Snapshot of every style key that is already reserved across the file when
 * `analyzePromotableStyleProps` runs. Used to deduplicate newly-generated
 * promoted keys against unrelated styled components, template-derived variant
 * keys (`decl.variantStyleKeys`), per-call-site combined styles, and base-
 * component-resolved boolean variants — all of which exist in `decl` metadata
 * but may not yet have been injected into `resolvedStyleObjects`.
 */
export function collectReservedStyleKeys(
  resolvedStyleObjects: Map<string, unknown>,
  styledDecls: StyledDecl[],
): Set<string> {
  const keys = new Set<string>(resolvedStyleObjects.keys());
  for (const decl of styledDecls) {
    keys.add(decl.styleKey);
    if (decl.extendsStyleKey) {
      keys.add(decl.extendsStyleKey);
    }
    for (const key of Object.values(decl.variantStyleKeys ?? {})) {
      keys.add(key);
    }
    for (const key of decl.extraStyleKeys ?? []) {
      keys.add(key);
    }
    for (const key of decl.extraStyleKeysAfterBase ?? []) {
      keys.add(key);
    }
    for (const sbv of decl.staticBooleanVariants ?? []) {
      keys.add(sbv.styleKey);
    }
    for (const cs of decl.callSiteCombinedStyles ?? []) {
      keys.add(cs.styleKey);
    }
  }
  return keys;
}

export function mergePromotedStaticStyleObject(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(incoming)) {
    if (key === "__propComments") {
      mergeStoredPropComments(target, value);
      continue;
    }
    if (isPromotedStyleMetadataKey(key)) {
      continue;
    }
    target[key] = value;
  }
}

export function isPlainStyleObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !isAstNode(value) &&
    Object.values(value as Record<string, unknown>).every(
      (v) =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean" || isAstNode(v),
    )
  );
}

/**
 * StyleX shorthand properties that the codemod's CSS expander treats as
 * "longhand-only": StyleX (`@stylexjs/valid-styles`) rejects these when given
 * a multi-token value. We bail from promotion when the helper can't fully
 * decompose them into safe longhands.
 */
const FORBIDDEN_SHORTHAND_PROPS = new Set([
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "background",
]);

/** Returns true when this key is one we refuse to emit into stylex.create. */
function isNonPromotableStylexKey(key: string): boolean {
  return NON_PROMOTABLE_STYLE_PROPS.has(key);
}

/**
 * Expands a static React-style inline style entry into one or more StyleX
 * longhand entries via the authoritative `cssDeclarationToStylexDeclarations`
 * helper. The React key is converted to kebab-case CSS first (e.g.
 * `backgroundColor` → `background-color`) so the helper sees the same input
 * shape it sees when processing styled-components template declarations.
 *
 * Returns null when the input key (or any expanded longhand) is on the
 * non-promotable denylist, or when the helper failed to decompose a forbidden
 * StyleX shorthand. The caller bails in those cases and preserves the original
 * inline style verbatim.
 */
function expandStaticStylePropToStylex(
  reactKey: string,
  value: string | number | boolean,
): Array<{ key: string; value: string | number | boolean }> | null {
  if (isNonPromotableStylexKey(reactKey)) {
    return null;
  }
  if (typeof value === "boolean") {
    return [{ key: reactKey, value }];
  }
  const cssProp = camelToKebabCase(reactKey);
  const rawValue = typeof value === "number" ? String(value) : value;
  // `cssDeclarationToStylexDeclarations` handles `background` by classifying
  // the value as image-like vs color, but doesn't validate that the value is a
  // single component. A multi-token shorthand like `red no-repeat center/cover`
  // would be silently mapped to `backgroundColor: "red no-repeat ..."`, which
  // is invalid CSS. Bail so the inline style is preserved verbatim.
  if (reactKey === "background" && !isSingleBackgroundComponent(rawValue)) {
    return null;
  }
  const expanded = cssDeclarationToStylexDeclarations({
    property: cssProp,
    value: { kind: "static", value: rawValue },
    valueRaw: rawValue,
    important: false,
  });
  const result: Array<{ key: string; value: string | number | boolean }> = [];
  for (const entry of expanded) {
    if (FORBIDDEN_SHORTHAND_PROPS.has(entry.prop)) {
      // Helper couldn't fully decompose the shorthand — bail so we don't emit
      // invalid StyleX (e.g. `border: "1px"` with no style/color tokens).
      return null;
    }
    if (isNonPromotableStylexKey(entry.prop)) {
      return null;
    }
    if (entry.value.kind !== "static") {
      return null;
    }
    result.push({ key: entry.prop, value: coerceExpandedValue(entry.prop, entry.value.value) });
  }
  return result.length > 0 ? result : null;
}

/**
 * Re-numifies a static expanded value when it is purely numeric. The expansion
 * pipeline emits everything as strings; converting bare numbers back to JS
 * numbers keeps emitted StyleX entries consistent with handwritten code (e.g.
 * `paddingInline: 0` instead of `paddingInline: "0"`).
 */
function coerceExpandedValue(prop: string, raw: string): string | number {
  if (raw === "") {
    return raw;
  }
  if (isStylexStringOnlyCssProp(prop)) {
    return raw;
  }
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    return raw;
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : raw;
}

/**
 * Returns true if a StyledDecl ultimately renders as an intrinsic element,
 * either directly (`styled.div`) or through a chain of styled extensions
 * (`styled(OtherStyledComponent)` where the root is intrinsic).
 */
function resolvesToIntrinsic(decl: StyledDecl, declByLocal: Map<string, StyledDecl>): boolean {
  let current: StyledDecl | undefined = decl;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.localName)) {
      return false; // circular reference guard
    }
    visited.add(current.localName);
    if (current.base.kind === "intrinsic") {
      return true;
    }
    current = declByLocal.get(current.base.ident);
  }
  return false;
}

/** CSS properties whose values are typically numeric (no unit string needed). */
const NUMERIC_CSS_PROPS = new Set([
  "zIndex",
  "opacity",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
  "fontWeight",
  "lineHeight",
  "tabSize",
  "orphans",
  "widows",
  "columnCount",
]);

/**
 * CSS properties that accept numeric values in standard CSS / React inline styles
 * but are typed as `string` in StyleX. Numeric values must be coerced to strings.
 */
type PromotedParamType = "number" | "string" | "numberOrString";

const LENGTH_LIKE_CSS_PROP_RE =
  /^(top|right|bottom|left|width|height|minWidth|maxWidth|minHeight|maxHeight|margin|padding|gap|inset|translate|fontSize|letterSpacing|lineHeight|borderWidth|borderRadius|outline)/;

type PromotableStyleProperty = {
  key: string;
  staticValue: string | number | boolean | null;
  dynamicExpr: unknown;
  comments: PropCommentMetadata | null;
};

type PromotedDynamicParam = {
  cssProp: string;
  expr: unknown;
  comments: PropCommentMetadata | null;
};

type CommentableStylePropertyNode = {
  comments?: unknown;
  leadingComments?: unknown;
  trailingComments?: unknown;
};

function coerceToStringForStyleX(cssProp: string, value: unknown): unknown {
  if (isStylexStringOnlyCssProp(cssProp) && typeof value === "number") {
    return String(value);
  }
  return value;
}

/**
 * Infers a TS type keyword for a dynamic expression based on the CSS property it's assigned to.
 * Numeric-only properties get `number`; ambiguous length-like values get `number | string`.
 * StyleX string-only properties always get `string` even when the value is numeric.
 */
function inferTypeForCssProp(cssProp: string, expr: unknown): PromotedParamType {
  if (isStylexStringOnlyCssProp(cssProp)) {
    return "string";
  }
  const conditionalType = inferTypeFromConditionalBranches(expr);
  if (conditionalType) {
    if (conditionalType === "number" && LENGTH_LIKE_CSS_PROP_RE.test(cssProp)) {
      return "numberOrString";
    }
    return conditionalType;
  }
  const staticVal = literalToStaticValue(expr);
  if (typeof staticVal === "number") {
    return "number";
  }
  if (typeof staticVal === "string") {
    return "string";
  }
  if (NUMERIC_CSS_PROPS.has(cssProp)) {
    return "number";
  }
  if (LENGTH_LIKE_CSS_PROP_RE.test(cssProp)) {
    return "numberOrString";
  }
  return "string";
}

function inferTypeFromConditionalBranches(expr: unknown): PromotedParamType | null {
  if (!expr || typeof expr !== "object") {
    return null;
  }
  const node = expr as { type?: string; consequent?: unknown; alternate?: unknown };
  if (node.type !== "ConditionalExpression") {
    return null;
  }
  const consequent = inferTypeFromExpressionValue(node.consequent);
  const alternate = inferTypeFromExpressionValue(node.alternate);
  if (!consequent || !alternate) {
    return null;
  }
  if (consequent === alternate) {
    return consequent;
  }
  return "numberOrString";
}

function inferTypeFromExpressionValue(expr: unknown): PromotedParamType | null {
  const nested = inferTypeFromConditionalBranches(expr);
  if (nested) {
    return nested;
  }
  if (expr && typeof expr === "object" && (expr as { type?: string }).type === "TemplateLiteral") {
    return "string";
  }
  const value = literalToStaticValue(expr);
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  return null;
}

function extractInlineStylePropComments(
  prop: CommentableStylePropertyNode,
): PropCommentMetadata | null {
  const comments = collectUniqueComments([
    prop.comments,
    prop.leadingComments,
    prop.trailingComments,
  ]);
  const leadingLines: string[] = [];
  const leadingBlocks: string[] = [];
  const trailingLines: string[] = [];

  for (const comment of comments) {
    const value = getCommentValue(comment);
    if (!value) {
      continue;
    }
    if (isTrailingLineComment(comment)) {
      trailingLines.push(value);
      continue;
    }
    if (!isLeadingComment(comment)) {
      continue;
    }
    if (isLineComment(comment)) {
      leadingLines.push(value);
    } else if (isBlockComment(comment)) {
      leadingBlocks.push(value);
    }
  }

  const metadata: PropCommentMetadata = {};
  if (leadingBlocks.length > 0) {
    metadata.leading = leadingBlocks.join("\n");
  }
  if (leadingLines.length > 0) {
    metadata.leadingLine = leadingLines.join("\n");
  }
  if (trailingLines.length > 0) {
    metadata.trailingLine = trailingLines.join("\n");
  }
  return hasPropCommentMetadata(metadata) ? metadata : null;
}

function addStylePropComments(
  target: Record<string, unknown>,
  prop: string,
  comments: PropCommentMetadata | null,
): void {
  if (!comments) {
    return;
  }
  addPropComments(target, prop, comments);
}

function mergeStoredPropComments(target: Record<string, unknown>, commentsMap: unknown): void {
  if (!commentsMap || typeof commentsMap !== "object" || Array.isArray(commentsMap)) {
    return;
  }
  for (const [prop, comments] of Object.entries(commentsMap as Record<string, unknown>)) {
    if (!comments || typeof comments !== "object" || Array.isArray(comments)) {
      continue;
    }
    addPropComments(target, prop, comments as PropCommentMetadata);
  }
}

function attachStylePropComments(prop: unknown, comments: PropCommentMetadata | null): void {
  const astComments = propCommentMetadataToAstComments(comments);
  if (astComments.length > 0) {
    (prop as { comments?: unknown[] }).comments = astComments;
  }
}

function getStoredPropComments(
  target: Record<string, unknown>,
  prop: string,
): PropCommentMetadata | null {
  const propComments = target.__propComments;
  if (!propComments || typeof propComments !== "object" || Array.isArray(propComments)) {
    return null;
  }
  const entry = (propComments as Record<string, unknown>)[prop];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  return entry as PropCommentMetadata;
}

function isPromotedStyleMetadataKey(key: string): boolean {
  return key === "__propComments" || key === SOURCE_CSS_PROPERTIES_KEY;
}

function hasPropCommentMetadata(metadata: PropCommentMetadata): boolean {
  return Boolean(metadata.leading || metadata.leadingLine || metadata.trailingLine);
}

function collectUniqueComments(commentGroups: unknown[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const group of commentGroups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const comment of group) {
      if (!comment || typeof comment !== "object") {
        continue;
      }
      const record = comment as Record<string, unknown>;
      const key = `${String(record.type)}\0${String(record.value)}\0${String(record.leading)}\0${String(record.trailing)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(record);
    }
  }
  return result;
}

function getCommentValue(comment: Record<string, unknown>): string | null {
  return typeof comment.value === "string" && comment.value.trim() ? comment.value.trim() : null;
}

function isLeadingComment(comment: Record<string, unknown>): boolean {
  return comment.trailing !== true && comment.leading !== false;
}

function isTrailingLineComment(comment: Record<string, unknown>): boolean {
  return comment.trailing === true && isLineComment(comment);
}

function isLineComment(comment: Record<string, unknown>): boolean {
  return comment.type === "CommentLine" || comment.type === "Line";
}

function isBlockComment(comment: Record<string, unknown>): boolean {
  return comment.type === "CommentBlock" || comment.type === "Block";
}

/**
 * Generates a unique style key for a promoted static style entry.
 * Tries to derive a descriptive suffix from JSX children text content,
 * falling back to `Inline`, `Inline2`, etc.
 */
function generatePromotedStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children?: unknown[],
): string {
  return generateUniqueStyleKey(baseKey, usedKeys, children, "Inline");
}

/**
 * Generates a unique style key for a promoted dynamic style function.
 * Tries to derive a descriptive suffix from JSX children text content,
 * falling back to `Dynamic`, `Dynamic2`, etc.
 */
function generatePromotedDynamicStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children?: unknown[],
): string {
  return generateUniqueStyleKey(baseKey, usedKeys, children, "Dynamic");
}

/**
 * Generates a unique style key with an optional text-derived suffix.
 * Extracts text from JSX children (direct text or text inside a child element)
 * and converts it to a camelCase suffix. Falls back to the provided fallback suffix.
 */
function generateUniqueStyleKey(
  baseKey: string,
  usedKeys: Set<string>,
  children: unknown[] | undefined,
  fallbackSuffix: string,
): string {
  const textSuffix = extractTextSuffixFromChildren(children);
  // Skip text suffix if it duplicates the base key (e.g., base "tick" + text "Tick" → "tickTick")
  if (textSuffix && textSuffix.toLowerCase() !== baseKey.toLowerCase()) {
    const candidate = `${baseKey}${textSuffix}`;
    if (!usedKeys.has(candidate)) {
      return candidate;
    }
  }
  // Fall back to numbered suffix
  let candidate = `${baseKey}${fallbackSuffix}`;
  if (!usedKeys.has(candidate)) {
    return candidate;
  }
  let i = 2;
  while (usedKeys.has(`${baseKey}${fallbackSuffix}${i}`)) {
    i++;
  }
  return `${baseKey}${fallbackSuffix}${i}`;
}

/**
 * Extracts a short camelCase suffix from JSX children text content.
 * Looks for direct JSXText or text inside the first child element (e.g., `<span>Label A</span>`).
 * Returns null if no usable text is found.
 */
function extractTextSuffixFromChildren(children: unknown[] | undefined): string | null {
  if (!children?.length) {
    return null;
  }

  let text: string | null = null;

  for (const child of children) {
    const c = child as { type?: string; value?: string; children?: unknown[] };
    // Direct JSXText (e.g., `<Box>Visible</Box>`)
    if (c.type === "JSXText" && c.value) {
      const trimmed = c.value.trim();
      if (trimmed) {
        text = trimmed;
        break;
      }
    }
    // JSXExpressionContainer with a string literal (e.g., `<Box>{"text"}</Box>`)
    if (c.type === "JSXExpressionContainer") {
      const expr = (c as { expression?: { type?: string; value?: unknown } }).expression;
      if (expr?.type === "StringLiteral" && typeof expr.value === "string" && expr.value.trim()) {
        text = expr.value.trim();
        break;
      }
    }
    // Text inside a child element (e.g., `<Box><span>Label A</span></Box>`)
    if (c.type === "JSXElement" && c.children?.length) {
      const nested = extractTextSuffixFromChildren(c.children);
      if (nested) {
        return nested;
      }
    }
  }

  if (!text) {
    return null;
  }

  // Convert to camelCase suffix: "Label A" → "LabelA", "hello world" → "HelloWorld"
  // Keep only alphanumeric chars, capitalize each word
  const words = text.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  // Limit to first 3 words and 20 chars to keep keys readable
  const truncated = words.slice(0, 3);
  // Drop trailing connector words (e.g. "Margin quad and explicit" → "MarginQuad")
  // so suffixes don't dangle on filler words.
  while (
    truncated.length > 0 &&
    SUFFIX_STOP_WORDS.has(truncated[truncated.length - 1]!.toLowerCase())
  ) {
    truncated.pop();
  }
  if (truncated.length === 0) {
    return null;
  }
  const suffix = truncated.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  if (suffix.length > 20) {
    return null;
  }
  return suffix;
}

/** Connector words dropped from the trailing position of text-derived style key suffixes. */
const SUFFIX_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/**
 * Returns true if any property key in `incoming` already exists in `base`.
 * Used to prevent merge-into-base from overwriting existing style properties.
 */
function hasPropertyOverlap(incoming: Record<string, unknown>, base: unknown): boolean {
  if (!base || typeof base !== "object" || isAstNode(base)) {
    return false;
  }
  const baseObj = base as Record<string, unknown>;
  for (const key of Object.keys(incoming)) {
    if (isPromotedStyleMetadataKey(key)) {
      continue;
    }
    if (key in baseObj) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if any value in the base resolved style object contains `!important`.
 * When the base uses `!important`, caller style props must stay inline to
 * preserve the semantics where `!important` CSS beats inline `style` attributes.
 */
function baseStyleHasImportant(base: unknown): boolean {
  if (!base || typeof base !== "object" || isAstNode(base)) {
    return false;
  }
  return Object.values(base as Record<string, unknown>).some(
    (v) => typeof v === "string" && v.includes("!important"),
  );
}

/** JSX-side tag for shared-ternary promotion: applies `cond && styles.variantKey` at the call site. */
type PromotedConditionalVariantTag = {
  styleKey: string;
  conditionExpr: unknown;
};

/**
 * Detects when every dynamic property in a promoted style object shares the same
 * conditional `cond ? a : b` test with literal branches, and folds the alternate
 * values into the base style + emits the consequent values as a boolean-gated
 * variant style key. Returns `null` when the pattern doesn't apply.
 *
 * Caller must already have verified that:
 * - The component is single-use, non-exported, and not extended by another component.
 * - The base style object has only primitive/AST-node values (no nested rule objects).
 */
function tryExtractSharedTernaryPromotion(args: {
  dynamicParams: Array<{ cssProp: string; expr: unknown }>;
  inlineStaticObj: Record<string, unknown>;
  baseStyleKey: string;
  existingBaseStyles: Record<string, unknown>;
  /** Keys generated by other promotion sites within this `analyzePromotableStyleProps` pass. */
  usedKeyNames: Set<string>;
  /** Keys already in use globally (other styled decls, template variants, base-resolved variants). */
  reservedKeys: Set<string>;
}): {
  variantKey: string;
  consequentStyles: Record<string, unknown>;
  alternateStyles: Record<string, unknown>;
  conditionExpr: unknown;
} | null {
  const {
    dynamicParams,
    inlineStaticObj,
    baseStyleKey,
    existingBaseStyles,
    usedKeyNames,
    reservedKeys,
  } = args;

  if (dynamicParams.length < 2) {
    return null;
  }

  let conditionExpr: unknown = null;
  const consequentEntries: Array<{ key: string; value: string | number | boolean }> = [];
  const alternateEntries: Array<{ key: string; value: string | number | boolean }> = [];
  for (const dp of dynamicParams) {
    const expr = dp.expr;
    if (!isConditionalExpressionNode(expr)) {
      return null;
    }
    const consequentVal = literalToStaticValue(expr.consequent);
    const alternateVal = literalToStaticValue(expr.alternate);
    if (consequentVal === null || alternateVal === null) {
      return null;
    }
    if (conditionExpr === null) {
      conditionExpr = expr.test;
    } else if (!astNodesEqual(conditionExpr, expr.test)) {
      return null;
    }
    consequentEntries.push({
      key: dp.cssProp,
      value: coerceToStringForStyleX(dp.cssProp, consequentVal) as string | number | boolean,
    });
    alternateEntries.push({
      key: dp.cssProp,
      value: coerceToStringForStyleX(dp.cssProp, alternateVal) as string | number | boolean,
    });
  }

  if (!conditionExpr) {
    return null;
  }

  // Only collapse N per-property evaluations into one shared evaluation when
  // the test is pure / idempotent. Otherwise hoisting changes runtime behavior:
  // `flipCoin() ? a : b` evaluated once vs N times can pick different branches.
  if (!isPureIdempotentExpression(conditionExpr)) {
    return null;
  }

  // The variant key must be derivable from the condition; bail when we can't
  // produce a stable readable suffix (matches existing variant-naming conventions).
  const conditionName = extractConditionName(conditionExpr as ExpressionKind);
  if (!conditionName) {
    return null;
  }

  // Reject overlap between the alternate-branch values folded into the base and
  // any pre-existing base or inline-static property — overwriting would silently
  // change semantics.
  for (const e of alternateEntries) {
    if (
      Object.prototype.hasOwnProperty.call(existingBaseStyles, e.key) ||
      Object.prototype.hasOwnProperty.call(inlineStaticObj, e.key)
    ) {
      return null;
    }
  }

  const alternateStyles: Record<string, unknown> = { ...inlineStaticObj };
  for (const e of alternateEntries) {
    alternateStyles[e.key] = e.value;
  }
  const consequentStyles: Record<string, unknown> = {};
  for (const e of consequentEntries) {
    consequentStyles[e.key] = e.value;
  }

  const variantKey = ensureUniqueKey(`${baseStyleKey}${conditionName}`, usedKeyNames, reservedKeys);

  return {
    variantKey,
    consequentStyles,
    alternateStyles,
    conditionExpr,
  };
}
