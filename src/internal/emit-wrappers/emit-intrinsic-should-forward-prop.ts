/**
 * Emits intrinsic wrappers for shouldForwardProp configurations.
 *
 * These wrappers filter props before forwarding and generate stylex merge
 * AST for the remaining props.
 */
import type { StyledDecl } from "../transform-types.js";
import { getBridgeClassVar } from "../utilities/bridge-classname.js";
import { buildStyleFnConditionExpr } from "../utilities/jscodeshift-utils.js";
import { type ExpressionKind, type InlineStyleProp, type WrapperPropDefaults } from "./types.js";
import { SX_PROP_TYPE_TEXT, type JsxAttr, type StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import {
  buildStaticVariantPropTypes,
  buildVariantDimPropTypeMap,
  sortVariantEntriesBySpecificity,
  VOID_TAGS,
} from "./type-helpers.js";
import { withLeadingComments } from "./comments.js";
import { collectCompoundVariantKeys, type EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import {
  appendAllPseudoStyleArgs,
  appendThemeBooleanStyleArgs,
  buildUseThemeDeclaration,
} from "./emit-intrinsic-simple.js";
import { mergeOrderedEntries, styleRef, type OrderedStyleEntry } from "./style-expr-builders.js";
import type { JSCodeshift, Identifier } from "jscodeshift";

/**
 * Generates statements to filter props with a given prefix from the rest object.
 * Used for exported components with shouldForwardProp/dropPrefix to ensure
 * unknown transient props (like $unknown) don't leak to the DOM.
 */
function buildPrefixCleanupStatements(
  j: JSCodeshift,
  restId: Identifier,
  dropPrefix: string,
): StatementKind[] {
  const restRecordId = j.identifier("restRecord");
  const restRecordDecl = j.variableDeclaration("const", [
    j.variableDeclarator(
      restRecordId,
      j.tsAsExpression(
        restId,
        j.tsTypeReference(
          j.identifier("Record"),
          j.tsTypeParameterInstantiation([j.tsStringKeyword(), j.tsUnknownKeyword()]),
        ),
      ),
    ),
  ]);
  const forLoop = j.forOfStatement(
    j.variableDeclaration("const", [j.variableDeclarator(j.identifier("k"), null as any)]),
    j.callExpression(j.memberExpression(j.identifier("Object"), j.identifier("keys")), [restId]),
    j.blockStatement([
      j.ifStatement(
        j.callExpression(j.memberExpression(j.identifier("k"), j.identifier("startsWith")), [
          j.literal(dropPrefix),
        ]),
        j.expressionStatement(
          j.unaryExpression("delete", j.memberExpression(restRecordId, j.identifier("k"), true)),
        ),
      ),
    ]),
  );
  return [restRecordDecl, forLoop];
}

export function emitShouldForwardPropWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, stylesIdentifier, emitted } = ctx;
  const {
    buildForwardedAsValueExpr,
    canUseSimplePropsType,
    shouldIncludeRestForProps,
    buildCompoundVariantExpressions,
    emitPropsType,
    hasForwardedAsUsage,
    asDestructureProp,
    shouldAllowAsProp,
    splitForwardedAsStaticAttrs,
    withForwardedAsType,
  } = ctx.helpers;
  // Generic wrappers for `withConfig({ shouldForwardProp })` cases.
  const shouldForwardPropWrapperDecls = wrapperDecls.filter(
    (d: StyledDecl) => d.shouldForwardProp && !d.enumVariant && d.base.kind === "intrinsic",
  );
  for (const d of shouldForwardPropWrapperDecls) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowSxProp = emitter.shouldAllowSxProp(d);
    const includesForwardedAs = hasForwardedAsUsage(d);
    const allowAsProp = shouldAllowAsProp(d, tagName);

    const extraProps = new Set<string>();
    for (const p of d.shouldForwardProp?.dropProps ?? []) {
      if (p) {
        extraProps.add(p);
      }
    }
    for (const when of Object.keys(d.variantStyleKeys ?? {})) {
      const { props } = emitter.collectConditionProps({ when });
      for (const p of props) {
        if (p) {
          extraProps.add(p);
        }
      }
    }
    // Add variant dimension prop names
    for (const dim of d.variantDimensions ?? []) {
      extraProps.add(dim.propName);
    }
    // Add compound variant prop names
    for (const cv of d.compoundVariants ?? []) {
      extraProps.add(cv.outerProp);
      extraProps.add(cv.innerProp);
    }
    for (const p of d.styleFnFromProps ?? []) {
      if (p?.jsxProp && p.jsxProp !== "__props") {
        extraProps.add(p.jsxProp);
      }
    }
    for (const a of d.attrsInfo?.defaultAttrs ?? []) {
      if (a?.jsxProp) {
        extraProps.add(a.jsxProp);
      }
    }
    for (const c of d.attrsInfo?.conditionalAttrs ?? []) {
      if (c?.jsxProp) {
        extraProps.add(c.jsxProp);
      }
    }
    for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
      if (inv?.jsxProp) {
        extraProps.add(inv.jsxProp);
      }
    }
    const dropPrefixFromFilter = d.shouldForwardProp?.dropPrefix;
    const usedAttrs = emitter.getUsedAttrs(d.localName);
    const shouldAllowAnyPrefixProps =
      !!dropPrefixFromFilter &&
      (usedAttrs.has("*") ||
        [...usedAttrs].some((n) => n.startsWith(dropPrefixFromFilter) && !extraProps.has(n)));
    const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
    const knownPrefixProps = dropPrefixFromFilter
      ? [...extraProps].filter(
          (p: string) => p.startsWith(dropPrefixFromFilter) && isValidIdentifier(p),
        )
      : [];
    const knownPrefixPropsSet = new Set(knownPrefixProps);

    const isExportedComponent = d.isExported ?? false;
    const useSlimType =
      !isExportedComponent && !(d.supportsExternalStyles ?? false) && !d.usedAsValue;

    const explicit = emitter.stringifyTsType(d.propsType);
    // Extract prop names from explicit type to avoid duplicating them in inferred type
    const explicitPropNames = d.propsType
      ? emitter.getExplicitPropNames(d.propsType)
      : new Set<string>();
    // SFP consumed/dropped props are custom component props (not standard element
    // attrs), so they must be excluded from Pick<ComponentProps>.
    const skipProps = new Set([...explicitPropNames, ...extraProps]);
    const extrasTypeText = (() => {
      // If input provided an explicit props type, prefer it and avoid emitting `any` overrides
      // for the same keys (e.g. `color?: string` should not become `color?: any`).
      if (explicit && explicit.trim()) {
        // Only allow arbitrary `$...` transient props when we see unknown/spread attrs at call-sites.
        return dropPrefixFromFilter === "$" && shouldAllowAnyPrefixProps
          ? `${explicit} & { [K in \`$\${string}\`]?: any }`
          : explicit;
      }
      const variantDimByProp = buildVariantDimPropTypeMap(d);
      const staticVariantPropTypes = buildStaticVariantPropTypes(d);
      const lines: string[] = [];
      for (const p of extraProps) {
        if (!isValidIdentifier(p)) {
          continue;
        }
        const variantType = variantDimByProp.get(p);
        if (variantType) {
          lines.push(`  ${p}?: ${variantType};`);
          continue;
        }
        const staticType = staticVariantPropTypes.get(p);
        if (staticType) {
          lines.push(`  ${p}?: ${staticType};`);
          continue;
        }
        const attrType = p.startsWith("data-") ? "boolean | string" : "any";
        lines.push(`  ${p}?: ${attrType};`);
      }
      const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
      if (dropPrefixFromFilter === "$") {
        return `${literal} & { [K in \`$\${string}\`]?: any }`;
      }
      return literal;
    })();
    // Build supplemental type for consumed props not in the explicit type.
    // When explicit is set, extrasTypeText is just the user type, but variant
    // dimension / static boolean variant props may be missing from it.
    const consumedPropsTypeText = (() => {
      if (!explicit) {
        return "{}";
      }
      const compoundWhenKeys = collectCompoundVariantKeys(d.compoundVariants, {
        syntheticOnly: true,
      });
      const variantDimByProp = buildVariantDimPropTypeMap(d);
      const staticVariantPropTypes = buildStaticVariantPropTypes(d);
      const lines: string[] = [];
      for (const p of extraProps) {
        if (!isValidIdentifier(p) || explicitPropNames.has(p) || compoundWhenKeys.has(p)) {
          continue;
        }
        const variantType = variantDimByProp.get(p);
        if (variantType) {
          lines.push(`  ${p}?: ${variantType};`);
          continue;
        }
        const staticType = staticVariantPropTypes.get(p);
        if (staticType) {
          lines.push(`  ${p}?: ${staticType};`);
          continue;
        }
        const attrType = p.startsWith("data-") ? "boolean | string" : "any";
        lines.push(`  ${p}?: ${attrType};`);
      }
      return lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
    })();

    // Compute the narrow base once — reused across finalTypeText and extendBaseTypeText.
    const slimBaseTypeText = useSlimType
      ? emitter.inferredIntrinsicPropsTypeText({
          d,
          tagName,
          allowClassNameProp,
          allowStyleProp,
          allowSxProp,
          skipProps,
          includeRef: d.supportsRefProp ?? false,
          forceNarrow: true,
        })
      : undefined;

    const wrapSlimWithChildren = (typeText: string): string =>
      VOID_TAGS.has(tagName) ? typeText : emitter.withChildren(typeText);

    const finalTypeText = (() => {
      if (explicit) {
        if (
          !d.shouldForwardPropFromWithConfig &&
          canUseSimplePropsType({
            isExported: d.isExported ?? false,
            usedAttrs,
            isVoidTag: VOID_TAGS.has(tagName),
          })
        ) {
          return emitter.withChildren(extrasTypeText);
        }
        if (slimBaseTypeText !== undefined) {
          return wrapSlimWithChildren(
            emitter.joinIntersection(extrasTypeText, consumedPropsTypeText, slimBaseTypeText),
          );
        }
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        return emitter.joinIntersection(extrasTypeText, consumedPropsTypeText, baseWithOmit);
      }
      if (slimBaseTypeText !== undefined) {
        return wrapSlimWithChildren(emitter.joinIntersection(extrasTypeText, slimBaseTypeText));
      }
      return emitter.joinIntersection(
        extrasTypeText,
        emitter.inferredIntrinsicPropsTypeText({
          d,
          tagName,
          allowClassNameProp,
          allowStyleProp,
          allowSxProp,
          skipProps,
          includeRef: true,
        }),
      );
    })();
    const finalTypeTextWithForwardedAs = withForwardedAsType(finalTypeText, includesForwardedAs);

    // Detect if there are no custom user-defined props (just intrinsic element props)
    const hasNoCustomProps = !explicit && extraProps.size === 0;
    // When the user already has a well-named type, skip creating a new type alias
    const explicitIsExistingTypeRef = !!emitter.getExplicitTypeNameIfExists(d.propsType);

    // Emit props type (skip when user already has a well-named type)
    let typeAliasEmitted = false;
    if (!explicitIsExistingTypeRef) {
      // For polymorphic (allowAsProp) wrappers, pass just the user's custom props type.
      // polymorphicIntrinsicPropsTypeText already adds React.ComponentPropsWithRef<C>,
      // so including element props in typeText would duplicate them and produce
      // verbose `keyof (userType & React.ComponentProps<"tag">)` instead of `"propName"`.
      const typeTextForEmit = allowAsProp
        ? withForwardedAsType(
            consumedPropsTypeText !== "{}"
              ? emitter.joinIntersection(extrasTypeText, consumedPropsTypeText)
              : extrasTypeText,
            includesForwardedAs,
          )
        : finalTypeTextWithForwardedAs;
      const extraKeyofExpr = allowAsProp
        ? emitter.keyofExprForType(d.propsType, explicit)
        : undefined;
      typeAliasEmitted = emitPropsType({
        localName: d.localName,
        tagName,
        typeText: typeTextForEmit,
        allowAsProp,
        allowClassNameProp,
        allowStyleProp,
        allowSxProp,
        hasNoCustomProps,
        extraKeyofExpr,
      });
    }
    // For NON-POLYMORPHIC components (without `as` support), extend user-defined types
    // to include element props like children, className, style.
    // For POLYMORPHIC components (with `as` support), we don't modify the type -
    // instead we add element props as an inline intersection in the function parameter.
    let sfpInlineTypeText: string | undefined;
    if (!allowAsProp && explicit) {
      const extendBaseTypeText = (() => {
        if (slimBaseTypeText !== undefined) {
          return slimBaseTypeText;
        }
        const base = `React.ComponentProps<"${tagName}">`;
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      })();
      if (explicitIsExistingTypeRef) {
        if (useSlimType) {
          sfpInlineTypeText = finalTypeTextWithForwardedAs;
        } else {
          const sxPart = allowSxProp ? `{ ${SX_PROP_TYPE_TEXT} }` : undefined;
          sfpInlineTypeText = emitter.joinIntersection(explicit, extendBaseTypeText, sxPart);
        }
      } else {
        const propsTypeName = emitter.propsTypeNameFor(d.localName);
        emitter.extendExistingType(propsTypeName, extendBaseTypeText);
        if (allowSxProp) {
          emitter.injectSxPropIntoExistingType(propsTypeName);
        }
      }
    }
    ctx.markNeedsReactTypeImport();

    // Track default values for props (for destructuring defaults)
    const propDefaults: WrapperPropDefaults = new Map();

    // Build propsArg expressions first (may be needed for interleaving)
    const propsArgExprs = d.extraStylexPropsArgs
      ? emitter.buildExtraStylexPropsExprs({
          entries: d.extraStylexPropsArgs,
        })
      : [];

    // Build interleaved before/after-base args using mixinOrder
    const {
      beforeBase: extraStyleArgs,
      afterBase: extraStyleArgsAfterBase,
      afterVariants: afterVariantStyleArgs,
    } = emitter.buildInterleavedExtraStyleArgs(d, propsArgExprs);
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey ? [styleRef(j, stylesIdentifier, d.extendsStyleKey)] : []),
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
    ];

    // Handle theme boolean conditionals - add conditional true/false style args
    const needsUseTheme = appendThemeBooleanStyleArgs(
      d.needsUseThemeHook,
      styleArgs,
      j,
      stylesIdentifier,
      () => ctx.markNeedsUseThemeImport(),
    );

    const pseudoGuardProps = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

    const compoundVariantKeys = collectCompoundVariantKeys(d.compoundVariants);

    // Collect variant and styleFn expressions with source order for interleaving.
    // When source order is available, entries are sorted to preserve CSS cascade order.
    const hasSourceOrder = !!(d.variantSourceOrder && Object.keys(d.variantSourceOrder).length > 0);
    const orderedEntries: OrderedStyleEntry[] = [];

    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      for (const [when, variantKey] of sortedEntries) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond, isBoolean } = emitter.collectConditionProps({ when });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
        // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
        const expr = emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean });
        const order = d.variantSourceOrder?.[when];
        if (hasSourceOrder && order !== undefined) {
          orderedEntries.push({ order, expr });
        } else {
          styleArgs.push(expr);
        }
      }
    }

    const dropProps = d.shouldForwardProp?.dropProps ?? [];

    // Extract props from variantStyleKeys and add to drop list for destructuring
    // This ensures variant props like $wrapLines are destructured from props
    if (d.variantStyleKeys) {
      for (const when of Object.keys(d.variantStyleKeys)) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { props } = emitter.collectConditionProps({ when });
        for (const p of props) {
          if (p && !dropProps.includes(p)) {
            dropProps.push(p);
          }
        }
      }
    }
    const dropPrefix = d.shouldForwardProp?.dropPrefix;

    // Initialize destructureParts early so buildVariantDimensionLookups can populate them
    const destructureParts: string[] = [];
    for (const p of dropProps) {
      destructureParts.push(p);
    }

    // Collect props from extraStylexPropsArgs.when conditions
    // (extraStylexPropsArgs is processed earlier for styleArgs, but destructureParts wasn't available yet)
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { props } = emitter.collectConditionProps({ when: extra.when });
          for (const p of props) {
            if (p && !destructureParts.includes(p)) {
              destructureParts.push(p);
            }
          }
        }
      }
    }

    // Add pseudo-alias guard props to destructuring
    for (const gp of pseudoGuardProps) {
      if (!destructureParts.includes(gp)) {
        destructureParts.push(gp);
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      // Pass destructureParts and propDefaults to track props and their defaults
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps: destructureParts,
        propDefaults,
        orderedEntries: hasSourceOrder ? orderedEntries : undefined,
      });
    }

    // Add compound variant expressions (multi-prop nested ternaries)
    if (d.compoundVariants) {
      buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureParts);
    }

    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const prefix = dropPrefix;
      const isPrefixProp =
        !!prefix &&
        typeof p.jsxProp === "string" &&
        p.jsxProp !== "__props" &&
        p.jsxProp.startsWith(prefix);
      const propExpr = isPrefixProp
        ? knownPrefixPropsSet.has(p.jsxProp)
          ? j.identifier(p.jsxProp)
          : j.memberExpression(j.identifier("props"), j.literal(p.jsxProp), true)
        : p.jsxProp === "__props"
          ? j.identifier("props")
          : j.identifier(p.jsxProp);
      const callArg = p.callArg ?? propExpr;
      const call = j.callExpression(styleRef(j, stylesIdentifier, p.fnKey), [callArg]);
      let expr: ExpressionKind;
      if (p.conditionWhen) {
        const { cond, isBoolean } = emitter.collectConditionProps({
          when: p.conditionWhen,
          destructureProps: destructureParts,
        });
        expr = emitter.makeConditionalStyleExpr({ cond, expr: call, isBoolean });
      } else {
        const isRequired =
          p.jsxProp === "__props" ||
          emitter.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
        expr = buildStyleFnConditionExpr({ j, condition: p.condition, propExpr, call, isRequired });
      }
      if (hasSourceOrder && p.sourceOrder !== undefined) {
        orderedEntries.push({ order: p.sourceOrder, expr });
      } else {
        styleArgs.push(expr);
      }
      // Ensure the prop is destructured from props
      if (
        typeof p.jsxProp === "string" &&
        p.jsxProp !== "__props" &&
        !isPrefixProp &&
        !destructureParts.includes(p.jsxProp)
      ) {
        destructureParts.push(p.jsxProp);
      }
    }

    // Merge ordered entries (variants + styleFns) by source order to preserve CSS cascade
    mergeOrderedEntries(orderedEntries, styleArgs);

    // Add adapter-resolved StyleX styles that should come after variant styles
    // to preserve CSS cascade order (e.g., unconditional border-bottom after conditional border).
    if (afterVariantStyleArgs.length > 0) {
      styleArgs.push(...afterVariantStyleArgs);
    }
    for (const p of knownPrefixProps) {
      if (!destructureParts.includes(p)) {
        destructureParts.push(p);
      }
    }
    for (const a of d.attrsInfo?.defaultAttrs ?? []) {
      if (a?.jsxProp && !destructureParts.includes(a.jsxProp)) {
        destructureParts.push(a.jsxProp);
      }
    }
    for (const c of d.attrsInfo?.conditionalAttrs ?? []) {
      if (c?.jsxProp && !destructureParts.includes(c.jsxProp)) {
        destructureParts.push(c.jsxProp);
      }
    }
    for (const inv of d.attrsInfo?.invertedBoolAttrs ?? []) {
      if (inv?.jsxProp && !destructureParts.includes(inv.jsxProp)) {
        destructureParts.push(inv.jsxProp);
      }
    }

    const propsParamId = j.identifier("props");
    if (allowAsProp && emitTypes) {
      // When a named type alias was emitted, reference it instead of inlining
      if (typeAliasEmitted) {
        const propsTypeText = `${emitter.propsTypeNameFor(d.localName)}<C>`;
        emitter.annotatePropsParam(propsParamId, d.localName, propsTypeText);
      } else {
        const sxPart = allowSxProp ? `${SX_PROP_TYPE_TEXT}; ` : "";
        const asPropLiteral = `{ ${sxPart}as?: C }`;
        const forwardedAsPart = includesForwardedAs ? " & { forwardedAs?: React.ElementType }" : "";
        const keyofExpr = emitter.keyofExprForType(d.propsType, explicit);
        const propsTypeText = hasNoCustomProps
          ? `React.ComponentPropsWithRef<C> & ${asPropLiteral}${forwardedAsPart}`
          : explicit && keyofExpr
            ? `${explicit} & Omit<React.ComponentPropsWithRef<C>, ${keyofExpr}> & ${asPropLiteral}${forwardedAsPart}`
            : `${emitter.propsTypeNameFor(d.localName)}<C>`;
        emitter.annotatePropsParam(propsParamId, d.localName, propsTypeText);
      }
    } else if (sfpInlineTypeText) {
      emitter.annotatePropsParam(propsParamId, d.localName, sfpInlineTypeText);
    } else {
      emitter.annotatePropsParam(propsParamId, d.localName);
    }
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const refId = j.identifier("ref");
    const restId = j.identifier("rest");
    const forwardedAsId = j.identifier("forwardedAs");
    const isVoidTag = tagName === "input";
    const { hasAny: hasLocalUsage } = emitter.getJsxCallsites(d.localName);

    const shouldIncludeRest = shouldIncludeRestForProps({
      usedAsValue: emitter.isUsedAsValueInFile(d.localName),
      hasLocalUsage,
      usedAttrs,
      destructureProps: destructureParts,
      ignoreTransientAttrs: true,
    });

    const shouldOmitRestSpread =
      !isExportedComponent &&
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p: string) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));
    // For user-configured shouldForwardProp (withConfig), always include rest spread.
    // The purpose of shouldForwardProp is to filter specific props from the DOM;
    // all other props (id, onClick, aria-*, data-*, etc.) should be forwarded.
    // Auto-inferred shouldForwardProp (from lower-rules) keeps original heuristics,
    // except for recipe-pattern components with namespace boolean dimensions
    // (e.g., disabled ? disabledVariants[color] : enabledVariants[color]).
    // Components extended by other styled components (supportsExternalStyles) also
    // need rest spread so extending wrappers can pass through HTML attributes.
    const includeRest =
      d.shouldForwardPropFromWithConfig ||
      d.variantDimensions?.some((dim) => dim.namespaceBooleanProp) ||
      isExportedComponent ||
      (d.supportsExternalStyles ?? false) ||
      (!shouldOmitRestSpread && shouldIncludeRest);

    if (!allowClassNameProp && !allowStyleProp) {
      const isVoid = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildrenInner = allowAsProp || !isVoid;
      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp ? [asDestructureProp(tagName)] : []),
          ...(includesForwardedAs ? [ctx.patternProp("forwardedAs", forwardedAsId)] : []),
          ...(includeChildrenInner ? [ctx.patternProp("children", childrenId)] : []),
          ...((d.supportsRefProp ?? false) ? [ctx.patternProp("ref", refId)] : []),
        ],
        destructureProps: destructureParts,
        propDefaults,
        includeRest,
        restId,
      });
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      // Generate cleanup loop for prefix props when:
      // - There's a dropPrefix (like "$" for transient props)
      // - Either: local usage of unknown prefix props, OR exported/extended component
      //   (external callers or extending wrappers may pass unknown prefix props)
      // - Rest spread is included
      const needsCleanupLoop =
        dropPrefix &&
        (isExportedComponent || (d.supportsExternalStyles ?? false) || shouldAllowAnyPrefixProps) &&
        includeRest;
      const cleanupPrefixStmt = needsCleanupLoop
        ? buildPrefixCleanupStatements(j, restId, dropPrefix)
        : null;

      const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(
        d.attrsInfo,
        getBridgeClassVar(d),
      );
      const { attrsInfo: attrsInfoRaw, forwardedAsStaticFallback } = splitForwardedAsStaticAttrs({
        attrsInfo,
        includeForwardedAs: includesForwardedAs,
      });
      const attrsInfoWithoutForwardedAsStatic = filterAttrsForShouldForwardProp(
        attrsInfoRaw,
        d.shouldForwardProp,
      );
      const merging = emitStyleMerging({
        j,
        emitter,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
        staticClassNameExpr,
        isIntrinsicElement: !allowAsProp,
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: attrsInfoWithoutForwardedAsStatic,
          propExprFor: (prop) => j.identifier(prop),
        }),
        ...((d.supportsRefProp ?? false)
          ? [j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId))]
          : []),
        ...(includeRest ? [j.jsxSpreadAttribute(restId)] : []),
        ...(includesForwardedAs
          ? [
              j.jsxAttribute(
                j.jsxIdentifier("as"),
                j.jsxExpressionContainer(
                  buildForwardedAsValueExpr(forwardedAsId, forwardedAsStaticFallback),
                ),
              ),
            ]
          : []),
      ];
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren: includeChildrenInner,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (cleanupPrefixStmt) {
        fnBodyStmts.push(...cleanupPrefixStmt);
      }
      if (needsUseTheme) {
        fnBodyStmts.push(buildUseThemeDeclaration(j, emitter.themeHook.functionName));
      }
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      emitted.push(
        withLeadingComments(
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts: fnBodyStmts,
            typeParameters:
              allowAsProp && emitTypes ? buildPolymorphicTypeParams(j, tagName) : undefined,
          }),
          d,
        ),
      );
      continue;
    }

    // When allowAsProp is true, include children support even for void tags
    // because the user might use `as="textarea"` which requires children
    const includeChildrenOuter = allowAsProp || !isVoidTag;
    const sxId = j.identifier("sx");
    if (allowSxProp) {
      styleArgs.push(sxId);
    }

    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        ...(includesForwardedAs ? [ctx.patternProp("forwardedAs", forwardedAsId)] : []),
        ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
        ...(includeChildrenOuter ? [ctx.patternProp("children", childrenId)] : []),
        ...(allowStyleProp ? [ctx.patternProp("style", styleId)] : []),
        ...((d.supportsRefProp ?? false) ? [ctx.patternProp("ref", refId)] : []),
        ...(allowSxProp ? [ctx.patternProp("sx", sxId)] : []),
      ],
      destructureProps: destructureParts,
      propDefaults,
      includeRest,
      restId,
    });

    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    // Generate cleanup loop for prefix props when:
    // - There's a dropPrefix (like "$" for transient props)
    // - Either: local usage of unknown prefix props, OR exported/extended component
    //   (external callers or extending wrappers may pass unknown prefix props)
    // - Rest spread is included
    const needsCleanupLoopOuter =
      dropPrefix &&
      (isExportedComponent || (d.supportsExternalStyles ?? false) || shouldAllowAnyPrefixProps) &&
      includeRest;
    const cleanupPrefixStmt = needsCleanupLoopOuter
      ? buildPrefixCleanupStatements(j, restId, dropPrefix)
      : null;

    // Extract static className and bridge class for the style merger
    const { staticClassNameExpr } = emitter.splitAttrsInfo(d.attrsInfo, getBridgeClassVar(d));

    // Use the style merger helper
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      staticClassNameExpr,
      isIntrinsicElement: !allowAsProp,
    });

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: JsxAttr[] = [];
    if (d.supportsRefProp ?? false) {
      openingAttrs.push(j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId)));
    }
    if (includeRest) {
      openingAttrs.push(j.jsxSpreadAttribute(restId));
    }
    if (includesForwardedAs) {
      openingAttrs.push(
        j.jsxAttribute(
          j.jsxIdentifier("as"),
          j.jsxExpressionContainer(buildForwardedAsValueExpr(forwardedAsId)),
        ),
      );
    }
    emitter.appendMergingAttrs(openingAttrs, merging);

    const jsx = emitter.buildJsxElement({
      tagName: allowAsProp ? "Component" : tagName,
      attrs: openingAttrs,
      includeChildren: includeChildrenOuter,
      childrenExpr: childrenId,
    });

    const fnBodyStmts: StatementKind[] = [declStmt];
    if (cleanupPrefixStmt) {
      fnBodyStmts.push(...cleanupPrefixStmt);
    }
    if (needsUseTheme) {
      fnBodyStmts.push(buildUseThemeDeclaration(j, emitter.themeHook.functionName));
    }
    if (merging.sxDecl) {
      fnBodyStmts.push(merging.sxDecl);
    }
    fnBodyStmts.push(j.returnStatement(jsx as any));

    // Add type parameters when allowAsProp is true
    emitted.push(
      withLeadingComments(
        emitter.buildWrapperFunction({
          localName: d.localName,
          params: [propsParamId],
          bodyStmts: fnBodyStmts,
          typeParameters:
            allowAsProp && emitTypes ? buildPolymorphicTypeParams(j, tagName) : undefined,
        }),
        d,
      ),
    );
  }
}

/**
 * Filter attrs entries that shouldForwardProp would prevent from reaching the DOM.
 * When `.withConfig({ shouldForwardProp })` and `.attrs(...)` are both present,
 * attrs whose attrName matches a dropped prop should not be emitted as DOM attributes.
 */
function filterAttrsForShouldForwardProp(
  attrsInfo: StyledDecl["attrsInfo"],
  sfp: StyledDecl["shouldForwardProp"],
): StyledDecl["attrsInfo"] {
  if (!attrsInfo || !sfp) {
    return attrsInfo;
  }

  const dropSet = new Set(sfp.dropProps);
  const dropPrefix = sfp.dropPrefix;
  const shouldDrop = (name: string): boolean =>
    dropSet.has(name) || (dropPrefix != null && name.startsWith(dropPrefix));

  const hasDroppedAttrs =
    (attrsInfo.defaultAttrs ?? []).some((a) => shouldDrop(a.attrName)) ||
    attrsInfo.conditionalAttrs.some((a) => shouldDrop(a.attrName)) ||
    (attrsInfo.invertedBoolAttrs ?? []).some((a) => shouldDrop(a.attrName)) ||
    Object.keys(attrsInfo.staticAttrs).some(shouldDrop);
  if (!hasDroppedAttrs) {
    return attrsInfo;
  }

  return {
    ...attrsInfo,
    defaultAttrs: (attrsInfo.defaultAttrs ?? []).filter((a) => !shouldDrop(a.attrName)),
    conditionalAttrs: attrsInfo.conditionalAttrs.filter((a) => !shouldDrop(a.attrName)),
    invertedBoolAttrs: (attrsInfo.invertedBoolAttrs ?? []).filter((a) => !shouldDrop(a.attrName)),
    staticAttrs: Object.fromEntries(
      Object.entries(attrsInfo.staticAttrs).filter(([key]) => !shouldDrop(key)),
    ),
  };
}
