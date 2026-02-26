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
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { withLeadingCommentsOnFirstFunction } from "./comments.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { cloneAstNode, collectIdentifiers } from "../utilities/jscodeshift-utils.js";
import {
  areEquivalentWhen,
  getPositiveWhen,
  makeConditionalStyleExpr,
  parseVariantWhenToAst,
} from "./variant-condition.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";

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
            allowSxProp,
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
              allowSxProp,
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
        allowSxProp,
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
      () => ctx.markNeedsUseThemeImport(),
    );

    // Handle pseudo-alias selectors (e.g., &:${highlight})
    const pseudoGuardProps = appendPseudoAliasStyleArgs(
      d.pseudoAliasSelectors,
      styleArgs,
      j,
      stylesIdentifier,
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
        allowSxProp,
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
      const supportsExternalStyles = d.supportsExternalStyles ?? false;
      const needsRestForType =
        !!d.usedAsValue ||
        usedAttrsForType.has("*") ||
        // External callers need full HTML props (id, onClick, aria-*, etc.)
        supportsExternalStyles ||
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

      const sxTypeIntersection = allowSxProp ? `{ ${SX_PROP_TYPE_TEXT} }` : undefined;

      const typeText = (() => {
        if (!explicit) {
          // If we forward `...rest`, prefer full intrinsic props typing so common
          // props (e.g. onChange) get correct types. Keep any style-driving custom
          // props intersected in so the wrapper can consume them.
          return needsRestForType
            ? emitter.joinIntersection(
                extendBaseTypeText,
                customStyleDrivingPropsTypeText,
                sxTypeIntersection,
              )
            : baseTypeText;
        }
        if (VOID_TAGS.has(tagName)) {
          return emitter.joinIntersection(extendBaseTypeText, explicit, sxTypeIntersection);
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
          return emitter.joinIntersection(extendBaseTypeText, explicit, sxTypeIntersection);
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
      let typeAliasEmitted: boolean;
      if (usePolymorphicPattern) {
        typeAliasEmitted = emitPropsType({
          localName: d.localName,
          tagName,
          typeText: typeTextWithForwardedAs,
          allowAsProp,
          allowClassNameProp,
          allowStyleProp,
          allowSxProp,
          hasNoCustomProps,
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
            });
            inlineTypeText = poly.typeExprText;
          } else {
            // Fallback: use the polymorphic props type with generic (shouldn't happen often)
            inlineTypeText = `${emitter.propsTypeNameFor(d.localName)}<C>`;
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
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
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

    // Handle pseudo-alias selectors (e.g., &:${highlight})
    for (const gp of appendPseudoAliasStyleArgs(
      d.pseudoAliasSelectors,
      styleArgs,
      j,
      stylesIdentifier,
    )) {
      if (!destructureProps.includes(gp)) {
        destructureProps.push(gp);
      }
    }

    // Collect keys used by compound variants (they're handled separately)
    const compoundVariantKeys = new Set<string>();
    for (const cv of d.compoundVariants ?? []) {
      compoundVariantKeys.add(cv.outerProp);
      compoundVariantKeys.add(`${cv.innerProp}True`);
      compoundVariantKeys.add(`${cv.innerProp}False`);
    }

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
          const { cond } = emitter.collectConditionProps({ when: positiveWhen, destructureProps });

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
          styleArgs.push(j.conditionalExpression(cond, trueExpr, falseExpr));
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

    // Add adapter-resolved StyleX styles that should come after variant styles
    // to preserve CSS cascade order (e.g., unconditional border-bottom after conditional border).
    if (afterVariantStyleArgs.length > 0) {
      styleArgs.push(...afterVariantStyleArgs);
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

    maybeApplySafeTruthyDefaultFromExtraStyleConditionals({
      j,
      d,
      styleArgs,
      propDefaults,
    });

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
      const restId = shouldIncludeRest ? j.identifier("rest") : null;
      const forwardedAsId = j.identifier("forwardedAs");

      if (allowSxProp) {
        styleArgs.push(sxId);
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
          ...(allowSxProp ? [ctx.patternProp("sx", sxId)] : []),
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
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: attrsInfoWithoutForwardedAsStatic,
          propExprFor: (prop) => j.identifier(prop),
        }),
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
        childrenExpr: childrenId,
      });

      const bodyStmts: StatementKind[] = [declStmt];
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
 * Finds the next unconsumed entry in sorted variant entries that has a
 * complementary "when" condition to the entry at `index`.
 */
function findComplementaryVariantEntry(
  entries: ReadonlyArray<readonly [string, string]>,
  index: number,
  consumed: ReadonlySet<number>,
): number | null {
  const when = entries[index]?.[0];
  if (!when) {
    return null;
  }
  let next = index + 1;
  while (next < entries.length && consumed.has(next)) {
    next++;
  }
  if (next >= entries.length) {
    return null;
  }
  const otherWhen = entries[next]?.[0];
  if (otherWhen && getPositiveWhen(when, otherWhen) !== null) {
    return next;
  }
  return null;
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
export function appendThemeBooleanStyleArgs(
  hooks: StyledDecl["needsUseThemeHook"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
  markNeedsUseThemeImport: () => void,
): boolean {
  if (!hooks || hooks.length === 0) {
    return false;
  }
  markNeedsUseThemeImport();
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

/**
 * Appends pseudo-alias style args to `styleArgs`.
 *
 * Emits `selectorExpr({ active: styles.keyActive, hover: styles.keyHover })` as a single arg.
 * When the entry has a `guard`, the call is wrapped: `cond && selectorExpr(...)`.
 *
 * Returns the list of guard prop names that need destructuring.
 */
export function appendPseudoAliasStyleArgs(
  entries: StyledDecl["pseudoAliasSelectors"],
  styleArgs: ExpressionKind[],
  j: JSCodeshift,
  stylesIdentifier: string,
): string[] {
  const guardProps: string[] = [];
  if (!entries?.length) {
    return guardProps;
  }
  for (const entry of entries) {
    const properties = entry.pseudoNames.map((name, i) =>
      j.property(
        "init",
        /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? j.identifier(name) : j.literal(name),
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(entry.styleKeys[i]!)),
      ),
    );
    const callExpr = j.callExpression(cloneAstNode(entry.styleSelectorExpr) as ExpressionKind, [
      j.objectExpression(properties),
    ]) as ExpressionKind;

    if (entry.guard) {
      const parsed = parseVariantWhenToAst(j, entry.guard.when);
      for (const p of parsed.props) {
        if (p && !guardProps.includes(p)) {
          guardProps.push(p);
        }
      }
      styleArgs.push(
        makeConditionalStyleExpr(j, {
          cond: parsed.cond,
          expr: callExpr,
          isBoolean: parsed.isBoolean,
        }),
      );
    } else {
      styleArgs.push(callExpr);
    }
  }
  return guardProps;
}

/** Builds a `const theme = useTheme();` variable declaration. */
export function buildUseThemeDeclaration(
  j: JSCodeshift,
  themeHookFunctionName: string,
): StatementKind {
  return j.variableDeclaration("const", [
    j.variableDeclarator(
      j.identifier("theme"),
      j.callExpression(j.identifier(themeHookFunctionName), []),
    ),
  ]);
}
