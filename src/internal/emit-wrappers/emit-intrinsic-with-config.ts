import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import type { ExpressionKind, InlineStyleProp } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { collectInlineStylePropNames } from "./types.js";
import { withLeadingCommentsOnFirstFunction } from "./comments.js";
import { emitStyleMerging } from "./style-merger.js";
import { VOID_TAGS } from "./type-helpers.js";
import {
  asDestructureProp,
  extraStyleArgsFor,
  hasElementPropsInDefaultAttrs,
} from "./emit-intrinsic-helpers.js";

export function emitSimpleWithConfigWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitMinimalWrapper, emitPropsType, markNeedsReactTypeImport, emitted } = ctx;
  const { j, stylesIdentifier, wrapperDecls } = emitter;

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
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Don't duplicate the polymorphic wrapper path.
    if (emitter.wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) {
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
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, tagName);
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

      // Check if explicit type is a simple type reference that exists in the file
      // and if defaultAttrs reference element props - if so, extend the type with intrinsic props
      const explicitTypeName = emitter.getExplicitTypeNameIfExists(d.propsType);
      const needsElementProps = hasElementPropsInDefaultAttrs(d);

      if (explicitTypeName && explicit && needsElementProps) {
        // Extend the existing type with intrinsic element props so that element props
        // like tabIndex are available (when used in defaultAttrs like `tabIndex: props.tabIndex ?? 0`)
        const intrinsicBaseType = emitter.inferredIntrinsicPropsTypeText({
          d,
          tagName,
          allowClassNameProp,
          allowStyleProp,
        });
        emitter.extendExistingType(explicitTypeName, intrinsicBaseType);
        markNeedsReactTypeImport();
        emitPropsType(d.localName, explicit, allowAsProp);
      } else {
        // For non-void tags without explicit type, wrap in PropsWithChildren
        const typeWithChildren =
          !explicit && !VOID_TAGS.has(tagName) ? emitter.withChildren(baseTypeText) : baseTypeText;
        const typeText = explicit ?? typeWithChildren;
        emitPropsType(d.localName, typeText, allowAsProp);
      }
    }
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(emitter, d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    const propsParamId = j.identifier("props");
    emitter.annotatePropsParam(propsParamId, d.localName);
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");

    const isVoidTag = VOID_TAGS.has(tagName);

    // For local-only wrappers with no external `className`/`style` usage, keep the wrapper minimal.
    if (!allowClassNameProp && !allowStyleProp) {
      const usedAttrs = emitter.getUsedAttrs(d.localName);
      // Include rest spread when:
      // - Component is used with spread (usedAttrs.has("*"))
      // - Component is used as a value
      // - Component is not exported and has used attrs
      // - defaultAttrs reference element props (like tabIndex: props.tabIndex ?? 0)
      //   which means user should be able to pass/override these props
      const includeRest =
        usedAttrs.has("*") ||
        !!d.usedAsValue ||
        (!(d.isExported ?? false) && usedAttrs.size > 0) ||
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
      emitted.push(
        ...withLeadingCommentsOnFirstFunction(
          emitMinimalWrapper({
            localName: d.localName,
            tagName,
            propsTypeName: emitter.propsTypeNameFor(d.localName),
            styleArgs,
            destructureProps,
            allowAsProp,
            allowClassNameProp: false,
            allowStyleProp: false,
            includeRest,
            defaultAttrs: d.attrsInfo?.defaultAttrs ?? [],
            conditionalAttrs: d.attrsInfo?.conditionalAttrs ?? [],
            invertedBoolAttrs: d.attrsInfo?.invertedBoolAttrs ?? [],
            staticAttrs: d.attrsInfo?.staticAttrs ?? {},
            inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
          }),
          d,
        ),
      );
      continue;
    }

    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(j, tagName)] : []),
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
    const merging = emitStyleMerging({
      j,
      emitter,
      styleArgs,
      classNameId,
      styleId,
      allowClassNameProp,
      allowStyleProp,
      inlineStyleProps: [],
    });

    const openingAttrs: JsxAttr[] = [
      ...emitter.buildAttrsFromAttrsInfo({
        attrsInfo: d.attrsInfo,
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
          }),
        ],
        d,
      ),
    );
  }
}
