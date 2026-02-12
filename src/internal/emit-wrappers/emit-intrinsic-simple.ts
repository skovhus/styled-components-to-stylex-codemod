/**
 * Emits simple intrinsic wrappers (withConfig and basic exported cases).
 *
 * These are the low-complexity paths that still need wrapper boundaries
 * but do not require specialized or polymorphic handling.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { collectInlineStylePropNames, type ExpressionKind, type InlineStyleProp } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { withLeadingCommentsOnFirstFunction } from "./comments.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";

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
    const allowAsProp = shouldAllowAsProp(d, tagName);
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const shouldUseIntrinsicProps = (() => {
        if (supportsExternalStyles) {
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
          })
        : "{}";

      // For non-void tags without explicit type, wrap in PropsWithChildren
      const typeWithChildren =
        !explicit && !VOID_TAGS.has(tagName) ? emitter.withChildren(baseTypeText) : baseTypeText;
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
            });
            ctx.markNeedsReactTypeImport();
            return emitter.joinIntersection(intrinsicBaseType, explicit);
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
      });
    }
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ...extraStyleArgsAfterBase,
    ];

    // Handle theme boolean conditionals for withConfig wrappers
    const needsUseThemeWithConfig = appendThemeBooleanStyleArgs(
      d.needsUseThemeHook,
      styleArgs,
      j,
      stylesIdentifier,
      ctx,
    );

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
          ...(d.attrsInfo?.conditionalAttrs ?? []).map((c: any) => c.jsxProp).filter(Boolean),
          ...(d.attrsInfo?.invertedBoolAttrs ?? []).map((inv: any) => inv.jsxProp).filter(Boolean),
        ]),
      ];
      // When a defaultAttr prop is also used in a style conditional,
      // add a destructuring default so the condition sees the resolved value.
      const minimalPropDefaults = new Map<string, string>();
      for (const attr of d.attrsInfo?.defaultAttrs ?? []) {
        if (
          destructureProps.includes(attr.jsxProp) &&
          (typeof attr.value === "string" || typeof attr.value === "number")
        ) {
          minimalPropDefaults.set(attr.jsxProp, `${attr.value}`);
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
            includeRest,
            defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
            conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
            invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
            staticAttrs: d.attrsInfo?.staticAttrs ?? {},
            inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
            attrsAsTag: d.attrsInfo?.attrsAsTag,
          }),
          d,
        ),
      );
      continue;
    }

    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        emitter.patternProp("className", classNameId),
        ...(isVoidTag ? [] : [emitter.patternProp("children", childrenId)]),
        emitter.patternProp("style", styleId),
      ],
      destructureProps: [],
      includeRest: true,
      restId,
    });
    const declStmt = j.variableDeclaration("const", [
      j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
    ]);

    // Use the style merger helper
    const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(d.attrsInfo);
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
      staticClassNameExpr,
    });

    const openingAttrs: JsxAttr[] = [
      ...emitter.buildAttrsFromAttrsInfo({
        attrsInfo,
        propExprFor: (prop) => j.identifier(prop),
      }),
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
      bodyStmts.push(buildUseThemeDeclaration(j));
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
              allowAsProp && emitTypes
                ? j(
                    `function _<C extends React.ElementType = "${tagName}">() { return null }`,
                  ).get().node.program.body[0].typeParameters
                : undefined,
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
    canUseSimplePropsType,
    shouldIncludeRestForProps,
    buildCompoundVariantExpressions,
    emitPropsType,
    emitSimplePropsType,
    withSimpleAsPropType,
    polymorphicIntrinsicPropsTypeText,
    propsTypeHasExistingPolymorphicAs,
    shouldAllowAsProp,
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
    const usedAttrsForType = emitter.getUsedAttrs(d.localName);
    const allowAsProp = shouldAllowAsProp(d, tagName);
    let inlineTypeText: string | undefined;
    // d.isExported is already set from exportedComponents during analyze-before-emit
    const isExportedComponent = d.isExported ?? false;
    const usePolymorphicPattern = allowAsProp && isExportedComponent;
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      const explicitPropNames = d.propsType
        ? emitter.getExplicitPropNames(d.propsType)
        : new Set<string>();
      const baseTypeText = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });

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
      const needsRestForType =
        !!d.usedAsValue ||
        usedAttrsForType.has("*") ||
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
        // They are often not part of intrinsic element props (e.g. `hasError`, `$size`),
        // so we keep them in the public props type even when we otherwise rely on
        // React's intrinsic props typing for pass-through props.
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
        const filtered = [...keys].filter(
          (k) =>
            k &&
            k !== "children" &&
            k !== "className" &&
            k !== "style" &&
            k !== "as" &&
            k !== "forwardedAs",
        );
        if (filtered.length === 0) {
          return "{}";
        }
        const lines = filtered.map((k) => `  ${k}?: any;`);
        return `{\n${lines.join("\n")}\n}`;
      })();

      const typeText = (() => {
        if (!explicit) {
          // If we forward `...rest`, prefer full intrinsic props typing so common
          // props (e.g. onChange) get correct types. Keep any style-driving custom
          // props intersected in so the wrapper can consume them.
          return needsRestForType
            ? emitter.joinIntersection(extendBaseTypeText, customStyleDrivingPropsTypeText)
            : baseTypeText;
        }
        if (VOID_TAGS.has(tagName)) {
          return emitter.joinIntersection(extendBaseTypeText, explicit);
        }
        if (needsRestForType) {
          // For non-exported components that only use transient props ($-prefixed),
          // use simple PropsWithChildren instead of verbose intersection type
          if (
            canUseSimplePropsType({
              isExported: d.isExported ?? false,
              usedAttrs: usedAttrsForType,
            })
          ) {
            return emitter.withChildren(explicit);
          }
          return emitter.joinIntersection(extendBaseTypeText, explicit);
        }
        if (allowClassNameProp || allowStyleProp) {
          const extras: string[] = [];
          if (allowClassNameProp) {
            extras.push("className?: string");
          }
          if (allowStyleProp) {
            extras.push("style?: React.CSSProperties");
          }
          extras.push("children?: React.ReactNode");
          return emitter.joinIntersection(explicit, `{ ${extras.join("; ")} }`);
        }
        // Wrap the explicit type with PropsWithChildren since the wrapper may need children
        return emitter.withChildren(explicit);
      })();

      // Emit the public props type.
      // For exported components that support `as`, use the full polymorphic pattern.
      // For non-exported components, use simple `as?: React.ElementType` without generics.
      // Detect if there are no custom user-defined props (just intrinsic element props)
      const hasNoCustomProps = !explicit && customStyleDrivingPropsTypeText === "{}";
      let typeAliasEmitted: boolean;
      if (usePolymorphicPattern) {
        typeAliasEmitted = emitPropsType({
          localName: d.localName,
          tagName,
          typeText,
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
          hasNoCustomProps,
        });
      } else if (!hasNoCustomProps) {
        typeAliasEmitted = emitSimplePropsType(d.localName, typeText, allowAsProp);
      } else {
        typeAliasEmitted = false;
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
            });
            inlineTypeText = poly.typeExprText;
          } else if (explicit) {
            // Use the user-defined type in an inline intersection - don't modify the original type
            // Also respect allowClassNameProp/allowStyleProp in the base type
            const poly = polymorphicIntrinsicPropsTypeText({
              tagName,
              allowClassNameProp,
              allowStyleProp,
              extra: explicit,
            });
            inlineTypeText = poly.typeExprText;
          } else {
            // Fallback: use the polymorphic props type with generic (shouldn't happen often)
            inlineTypeText = `${emitter.propsTypeNameFor(d.localName)}<C>`;
          }
        } else {
          // Use the computed typeText (which may be an intersection) as the inline type.
          inlineTypeText = withSimpleAsPropType(typeText, allowAsProp);
        }
      }
    }
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ...extraStyleArgsAfterBase,
    ];

    const destructureProps: string[] = [];
    // Track default values for props (for destructuring defaults)
    const propDefaults = new Map<string, string>();

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { cond, isBoolean } = emitter.collectConditionProps({
            when: extra.when,
            destructureProps,
          });
          styleArgs.push(
            emitter.makeConditionalStyleExpr({ cond, expr: extra.expr as any, isBoolean }),
          );
        } else {
          styleArgs.push(extra.expr as any);
        }
      }
    }

    // Handle theme boolean conditionals - add conditional true/false style args
    const needsUseTheme = appendThemeBooleanStyleArgs(
      d.needsUseThemeHook,
      styleArgs,
      j,
      stylesIdentifier,
      ctx,
    );

    // Collect keys used by compound variants (they're handled separately)
    const compoundVariantKeys = new Set<string>();
    for (const cv of d.compoundVariants ?? []) {
      compoundVariantKeys.add(cv.outerProp);
      compoundVariantKeys.add(`${cv.innerProp}True`);
      compoundVariantKeys.add(`${cv.innerProp}False`);
    }

    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      for (const [when, variantKey] of sortedEntries) {
        // Skip keys handled by compound variants
        if (compoundVariantKeys.has(when)) {
          continue;
        }
        const { cond, isBoolean } = emitter.collectConditionProps({ when, destructureProps });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
        // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
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
        propDefaults.set(attr.jsxProp, `${attr.value}`);
      }
    }

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps,
        propDefaults,
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
    });
    emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

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

    // Extract transient props (starting with $) from the explicit type.
    // Only destructure them when we actually spread `rest` into the element.
    const explicitTransientProps: string[] = [];
    const explicit = d.propsType;
    if (explicit?.type === "TSTypeLiteral" && explicit.members) {
      for (const member of explicit.members as any[]) {
        if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
          const name = member.key.name;
          if (name.startsWith("$")) {
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
          n.startsWith("$")
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
    // When defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0),
    // include rest spread so user can pass/override these props
    if (hasElementPropsInDefaultAttrs(d)) {
      shouldIncludeRest = true;
    }
    // Exported components should always include rest spread so that all element props
    // (id, onClick, aria-*, etc.) are forwarded to the element.
    if (isExportedComponent) {
      shouldIncludeRest = true;
    }
    if (shouldIncludeRest) {
      for (const name of explicitTransientProps) {
        if (!destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }

    if (allowAsProp || allowClassNameProp || allowStyleProp || needsUseTheme) {
      const isVoidTag = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildren = allowAsProp || !isVoidTag;
      const propsParamId = j.identifier("props");
      emitter.annotatePropsParam(propsParamId, d.localName, inlineTypeText);
      const propsId = j.identifier("props");
      const componentId = j.identifier("Component");
      const classNameId = j.identifier("className");
      const childrenId = j.identifier("children");
      const styleId = j.identifier("style");
      const restId = shouldIncludeRest ? j.identifier("rest") : null;

      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp
            ? [
                j.property.from({
                  kind: "init",
                  key: j.identifier("as"),
                  value: j.assignmentPattern(componentId, j.literal(tagName)),
                  shorthand: false,
                }),
              ]
            : []),
          ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
          ...(includeChildren ? [ctx.patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [ctx.patternProp("style", styleId)] : []),
        ],
        destructureProps,
        propDefaults,
        includeRest: Boolean(restId),
        restId: restId ?? undefined,
      });
      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      // Use the style merger helper
      const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(d.attrsInfo);
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
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo,
          propExprFor: (prop) => j.identifier(prop),
        }),
        ...(restId ? [j.jsxSpreadAttribute(restId)] : []),
      ];
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren,
        childrenExpr: childrenId,
      });

      const bodyStmts: StatementKind[] = [declStmt];
      if (needsUseTheme) {
        bodyStmts.push(buildUseThemeDeclaration(j));
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
                ? j(
                    `function _<C extends React.ElementType = "${tagName}">() { return null }`,
                  ).get().node.program.body[0].typeParameters
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
          includeRest: shouldIncludeRest,
          defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
          conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
          invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
          staticAttrs: d.attrsInfo?.staticAttrs ?? {},
          inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
          attrsAsTag: d.attrsInfo?.attrsAsTag,
        }),
        d,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared helpers for theme boolean conditional handling
// ---------------------------------------------------------------------------

/** Appends theme boolean conditional style args (e.g., `theme.isDark ? styles.boxDark : styles.boxLight`) to `styleArgs`. */
function appendThemeBooleanStyleArgs(
  hooks: StyledDecl["needsUseThemeHook"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
  ctx: EmitIntrinsicContext,
): boolean {
  if (!hooks || hooks.length === 0) {
    return false;
  }
  ctx.markNeedsUseThemeImport();
  for (const entry of hooks) {
    // Skip entries used only for triggering useTheme import/declaration
    // (e.g., when the theme conditional uses inline styles instead of style buckets)
    if (!entry.trueStyleKey && !entry.falseStyleKey) {
      continue;
    }
    const trueExpr = entry.trueStyleKey
      ? j.memberExpression(j.identifier(stylesIdentifier), j.identifier(entry.trueStyleKey))
      : (j.identifier("undefined") as ExpressionKind);
    const falseExpr = entry.falseStyleKey
      ? j.memberExpression(j.identifier(stylesIdentifier), j.identifier(entry.falseStyleKey))
      : (j.identifier("undefined") as ExpressionKind);
    const condition = entry.conditionExpr
      ? (cloneAstNode(entry.conditionExpr) as ExpressionKind)
      : j.memberExpression(j.identifier("theme"), j.identifier(entry.themeProp));
    styleArgs.push(j.conditionalExpression(condition, trueExpr, falseExpr));
  }
  return true;
}

/** Builds a `const theme = useTheme();` variable declaration. */
function buildUseThemeDeclaration(j: JSCodeshift): StatementKind {
  return j.variableDeclaration("const", [
    j.variableDeclarator(j.identifier("theme"), j.callExpression(j.identifier("useTheme"), [])),
  ]);
}
