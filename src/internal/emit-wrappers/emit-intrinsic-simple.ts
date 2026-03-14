/**
 * Emits simple intrinsic wrappers (withConfig and basic exported cases).
 *
 * These are the low-complexity paths that still need wrapper boundaries
 * but do not require specialized or polymorphic handling.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { getBridgeClassVar } from "../utilities/bridge-classname.js";
import {
  collectInlineStylePropNames,
  type ExpressionKind,
  type InlineStyleProp,
  type WrapperPropDefaults,
} from "./types.js";
import { SX_PROP_TYPE_TEXT, type JsxAttr, type StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import {
  buildStaticVariantPropTypes,
  buildVariantDimPropTypeMap,
  collectBooleanPropNames,
  sortVariantEntriesBySpecificity,
  VOID_TAGS,
} from "./type-helpers.js";
import { withLeadingCommentsOnFirstFunction } from "./comments.js";
import { collectCompoundVariantKeys, type EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { collectIdentifiers } from "../utilities/jscodeshift-utils.js";
import {
  areEquivalentWhen,
  findComplementaryVariantEntry,
  getPositiveWhen,
  parseVariantWhenToAst,
} from "./variant-condition.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";
import {
  appendAllPseudoStyleArgs,
  appendThemeBooleanStyleArgs,
  buildUseThemeDeclaration,
  mergeOrderedEntries,
  styleRef,
  type OrderedStyleEntry,
} from "./style-expr-builders.js";

export function emitSimpleWithConfigWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, wrapperNames, stylesIdentifier, emitted } = ctx;
  const {
    shouldAllowAsProp,
    emitPropsType,
    hasElementPropsInDefaultAttrs,
    emitMinimalWrapper,
    asDestructureProp,
  } = ctx.helpers;
  // Simple wrappers for `withConfig({ componentId })` cases where we just want to
  // preserve a component boundary without prop filtering.
  const simpleWithConfigWrappers = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    const tagName = d.base.tagName;
    if (!d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Don't duplicate the polymorphic wrapper path.
    if (wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) {
      return false;
    }
    // Avoid duplicating other specialized wrappers.
    if (tagName === "input" || tagName === "a") {
      return false;
    }
    return true;
  });

  for (const d of simpleWithConfigWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const supportsExternalStyles = d.supportsExternalStyles ?? false;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowSxProp = emitter.shouldAllowSxProp(d);
    const allowAsProp = shouldAllowAsProp(d, tagName);
    const useSlimType = !(d.isExported ?? false) && !supportsExternalStyles && !d.usedAsValue;
    // Determine whether the component will forward ref (via explicit forwarding
    // and/or {...rest}) so we can include ref in the narrow type only when it's
    // actually forwarded.
    const willForwardRef =
      (d.supportsRefProp ?? false) ||
      allowClassNameProp ||
      allowStyleProp ||
      (() => {
        const used = emitter.getUsedAttrs(d.localName);
        return (
          used.has("*") ||
          !!d.usedAsValue ||
          (d.isExported ?? false) ||
          used.size > 0 ||
          hasElementPropsInDefaultAttrs(d)
        );
      })();
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const shouldUseIntrinsicProps = (() => {
        // Use intrinsic props when consumers use spread or element props (explicit true),
        // OR when both flags are undefined and supportsExternalStyles is true (legacy fallback).
        // When flags are explicitly false, respect the narrower type.
        if (
          d.consumerUsesSpread === true ||
          d.consumerUsesElementProps === true ||
          (d.consumerUsesSpread === undefined &&
            d.consumerUsesElementProps === undefined &&
            supportsExternalStyles)
        ) {
          return true;
        }
        // When className/style/sx props are allowed, include them in the type even if
        // elementProps/spreadProps are explicitly false (consumer only passes className/style).
        if (allowClassNameProp || allowStyleProp || allowSxProp) {
          return true;
        }
        const used = emitter.getUsedAttrs(d.localName);
        if (used.has("*")) {
          return true;
        }
        // If any attribute is passed, prefer intrinsic props.
        return used.size > 0;
      })();
      const baseTypeText = shouldUseIntrinsicProps
        ? emitter.inferredIntrinsicPropsTypeText({
            d,
            tagName,
            allowClassNameProp,
            allowStyleProp,
            allowSxProp,
            includeRef: willForwardRef,
            forceNarrow: useSlimType,
          })
        : "{}";

      // For non-void tags without explicit type, ensure children are included.
      // inferredIntrinsicPropsTypeText already includes children for non-void tags,
      // so only wrap when using the fallback "{}" type.
      const typeWithChildren =
        !explicit && !VOID_TAGS.has(tagName) && !shouldUseIntrinsicProps
          ? emitter.withChildren(baseTypeText)
          : baseTypeText;
      // When there's an explicit user type, create a wrapper type that combines element props
      // with the user type (don't modify the user type)
      const needsElementProps = hasElementPropsInDefaultAttrs(d);
      const typeText = (() => {
        if (explicit) {
          // Check if we need to include element props (for defaultAttrs like `tabIndex: props.tabIndex ?? 0`)
          if (needsElementProps) {
            const intrinsicBaseType = emitter.inferredIntrinsicPropsTypeText({
              d,
              tagName,
              allowClassNameProp,
              allowStyleProp,
              allowSxProp,
              includeRef: willForwardRef,
            });
            ctx.markNeedsReactTypeImport();
            return emitter.joinIntersection(explicit, intrinsicBaseType);
          }
          return explicit;
        }
        return typeWithChildren;
      })();
      emitPropsType({
        localName: d.localName,
        tagName,
        typeText,
        allowAsProp,
        allowClassNameProp,
        allowStyleProp,
        allowSxProp,
      });
    }
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey ? [styleRef(j, stylesIdentifier, d.extendsStyleKey)] : []),
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
    ];

    // Handle theme boolean conditionals for withConfig wrappers
    const needsUseThemeWithConfig = appendThemeBooleanStyleArgs(
      d.needsUseThemeHook,
      styleArgs,
      j,
      stylesIdentifier,
      () => ctx.markNeedsUseThemeImport(),
    );

    const pseudoGuardProps = appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier);

    const propsParamId = j.identifier("props");
    if (allowAsProp && emitTypes) {
      emitter.annotatePropsParam(
        propsParamId,
        d.localName,
        `${emitter.propsTypeNameFor(d.localName)}<C>`,
      );
    } else {
      emitter.annotatePropsParam(propsParamId, d.localName);
    }
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const refId = j.identifier("ref");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // For local-only wrappers with no external `className`/`style` usage, keep the wrapper minimal.
    // Skip minimal path if theme hooks are needed (requires useTheme() call in wrapper body)
    if (!allowClassNameProp && !allowStyleProp && !needsUseThemeWithConfig) {
      const usedAttrs = emitter.getUsedAttrs(d.localName);
      // Include rest spread when:
      // - Component is used with spread (usedAttrs.has("*"))
      // - Component is used as a value
      // - Component is exported (external callers may pass any element props)
      // - Component has local usage that passes attrs
      // - defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0)
      //   which means user should be able to pass/override these props
      const includeRest =
        usedAttrs.has("*") ||
        !!d.usedAsValue ||
        (d.isExported ?? false) ||
        usedAttrs.size > 0 ||
        hasElementPropsInDefaultAttrs(d);
      const variantProps = new Set<string>();
      if (d.variantStyleKeys) {
        for (const [when] of Object.entries(d.variantStyleKeys)) {
          const { props } = emitter.collectConditionProps({ when });
          for (const p of props) {
            if (p) {
              variantProps.add(p);
            }
          }
        }
      }
      // Add variant dimension prop names
      for (const dim of d.variantDimensions ?? []) {
        variantProps.add(dim.propName);
      }
      // Add compound variant prop names
      for (const cv of d.compoundVariants ?? []) {
        variantProps.add(cv.outerProp);
        variantProps.add(cv.innerProp);
      }
      const extraProps = new Set<string>();
      if (d.extraStylexPropsArgs) {
        for (const extra of d.extraStylexPropsArgs) {
          if (!extra.when) {
            continue;
          }
          const { props } = emitter.collectConditionProps({ when: extra.when });
          for (const p of props) {
            if (p) {
              extraProps.add(p);
            }
          }
        }
      }
      const inlineProps = new Set(collectInlineStylePropNames(d.inlineStyleProps ?? []));
      const styleFnProps = new Set(
        (d.styleFnFromProps ?? [])
          .map((p: any) => p.jsxProp)
          .filter((name: string) => name && name !== "__props"),
      );
      const destructureProps = [
        ...new Set<string>([
          ...variantProps,
          ...extraProps,
          ...inlineProps,
          ...styleFnProps,
          ...pseudoGuardProps,
          ...(d.attrsInfo?.conditionalAttrs ?? []).map((c: any) => c.jsxProp).filter(Boolean),
          ...(d.attrsInfo?.invertedBoolAttrs ?? []).map((inv: any) => inv.jsxProp).filter(Boolean),
        ]),
      ];
      // When a defaultAttr prop is also used in a style conditional,
      // add a destructuring default so the condition sees the resolved value.
      const minimalPropDefaults: WrapperPropDefaults = new Map();
      for (const attr of d.attrsInfo?.defaultAttrs ?? []) {
        if (
          destructureProps.includes(attr.jsxProp) &&
          (typeof attr.value === "string" || typeof attr.value === "number")
        ) {
          minimalPropDefaults.set(attr.jsxProp, attr.value);
        }
      }
      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          emitMinimalWrapper({
            localName: d.localName,
            tagName,
            propsTypeName: emitter.propsTypeNameFor(d.localName),
            styleArgs,
            destructureProps,
            propDefaults: minimalPropDefaults.size > 0 ? minimalPropDefaults : undefined,
            allowAsProp,
            allowClassNameProp: false,
            allowStyleProp: false,
            includeRefProp: (d.supportsRefProp ?? false) || (!includeRest && willForwardRef),
            includeRest,
            defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
            conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
            invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
            staticAttrs: d.attrsInfo?.staticAttrs ?? {},
            inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
            attrsAsTag: d.attrsInfo?.attrsAsTag,
            bridgeClassVar: getBridgeClassVar(d),
          }),
          d,
        ),
      );
      continue;
    }

    const sxId = j.identifier("sx");
    if (allowSxProp) {
      styleArgs.push(sxId);
    }

    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        emitter.patternProp("className", classNameId),
        ...(isVoidTag ? [] : [emitter.patternProp("children", childrenId)]),
        emitter.patternProp("style", styleId),
        ...((d.supportsRefProp ?? false) ? [emitter.patternProp("ref", refId)] : []),
        ...(allowSxProp ? [emitter.patternProp("sx", sxId)] : []),
      ],
      destructureProps: [...pseudoGuardProps],
      includeRest: true,
      restId,
    });
    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    // Use the style merger helper
    const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(
      d.attrsInfo,
      getBridgeClassVar(d),
    );
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      inlineStyleProps: [],
      staticClassNameExpr,
      isIntrinsicElement: !allowAsProp,
    });

    const openingAttrs: JsxAttr[] = [
      ...emitter.buildAttrsFromAttrsInfo({
        attrsInfo,
        propExprFor: (prop) => j.identifier(prop),
      }),
      ...((d.supportsRefProp ?? false)
        ? [j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId))]
        : []),
      j.jsxSpreadAttribute(restId),
    ];
    emitter.appendMergingAttrs(openingAttrs, merging);

    const openingEl = j.jsxOpeningElement(
      j.jsxIdentifier(allowAsProp ? "Component" : tagName),
      openingAttrs,
      false,
    );

    const jsx = isVoidTag
      ? ({
          type: "JSXElement",
          openingElement: { ...openingEl, selfClosing: true },
          closingElement: null,
          children: [],
        } as any)
      : j.jsxElement(
          openingEl,
          j.jsxClosingElement(j.jsxIdentifier(allowAsProp ? "Component" : tagName)),
          [j.jsxExpressionContainer(childrenId)],
        );

    const bodyStmts: StatementKind[] = [declStmt];
    if (needsUseThemeWithConfig) {
      bodyStmts.push(buildUseThemeDeclaration(j, emitter.themeHook.functionName));
    }
    if (merging.sxDecl) {
      bodyStmts.push(merging.sxDecl);
    }
    bodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      ...withLeadingCommentsOnFirstFunction(
        [
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts,
            typeParameters:
              allowAsProp && emitTypes ? buildPolymorphicTypeParams(j, tagName) : undefined,
          }),
        ],
        d,
      ),
    );
  }
}

export function emitSimpleExportedIntrinsicWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, wrapperNames, stylesIdentifier, emitted } = ctx;
  const {
    buildForwardedAsValueExpr,
    canUseSimplePropsType,
    shouldIncludeRestForProps,
    buildCompoundVariantExpressions,
    emitPropsType,
    emitSimplePropsType,
    hasForwardedAsUsage,
    withSimpleAsPropType,
    polymorphicIntrinsicPropsTypeText,
    propsTypeHasExistingPolymorphicAs,
    splitForwardedAsStaticAttrs,
    shouldAllowAsProp,
    withForwardedAsType,
    hasElementPropsInDefaultAttrs,
    emitMinimalWrapper,
  } = ctx.helpers;
  // Simple exported styled components (styled.div without special features)
  // These are exported components that need wrapper generation to maintain exports.
  const simpleExportedIntrinsicWrappers = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip if already handled by other wrapper categories
    if (d.withConfig?.componentId) {
      return false;
    }
    if (d.shouldForwardProp) {
      return false;
    }
    if (d.enumVariant) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Skip specialized wrapper categories (polymorphic intrinsic wrappers)
    // Exception: components with existing `as?: React.ElementType` in their props type
    // are handled here (non-polymorphic) because upgrading them to our generic pattern
    // can cause TypeScript inference issues
    if (
      (wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) &&
      !propsTypeHasExistingPolymorphicAs(d)
    ) {
      return false;
    }
    // Note: input/a tags without attrWrapper (e.g., simple .attrs() cases) are now
    // handled here. The attrWrapper case is already excluded above.
    return true;
  });
  for (const d of simpleExportedIntrinsicWrappers) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowSxProp = emitter.shouldAllowSxProp(d);
    const usedAttrsForType = emitter.getUsedAttrs(d.localName);
    const includesForwardedAs = hasForwardedAsUsage(d);
    const allowAsProp = shouldAllowAsProp(d, tagName);
    // When the user's props type already has `as?: React.ElementType`, we don't
    // upgrade to our generic pattern (to avoid TypeScript inference issues), but
    // we still need to destructure `as` and use it as the JSX tag so that
    // downstream `.attrs({ as: "element" })` wrappers actually work at runtime.
    // Use the AST-based check (not the regex-based propsTypeHasExistingPolymorphicAs)
    // to ensure we only match `as?: React.ElementType`, not narrow string unions.
    const hasExistingAs = d.propsType
      ? typeContainsPolymorphicAs({ root: emitter.root, j, typeNode: d.propsType })
      : false;
    const useAsProp = allowAsProp || hasExistingAs;
    let inlineTypeText: string | undefined;
    // d.isExported is already set from exportedComponents during analyze-before-emit
    const isExportedComponent = d.isExported ?? false;
    const usePolymorphicPattern = allowAsProp && isExportedComponent;
    const willForwardRef =
      (d.supportsRefProp ?? false) ||
      isExportedComponent ||
      hasComplementaryVariantPairs(d) ||
      !!d.variantDimensions?.some((dim) => dim.namespaceBooleanProp);
    // Non-exported components use slim literal types listing only actually-used
    // props instead of the broad React.ComponentProps<"tag">.
    // Disable when defaultAttrs reference element props (e.g. tabIndex: props.tabIndex ?? 0)
    // because those props need to be in the type even if no callsite passes them.
    const useSlimType =
      !isExportedComponent &&
      !(d.supportsExternalStyles ?? false) &&
      !d.usedAsValue &&
      !hasElementPropsInDefaultAttrs(d);
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const explicitPropNames = d.propsType
        ? emitter.getExplicitPropNames(d.propsType)
        : new Set<string>();

      const variantPropsForType = new Set([
        ...Object.keys(d.variantStyleKeys ?? {}).flatMap((when: string) => {
          return when.split("&&").flatMap((part: string) => {
            const cleanPart = part.replace(/^!/, "");
            const colonIdx = cleanPart.indexOf(":");
            return colonIdx >= 0 ? [cleanPart.slice(0, colonIdx)] : [cleanPart];
          });
        }),
        // Add variant dimension prop names
        ...(d.variantDimensions ?? []).map((dim) => dim.propName),
        // Add compound variant prop names
        ...(d.compoundVariants ?? []).flatMap((cv) => [cv.outerProp, cv.innerProp]),
      ]);
      const styleFnPropsForType = new Set(
        (d.styleFnFromProps ?? [])
          .map((p: any) => p.jsxProp)
          .filter((name: string) => name !== "__props"),
      );
      const conditionalPropsForType = new Set(
        (d.attrsInfo?.conditionalAttrs ?? []).map((c: any) => c.jsxProp),
      );
      const invertedPropsForType = new Set(
        (d.attrsInfo?.invertedBoolAttrs ?? []).map((inv: any) => inv.jsxProp),
      );
      const staticAttrNames = new Set(Object.keys(d.attrsInfo?.staticAttrs ?? {}));
      const handledProps = new Set([
        ...variantPropsForType,
        ...styleFnPropsForType,
        ...conditionalPropsForType,
        ...invertedPropsForType,
        ...staticAttrNames,
      ]);

      // All style-driving props are excluded from Pick<ComponentProps> — they
      // appear in customStyleDrivingPropsTypeText instead, because custom props
      // like `active` are not keys of intrinsic element types.
      const skipProps = new Set([...explicitPropNames, ...handledProps]);
      const baseTypeText = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        allowSxProp,
        skipProps,
        includeRef: willForwardRef,
        forceNarrow: useSlimType,
      });
      const supportsExternalStyles = d.supportsExternalStyles ?? false;
      const needsRestForType =
        !!d.usedAsValue ||
        usedAttrsForType.has("*") ||
        // External callers need full HTML props (id, onClick, aria-*, etc.)
        // Use spread/element props when explicitly true, or fall back to supportsExternalStyles
        // only when both flags are undefined.
        d.consumerUsesSpread === true ||
        d.consumerUsesElementProps === true ||
        (d.consumerUsesSpread === undefined &&
          d.consumerUsesElementProps === undefined &&
          supportsExternalStyles) ||
        // When defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0),
        // include element props in type so those props are available
        hasElementPropsInDefaultAttrs(d) ||
        [...usedAttrsForType].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs" ||
            n.startsWith("$")
          ) {
            return false;
          }
          return !handledProps.has(n);
        });

      const extendBaseTypeText = (() => {
        // Prefer ComponentProps for intrinsic wrappers so event handlers/attrs
        // are typed like real JSX usage (and so we can reliably omit className/style).
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

      const customStyleDrivingPropsTypeText = (() => {
        // These are props that influence styles/attrs and are consumed by the wrapper.
        // They are excluded from Pick<ComponentProps> via skipProps because custom
        // props like `active` are not keys of intrinsic element types.
        const keys = new Set<string>();
        const addIfString = (k: unknown) => {
          if (typeof k === "string") {
            keys.add(k);
          }
        };
        for (const k of variantPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of styleFnPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of conditionalPropsForType as Set<unknown>) {
          addIfString(k);
        }
        for (const k of invertedPropsForType as Set<unknown>) {
          addIfString(k);
        }
        // Add static boolean variant prop names (their when-keys in
        // variantStyleKeys use `prop === "value"` format which the
        // variantPropsForType extraction doesn't parse into prop names).
        for (const sbv of d.staticBooleanVariants ?? []) {
          keys.add(sbv.propName);
        }
        // Remove synthetic compound variant when-keys (e.g. "checkedTrue",
        // "checkedFalse") that are variantStyleKeys entries but not actual
        // prop names.  Use syntheticOnly to preserve real prop names like the
        // outerProp of 3-branch compounds (e.g. "disabled").
        const compoundVariantWhenKeys = collectCompoundVariantKeys(d.compoundVariants, {
          syntheticOnly: true,
        });
        for (const k of compoundVariantWhenKeys) {
          keys.delete(k);
        }
        const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);
        const filtered = [...keys].filter(
          (k) =>
            k &&
            isValidIdentifier(k) &&
            k !== "children" &&
            k !== "className" &&
            k !== "style" &&
            k !== "as" &&
            k !== "forwardedAs" &&
            !explicitPropNames.has(k),
        );
        if (filtered.length === 0) {
          return "{}";
        }
        const variantDimByProp = buildVariantDimPropTypeMap(d);
        const staticVariantPropTypes = buildStaticVariantPropTypes(d);

        const lines = filtered.map((k) => {
          const variantType = variantDimByProp.get(k);
          if (variantType) {
            return `  ${k}?: ${variantType};`;
          }
          const staticType = staticVariantPropTypes.get(k);
          if (staticType) {
            return `  ${k}?: ${staticType};`;
          }
          const attrType = k.startsWith("data-") ? "boolean | string" : "any";
          return `  ${k}?: ${attrType};`;
        });
        return `{\n${lines.join("\n")}\n}`;
      })();

      const sxTypeIntersection = allowSxProp ? `{ ${SX_PROP_TYPE_TEXT} }` : undefined;

      const typeText = (() => {
        if (!explicit) {
          if (useSlimType) {
            // Non-exported: slim literal listing only actually-used props,
            // intersected with any custom style-driving props.  Wrap with
            // PropsWithChildren so custom props end up inside the wrapper.
            const combined = emitter.joinIntersection(
              customStyleDrivingPropsTypeText,
              baseTypeText,
              sxTypeIntersection,
            );
            return VOID_TAGS.has(tagName) ? combined : emitter.withChildren(combined);
          }
          // Exported / external: prefer full intrinsic props typing so common
          // props (e.g. onChange) get correct types when forwarding `...rest`.
          if (needsRestForType) {
            return emitter.joinIntersection(
              extendBaseTypeText,
              customStyleDrivingPropsTypeText,
              sxTypeIntersection,
            );
          }
          // Even without rest-forwarding, include custom style-driving props
          // in the type so callers can pass them (e.g. variant/conditional props).
          return customStyleDrivingPropsTypeText !== "{}"
            ? emitter.joinIntersection(baseTypeText, customStyleDrivingPropsTypeText)
            : baseTypeText;
        }
        if (useSlimType) {
          // Non-exported with explicit type: intersect the user type with only
          // the actually-used element props.
          const combined = emitter.joinIntersection(
            explicit,
            customStyleDrivingPropsTypeText,
            baseTypeText,
            sxTypeIntersection,
          );
          return VOID_TAGS.has(tagName) ? combined : emitter.withChildren(combined);
        }
        if (VOID_TAGS.has(tagName)) {
          return emitter.joinIntersection(
            explicit,
            customStyleDrivingPropsTypeText,
            extendBaseTypeText,
            sxTypeIntersection,
          );
        }
        if (needsRestForType) {
          // For non-exported components that only use transient props ($-prefixed)
          // and don't need external styles, use simple PropsWithChildren
          if (
            !supportsExternalStyles &&
            canUseSimplePropsType({
              isExported: d.isExported ?? false,
              usedAttrs: usedAttrsForType,
            })
          ) {
            return emitter.withChildren(explicit);
          }
          return emitter.joinIntersection(
            explicit,
            customStyleDrivingPropsTypeText,
            extendBaseTypeText,
            sxTypeIntersection,
          );
        }
        if (allowClassNameProp || allowStyleProp) {
          const extras: string[] = [];
          if (allowClassNameProp) {
            extras.push("className?: string");
          }
          if (allowStyleProp) {
            extras.push("style?: React.CSSProperties");
          }
          if (allowSxProp) {
            extras.push(SX_PROP_TYPE_TEXT);
          }
          extras.push("children?: React.ReactNode");
          return emitter.joinIntersection(explicit, `{ ${extras.join("; ")} }`);
        }
        // Wrap the explicit type with PropsWithChildren since the wrapper may need children
        return emitter.withChildren(explicit);
      })();
      const typeTextWithForwardedAs = withForwardedAsType(typeText, includesForwardedAs);

      // Emit the public props type.
      // For exported components that support `as`, use the full polymorphic pattern.
      // For non-exported components, use simple `as?: React.ElementType` without generics.
      // Detect if there are no custom user-defined props (just intrinsic element props)
      const hasNoCustomProps = !explicit && customStyleDrivingPropsTypeText === "{}";
      // When the user already has a well-named type (e.g. `styled("div")<Props>` where Props
      // exists in the file), skip creating a new type alias and use the existing type inline.
      const explicitIsExistingTypeRef = !!emitter.getExplicitTypeNameIfExists(d.propsType);
      let typeAliasEmitted: boolean;
      if (explicitIsExistingTypeRef && !usePolymorphicPattern) {
        // User already has a well-named type — skip creating a new type alias
        typeAliasEmitted = false;
        ctx.markNeedsReactTypeImport();
      } else if (usePolymorphicPattern) {
        typeAliasEmitted = emitPropsType({
          localName: d.localName,
          tagName,
          typeText: typeTextWithForwardedAs,
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
          allowSxProp,
          hasNoCustomProps: hasNoCustomProps || explicitIsExistingTypeRef,
          extraKeyofExpr: emitter.keyofExprForType(d.propsType, typeTextWithForwardedAs),
        });
      } else if (!hasNoCustomProps) {
        typeAliasEmitted = emitSimplePropsType(d.localName, typeTextWithForwardedAs, allowAsProp);
      } else {
        typeAliasEmitted = false;
      }

      // When the named type already exists, inject sx prop into it if needed.
      if (!typeAliasEmitted && allowSxProp) {
        const propsTypeName = emitter.propsTypeNameFor(d.localName);
        if (emitter.typeExistsInFile(propsTypeName)) {
          emitter.injectSxPropIntoExistingType(propsTypeName);
        }
      }

      // If we couldn't emit the named `${localName}Props` type (because it already exists in-file
      // or there are no custom props), ensure the wrapper function param is still typed correctly
      // by using an inline type.
      if (!typeAliasEmitted && emitTypes) {
        if (usePolymorphicPattern) {
          // When there are no custom props, use inline type instead of referencing a named type
          // Use polymorphicIntrinsicPropsTypeText to properly omit className/style when not allowed
          if (hasNoCustomProps) {
            const poly = polymorphicIntrinsicPropsTypeText({
              tagName,
              allowClassNameProp,
              allowStyleProp,
              allowSxProp,
              includeForwardedAs: includesForwardedAs,
            });
            inlineTypeText = poly.typeExprText;
          } else if (explicit) {
            // Use the user-defined type in an inline intersection - don't modify the original type
            // Also respect allowClassNameProp/allowStyleProp in the base type
            const poly = polymorphicIntrinsicPropsTypeText({
              tagName,
              allowClassNameProp,
              allowStyleProp,
              allowSxProp,
              includeForwardedAs: includesForwardedAs,
              extra: explicit,
              extraKeyofExpr: emitter.keyofExprForType(d.propsType, explicit),
              extraFirst: explicitIsExistingTypeRef,
            });
            inlineTypeText = poly.typeExprText;
          } else {
            // Fallback: use the polymorphic props type with generic (shouldn't happen often)
            inlineTypeText = `${emitter.propsTypeNameFor(d.localName)}<C>`;
          }
        } else if (explicitIsExistingTypeRef && explicit) {
          if (useSlimType) {
            // Non-exported: use the computed slim type directly
            inlineTypeText = typeTextWithForwardedAs;
          } else {
            // User's existing type first in the intersection for readability
            const inlineBase = emitter.joinIntersection(
              explicit,
              extendBaseTypeText,
              sxTypeIntersection,
            );
            inlineTypeText = withForwardedAsType(
              withSimpleAsPropType(inlineBase, allowAsProp),
              includesForwardedAs,
            );
          }
        } else {
          // Use the computed typeText (which may be an intersection) as the inline type.
          inlineTypeText = withSimpleAsPropType(typeTextWithForwardedAs, allowAsProp);
        }
      }
    }
    const destructureProps: string[] = [];
    // Track default values for props (for destructuring defaults)
    const propDefaults: WrapperPropDefaults = new Map();

    // Build propsArg expressions first (may be needed for interleaving)
    const propsArgExprs = d.extraStylexPropsArgs
      ? emitter.buildExtraStylexPropsExprs({
          entries: d.extraStylexPropsArgs,
          destructureProps,
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

    for (const gp of appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier)) {
      if (!destructureProps.includes(gp)) {
        destructureProps.push(gp);
      }
    }

    const compoundVariantKeys = collectCompoundVariantKeys(d.compoundVariants);
    const booleanProps = collectBooleanPropNames(d);

    // Collect variant and styleFn expressions with source order for interleaving.
    // When source order is available, entries are sorted to preserve CSS cascade order.
    const hasSourceOrder = !!(d.variantSourceOrder && Object.keys(d.variantSourceOrder).length > 0);
    const orderedEntries: OrderedStyleEntry[] = [];

    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      const consumedVariantIndices = new Set<number>();
      for (let vi = 0; vi < sortedEntries.length; vi++) {
        if (consumedVariantIndices.has(vi)) {
          continue;
        }
        const [when, variantKey] = sortedEntries[vi]!;
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }

        // Look for a complementary pair to merge into a ternary expression
        const complementIdx = findComplementaryVariantEntry(
          sortedEntries,
          vi,
          consumedVariantIndices,
        );
        if (complementIdx !== null) {
          consumedVariantIndices.add(complementIdx);
          const complementEntry = sortedEntries[complementIdx];
          const otherWhen = complementEntry?.[0] ?? "";
          const otherKey = complementEntry?.[1] ?? "";
          const positiveWhen = getPositiveWhen(when, otherWhen) ?? when;
          const { cond } = emitter.collectConditionProps({
            when: positiveWhen,
            destructureProps,
            booleanProps,
          });

          const isCurrentPositive = areEquivalentWhen(when, positiveWhen);
          const trueKey = isCurrentPositive ? variantKey : otherKey;
          const falseKey = isCurrentPositive ? otherKey : variantKey;
          const trueExpr = j.memberExpression(
            j.identifier(stylesIdentifier),
            j.identifier(trueKey),
          );
          const falseExpr = j.memberExpression(
            j.identifier(stylesIdentifier),
            j.identifier(falseKey),
          );
          const expr = j.conditionalExpression(cond, trueExpr, falseExpr);
          const order = d.variantSourceOrder?.[when];
          if (hasSourceOrder && order !== undefined) {
            orderedEntries.push({ order, expr });
          } else {
            styleArgs.push(expr);
          }
          continue;
        }

        const { cond, isBoolean } = emitter.collectConditionProps({
          when,
          destructureProps,
          booleanProps,
        });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Wrap in `cond && styles.key` — stylex.props() ignores all falsy values.
        const expr = emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean });
        const order = d.variantSourceOrder?.[when];
        if (hasSourceOrder && order !== undefined) {
          orderedEntries.push({ order, expr });
        } else {
          styleArgs.push(expr);
        }
      }
    }

    // When a defaultAttr (e.g. tabIndex: props.tabIndex ?? 0) is also used in a
    // style conditional (e.g. tabIndex === 0 && styles.xxx), add a destructuring
    // default so the resolved value is available to both the JSX attr and the
    // style condition.  Without this the condition evaluates against the raw
    // (possibly undefined) prop instead of the defaulted value.
    for (const attr of d.attrsInfo?.defaultAttrs ?? []) {
      if (
        destructureProps.includes(attr.jsxProp) &&
        (typeof attr.value === "string" || typeof attr.value === "number")
      ) {
        propDefaults.set(attr.jsxProp, attr.value);
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps,
        propDefaults,
        orderedEntries: hasSourceOrder ? orderedEntries : undefined,
      });
    }

    // Add compound variant expressions (multi-prop nested ternaries)
    if (d.compoundVariants) {
      buildCompoundVariantExpressions(d.compoundVariants, styleArgs, destructureProps);
    }

    for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
      if (!destructureProps.includes(prop)) {
        destructureProps.push(prop);
      }
    }

    // Add style function calls for dynamic prop-based styles
    emitter.buildStyleFnExpressions({
      d,
      styleArgs,
      destructureProps,
      orderedEntries: hasSourceOrder ? orderedEntries : undefined,
    });
    emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

    // Merge ordered entries (variants + styleFns) by source order to preserve CSS cascade
    mergeOrderedEntries(orderedEntries, styleArgs);

    // Add adapter-resolved StyleX styles that should come after variant styles
    // to preserve CSS cascade order (e.g., unconditional border-bottom after conditional border).
    if (afterVariantStyleArgs.length > 0) {
      styleArgs.push(...afterVariantStyleArgs);
    }

    if (d.attrsInfo?.conditionalAttrs?.length) {
      for (const c of d.attrsInfo.conditionalAttrs) {
        if (c?.jsxProp && !destructureProps.includes(c.jsxProp)) {
          destructureProps.push(c.jsxProp);
        }
      }
    }
    if (d.attrsInfo?.invertedBoolAttrs?.length) {
      for (const inv of d.attrsInfo.invertedBoolAttrs) {
        if (inv?.jsxProp && !destructureProps.includes(inv.jsxProp)) {
          destructureProps.push(inv.jsxProp);
        }
      }
    }

    maybeApplySafeTruthyDefaultFromExtraStyleConditionals({
      j,
      d,
      styleArgs,
      propDefaults,
    });

    // Extract transient props (starting with $) from the explicit type.
    // Also include props that were renamed from $-prefixed names (via transientPropRenames),
    // since they still shouldn't be forwarded to the DOM element.
    const explicitTransientProps: string[] = [];
    const renamedTransientValues = d.transientPropRenames
      ? new Set(d.transientPropRenames.values())
      : undefined;
    const explicit = d.propsType;
    if (explicit?.type === "TSTypeLiteral" && explicit.members) {
      for (const member of explicit.members as any[]) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          const name = member.key.name;
          if (name.startsWith("$") || renamedTransientValues?.has(name)) {
            explicitTransientProps.push(name);
          }
        }
      }
    }
    const usedAttrs = emitter.getUsedAttrs(d.localName);
    const { hasAny: hasLocalUsage } = emitter.getJsxCallsites(d.localName);
    const explicitPropsNames = d.propsType
      ? emitter.getExplicitPropNames(d.propsType)
      : new Set<string>();
    const hasExplicitPropsToPassThrough =
      explicitPropsNames.size > 0 &&
      [...explicitPropsNames].some((n) => {
        if (
          n === "children" ||
          n === "className" ||
          n === "style" ||
          n === "as" ||
          n === "forwardedAs" ||
          n.startsWith("$") ||
          renamedTransientValues?.has(n)
        ) {
          return false;
        }
        return !destructureProps.includes(n);
      });
    let shouldIncludeRest = shouldIncludeRestForProps({
      usedAsValue: emitter.isUsedAsValueInFile(d.localName),
      hasLocalUsage,
      usedAttrs,
      destructureProps,
      hasExplicitPropsToPassThrough,
      ignoreTransientAttrs: true,
    });
    // Components with complementary variant pairs (two-branch conditional CSS blocks)
    // are behavioral wrappers that should preserve prop forwarding
    if (hasComplementaryVariantPairs(d)) {
      shouldIncludeRest = true;
    }
    // When defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0),
    // include rest spread so user can pass/override these props
    if (hasElementPropsInDefaultAttrs(d)) {
      shouldIncludeRest = true;
    }
    // Recipe-pattern components with namespace boolean dimensions (e.g.,
    // disabled ? disabledVariants[color] : enabledVariants[color]) are behavioral
    // wrappers that need rest spread to forward HTML props (id, onClick, aria-*, etc.)
    if (d.variantDimensions?.some((dim) => dim.namespaceBooleanProp)) {
      shouldIncludeRest = true;
    }
    // Exported components should always include rest spread so that all element props
    // (id, onClick, aria-*, etc.) are forwarded to the element.
    if (isExportedComponent) {
      shouldIncludeRest = true;
    }
    // Components extended by other styled components (supportsExternalStyles) need rest
    // spread so extending components can pass through HTML attributes (aria-*, data-*, id, etc.)
    if (d.supportsExternalStyles) {
      shouldIncludeRest = true;
    }
    if (shouldIncludeRest) {
      for (const name of explicitTransientProps) {
        if (!destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }

    if (useAsProp || allowClassNameProp || allowStyleProp || needsUseTheme) {
      const isVoidTag = VOID_TAGS.has(tagName);
      // When useAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildren = useAsProp || !isVoidTag;
      const propsParamId = j.identifier("props");
      emitter.annotatePropsParam(propsParamId, d.localName, inlineTypeText);
      const propsId = j.identifier("props");
      const componentId = j.identifier("Component");
      const classNameId = j.identifier("className");
      const childrenId = j.identifier("children");
      const styleId = j.identifier("style");
      const sxId = j.identifier("sx");
      const refId = j.identifier("ref");
      const restId = shouldIncludeRest ? j.identifier("rest") : null;
      const forwardedAsId = j.identifier("forwardedAs");

      if (allowSxProp) {
        styleArgs.push(sxId);
      }

      // Add defaultAttrs props to destructureProps for nullish coalescing patterns
      // (e.g., tabIndex: props.tabIndex ?? 0 needs tabIndex destructured)
      for (const attr of d.attrsInfo?.defaultAttrs ?? []) {
        if (!destructureProps.includes(attr.jsxProp)) {
          destructureProps.push(attr.jsxProp);
        }
      }

      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(useAsProp
            ? [
                j.property.from({
                  kind: "init",
                  key: j.identifier("as"),
                  value: j.assignmentPattern(componentId, j.literal(tagName)),
                  shorthand: false,
                }),
              ]
            : []),
          ...(includesForwardedAs ? [ctx.patternProp("forwardedAs", forwardedAsId)] : []),
          ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
          ...(includeChildren ? [ctx.patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [ctx.patternProp("style", styleId)] : []),
          ...((d.supportsRefProp ?? false) || (!restId && willForwardRef)
            ? [ctx.patternProp("ref", refId)]
            : []),
          ...(allowSxProp ? [ctx.patternProp("sx", sxId)] : []),
        ],
        destructureProps,
        propDefaults,
        includeRest: Boolean(restId),
        restId: restId ?? undefined,
      });
      const usePropsChildrenDirectly = emitter.isChildrenOnlyDestructurePattern(patternProps);
      const declStmt = usePropsChildrenDirectly
        ? null
        : j.variableDeclaration("const", [
            j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
          ]);

      // Use the style merger helper
      const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(
        d.attrsInfo,
        getBridgeClassVar(d),
      );
      const { attrsInfo: attrsInfoWithoutForwardedAsStatic, forwardedAsStaticFallback } =
        splitForwardedAsStaticAttrs({
          attrsInfo,
          includeForwardedAs: includesForwardedAs,
        });
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
        isIntrinsicElement: !useAsProp,
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: attrsInfoWithoutForwardedAsStatic,
          propExprFor: (prop) => j.identifier(prop),
        }),
        ...((d.supportsRefProp ?? false) || (!restId && willForwardRef)
          ? [j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId))]
          : []),
        ...(restId ? [j.jsxSpreadAttribute(restId)] : []),
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
        tagName: useAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren,
        childrenExpr: usePropsChildrenDirectly
          ? j.memberExpression(propsId, j.identifier("children"))
          : childrenId,
      });

      const bodyStmts: StatementKind[] = [];
      if (declStmt) {
        bodyStmts.push(declStmt);
      }
      if (needsUseTheme) {
        bodyStmts.push(buildUseThemeDeclaration(j, emitter.themeHook.functionName));
      }
      if (merging.sxDecl) {
        bodyStmts.push(merging.sxDecl);
      }
      bodyStmts.push(j.returnStatement(jsx as any));

      // Add generic type parameters when as prop support is enabled.
      // This is needed because the props type uses `as?: C` which requires C to be defined.
      const shouldAddTypeParams = allowAsProp && emitTypes;
      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          [
            emitter.buildWrapperFunction({
              localName: d.localName,
              params: [propsParamId],
              bodyStmts,
              typeParameters: shouldAddTypeParams
                ? buildPolymorphicTypeParams(j, tagName)
                : undefined,
            }),
          ],
          d,
        ),
      );
      continue;
    }

    emitted.push(
      ...withLeadingCommentsOnFirstFunction(
        emitMinimalWrapper({
          localName: d.localName,
          tagName,
          propsTypeName: emitter.propsTypeNameFor(d.localName),
          ...(inlineTypeText ? { inlineTypeText } : {}),
          styleArgs,
          destructureProps,
          propDefaults,
          allowAsProp,
          allowClassNameProp: false,
          allowStyleProp: false,
          includeRefProp: (d.supportsRefProp ?? false) || (!shouldIncludeRest && willForwardRef),
          includeRest: shouldIncludeRest,
          defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
          conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
          invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
          staticAttrs: d.attrsInfo?.staticAttrs ?? {},
          inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
          attrsAsTag: d.attrsInfo?.attrsAsTag,
          bridgeClassVar: getBridgeClassVar(d),
        }),
        d,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers for theme boolean conditional handling
// ---------------------------------------------------------------------------

function maybeApplySafeTruthyDefaultFromExtraStyleConditionals(args: {
  j: JSCodeshift;
  d: StyledDecl;
  styleArgs: ExpressionKind[];
  propDefaults: WrapperPropDefaults;
}): void {
  const { j, d, styleArgs, propDefaults } = args;
  if (!d.extraStylexPropsArgs || d.extraStylexPropsArgs.length === 0) {
    return;
  }

  const blockedProps = collectPropsUsedOutsideExtraStyleConditionals(j, d);
  const candidateIndicesByProp = new Map<string, number[]>();

  for (let i = 0; i < styleArgs.length; i++) {
    const expr = styleArgs[i];
    if (!expr || expr.type !== "ConditionalExpression") {
      continue;
    }
    const propName = extractTruthyUndefinedConditionalProp(expr.test as ExpressionKind);
    if (!propName) {
      continue;
    }
    const existing = candidateIndicesByProp.get(propName) ?? [];
    existing.push(i);
    candidateIndicesByProp.set(propName, existing);
  }

  for (const [propName, indices] of candidateIndicesByProp.entries()) {
    if (blockedProps.has(propName)) {
      continue;
    }
    const existingDefault = propDefaults.get(propName);
    if (existingDefault !== undefined && existingDefault !== true) {
      continue;
    }
    if (isPropUsedOutsideCandidateConditionals(styleArgs, propName, new Set(indices))) {
      continue;
    }
    propDefaults.set(propName, true);
    for (const idx of indices) {
      const expr = styleArgs[idx];
      if (!expr || expr.type !== "ConditionalExpression") {
        continue;
      }
      expr.test = j.identifier(propName);
    }
  }
}

/**
 * Checks whether a StyledDecl has at least one complementary variant pair
 * (e.g., `"$inline === true"` and `"!($inline === true)"`).
 */
function hasComplementaryVariantPairs(d: StyledDecl): boolean {
  const keys = Object.keys(d.variantStyleKeys ?? {});
  for (let i = 0; i < keys.length; i++) {
    for (let k = i + 1; k < keys.length; k++) {
      if (getPositiveWhen(keys[i]!, keys[k]!) !== null) {
        return true;
      }
    }
  }
  return false;
}

function collectPropsUsedOutsideExtraStyleConditionals(
  j: JSCodeshift,
  d: StyledDecl,
): ReadonlySet<string> {
  const used = new Set<string>();
  const add = (name: string | null | undefined): void => {
    if (name) {
      used.add(name);
    }
  };

  for (const [when] of Object.entries(d.variantStyleKeys ?? {})) {
    const parsed = parseVariantWhenToAst(j, when);
    for (const prop of parsed.props) {
      add(prop);
    }
  }
  for (const dim of d.variantDimensions ?? []) {
    add(dim.propName);
    add(dim.namespaceBooleanProp);
  }
  for (const cv of d.compoundVariants ?? []) {
    add(cv.outerProp);
    add(cv.innerProp);
  }
  for (const pair of d.styleFnFromProps ?? []) {
    if (pair.jsxProp !== "__props") {
      add(pair.jsxProp);
    }
  }
  for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
    add(prop);
  }
  for (const inlineProp of d.inlineStyleProps ?? []) {
    if (!inlineProp.expr || typeof inlineProp.expr !== "object") {
      continue;
    }
    collectPropsFromPropsMemberAccess(inlineProp.expr as ExpressionKind, used);
  }
  for (const attr of d.attrsInfo?.defaultAttrs ?? []) {
    add(attr.jsxProp);
  }
  for (const attr of d.attrsInfo?.conditionalAttrs ?? []) {
    add(attr.jsxProp);
  }
  for (const attr of d.attrsInfo?.invertedBoolAttrs ?? []) {
    add(attr.jsxProp);
  }

  return used;
}

function isPropUsedOutsideCandidateConditionals(
  styleArgs: ReadonlyArray<ExpressionKind>,
  propName: string,
  candidateIndices: ReadonlySet<number>,
): boolean {
  for (let i = 0; i < styleArgs.length; i++) {
    if (candidateIndices.has(i)) {
      continue;
    }
    const expr = styleArgs[i];
    if (!expr) {
      continue;
    }
    const identifiers = new Set<string>();
    collectIdentifiers(expr, identifiers);
    if (identifiers.has(propName)) {
      return true;
    }
  }
  return false;
}

function extractTruthyUndefinedConditionalProp(test: ExpressionKind): string | null {
  if (test.type !== "LogicalExpression" || test.operator !== "||") {
    return null;
  }

  const leftProp = extractPropEqUndefined(test.left as ExpressionKind);
  if (leftProp && isIdentifierNamed(test.right as ExpressionKind, leftProp)) {
    return leftProp;
  }

  const rightProp = extractPropEqUndefined(test.right as ExpressionKind);
  if (rightProp && isIdentifierNamed(test.left as ExpressionKind, rightProp)) {
    return rightProp;
  }

  return null;
}

function extractPropEqUndefined(expr: ExpressionKind): string | null {
  if (expr.type !== "BinaryExpression" || expr.operator !== "===") {
    return null;
  }

  if (isIdentifierNamed(expr.left as ExpressionKind, "undefined")) {
    return identifierName(expr.right as ExpressionKind);
  }
  if (isIdentifierNamed(expr.right as ExpressionKind, "undefined")) {
    return identifierName(expr.left as ExpressionKind);
  }

  return null;
}

function isIdentifierNamed(expr: ExpressionKind, name: string): boolean {
  return expr.type === "Identifier" && expr.name === name;
}

function identifierName(expr: ExpressionKind): string | null {
  return expr.type === "Identifier" ? expr.name : null;
}

function collectPropsFromPropsMemberAccess(node: ExpressionKind, out: Set<string>): void {
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        visit(child);
      }
      return;
    }

    const typed = value as {
      type?: string;
      object?: unknown;
      property?: unknown;
      computed?: boolean;
    };
    if (
      (typed.type === "MemberExpression" || typed.type === "OptionalMemberExpression") &&
      typed.object &&
      typed.property &&
      typed.computed === false
    ) {
      const object = typed.object as { type?: string; name?: string };
      const property = typed.property as { type?: string; name?: string };
      if (object.type === "Identifier" && object.name === "props") {
        if (property.type === "Identifier" && property.name) {
          out.add(property.name);
        }
      }
    }

    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      visit(record[key]);
    }
  };

  visit(node);
}

/** Appends theme boolean conditional style args (e.g., `theme.isDark ? styles.boxDark : styles.boxLight`) to `styleArgs`. */
