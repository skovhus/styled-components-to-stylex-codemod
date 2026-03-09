/**
 * Emits intrinsic wrappers that require polymorphic `as` support.
 *
 * These wrappers generate AST for polymorphic props types and `as`-aware
 * wrapper functions so the chosen element type drives allowed props.
 */
import type { StyledDecl } from "../transform-types.js";
import { getBridgeClassVar } from "../utilities/bridge-classname.js";
import {
  collectInlineStylePropNames,
  type ExpressionKind,
  type WrapperPropDefaults,
} from "./types.js";
import { withLeadingComments } from "./comments.js";
import { SX_PROP_TYPE_TEXT, type JsxAttr, type StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { getCompoundVariantWhenKeys, type EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { appendAllPseudoStyleArgs } from "./emit-intrinsic-simple.js";
import { mergeOrderedEntries, type OrderedStyleEntry } from "./style-expr-builders.js";

export function emitIntrinsicPolymorphicWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, wrapperNames, stylesIdentifier, emitted } = ctx;
  const {
    buildCompoundVariantExpressions,
    buildForwardedAsValueExpr,
    emitNamedPropsType,
    hasForwardedAsUsage,
    propsTypeHasExistingPolymorphicAs,
    splitForwardedAsStaticAttrs,
    shouldAllowAsProp,
    withForwardedAsType,
  } = ctx.helpers;
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip specialized wrappers (input/link with attrWrapper) - they have their own handlers
    if (d.attrWrapper) {
      return false;
    }
    // Skip components with shouldForwardProp - the SFP emitter handles them
    // (including polymorphic `as` prop support when supportsAsProp is true)
    if (d.shouldForwardProp) {
      return false;
    }
    // Skip components whose props type already has `as?: React.ElementType` -
    // these are designed for runtime polymorphism and upgrading them to our generic
    // pattern can cause TypeScript inference issues with custom props
    if (propsTypeHasExistingPolymorphicAs(d)) {
      return false;
    }
    // Use wrapperNames (includes props type check and JSX usage) OR supportsAsProp (adapter opt-in)
    return wrapperNames.has(d.localName) || (d.supportsAsProp ?? false);
  });

  if (intrinsicPolymorphicWrapperDecls.length > 0) {
    for (const d of intrinsicPolymorphicWrapperDecls) {
      if (d.base.kind !== "intrinsic") {
        continue;
      }
      const tagName = d.base.tagName;
      const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
      const allowStyleProp = emitter.shouldAllowStyleProp(d);
      const allowSxProp = emitter.shouldAllowSxProp(d);
      const allowAsProp = shouldAllowAsProp(d, tagName);
      const includesForwardedAs = hasForwardedAsUsage(d);
      const explicit = emitter.stringifyTsType(d.propsType);

      // Polymorphic `as` wrappers: type the wrapper generically so the chosen `as` value
      // influences allowed props (e.g. htmlFor when as="label", react-spring style props when as={animated.span}).
      // Detect if there are no custom user-defined props (just intrinsic element props)
      const hasNoCustomProps = !explicit;
      // When the user already has a well-named type, skip creating a new type alias
      const explicitIsExistingTypeRef = !!emitter.getExplicitTypeNameIfExists(d.propsType);

      const typeText = (() => {
        const base = "React.ComponentPropsWithRef<C>";
        // Omit className/style only when we don't want to support them.
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        // When there's a custom props type, omit its keys from element props
        // so custom props take precedence over native element props
        if (explicit) {
          omitted.push(`keyof (${explicit})`);
        }
        const baseMaybeOmitted =
          omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        const asPropParts: string[] = [];
        if (allowSxProp) {
          asPropParts.push(SX_PROP_TYPE_TEXT);
        }
        if (allowAsProp) {
          asPropParts.push("as?: C");
        }
        const withAs =
          asPropParts.length > 0
            ? emitter.joinIntersection(baseMaybeOmitted, `{ ${asPropParts.join("; ")} }`)
            : baseMaybeOmitted;
        const withForwardedAs = withForwardedAsType(withAs, includesForwardedAs);
        if (!explicit) {
          return withForwardedAs;
        }
        // Put user's existing type first for readability when it's a named type in the file
        return explicitIsExistingTypeRef
          ? emitter.joinIntersection(explicit, withForwardedAs)
          : emitter.joinIntersection(withForwardedAs, explicit);
      })();

      // When there are no custom props, skip generating a named type.
      // The function parameter will use inline `React.ComponentPropsWithRef<C> & { as?: C }`.
      // When the user already has a well-named type (explicitIsExistingTypeRef), also skip
      // creating a new type alias — use the existing type inline instead.
      let typeAliasEmitted = false;
      if (!hasNoCustomProps && !explicitIsExistingTypeRef) {
        typeAliasEmitted = emitNamedPropsType(
          d.localName,
          typeText,
          `C extends React.ElementType = "${tagName}"`,
        );
      }
      ctx.markNeedsReactTypeImport();

      // Track props that need to be destructured for variant styles
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
      const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
        emitter.buildInterleavedExtraStyleArgs(d, propsArgExprs);
      const styleArgs: ExpressionKind[] = [
        ...(d.extendsStyleKey
          ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
          : []),
        ...extraStyleArgs,
        ...emitter.baseStyleExpr(d),
        ...extraStyleArgsAfterBase,
      ];

      // Collect keys used by compound variants (they're handled separately)
      const compoundVariantKeys = new Set<string>();
      for (const cv of d.compoundVariants ?? []) {
        for (const k of getCompoundVariantWhenKeys(cv)) {
          compoundVariantKeys.add(k);
        }
      }

      // Collect variant and styleFn expressions with source order for interleaving.
      const hasSourceOrder = !!(
        d.variantSourceOrder && Object.keys(d.variantSourceOrder).length > 0
      );
      const orderedEntries: OrderedStyleEntry[] = [];

      // Add variant style arguments if this component has variants
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
          const expr = emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean });
          const order = d.variantSourceOrder?.[when];
          if (hasSourceOrder && order !== undefined) {
            orderedEntries.push({ order, expr });
          } else {
            styleArgs.push(expr);
          }
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

      for (const gp of appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier)) {
        if (!destructureProps.includes(gp)) {
          destructureProps.push(gp);
        }
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

      const isVoidTag = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildren = allowAsProp || !isVoidTag;
      const propsParamId = j.identifier("props");
      if (emitTypes) {
        // When no type alias was emitted (either because there are no custom props OR
        // because the user-defined type already exists), use the inline typeText which
        // already contains the full intersection (explicit & React.ComponentPropsWithRef<C> & { as?: C })
        const propsTypeText = typeAliasEmitted
          ? `${emitter.propsTypeNameFor(d.localName)}<C>`
          : typeText;
        (propsParamId as any).typeAnnotation = j(
          `const x: ${propsTypeText} = null`,
        ).get().node.program.body[0].declarations[0].id.typeAnnotation;
      }
      const propsId = j.identifier("props");
      const childrenId = j.identifier("children");
      const restId = j.identifier("rest");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const sxId = j.identifier("sx");
      const forwardedAsId = j.identifier("forwardedAs");

      if (allowSxProp) {
        styleArgs.push(sxId);
      }

      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp
            ? [
                j.property.from({
                  kind: "init",
                  key: j.identifier("as"),
                  value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
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
        includeRest: true,
        restId,
      });

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

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
        inlineStyleProps: [],
        staticClassNameExpr,
        isIntrinsicElement: false,
      });

      const attrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: attrsInfoWithoutForwardedAsStatic,
          propExprFor: (prop) => j.identifier(prop),
        }),
        j.jsxSpreadAttribute(restId),
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
      emitter.appendMergingAttrs(attrs, merging);
      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs,
        includeChildren,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      const polymorphicFnTypeParams =
        emitTypes && allowAsProp ? buildPolymorphicTypeParams(j, tagName) : undefined;

      emitted.push(
        withLeadingComments(
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts: fnBodyStmts,
            typeParameters: polymorphicFnTypeParams,
          }),
          d,
        ),
      );
    }
  }
}
