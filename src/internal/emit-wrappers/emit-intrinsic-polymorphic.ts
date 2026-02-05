/**
 * Emits intrinsic wrappers that require polymorphic `as` support.
 *
 * These wrappers generate AST for polymorphic props types and `as`-aware
 * wrapper functions so the chosen element type drives allowed props.
 */
import type { StyledDecl } from "../transform-types.js";
import { collectInlineStylePropNames, type ExpressionKind } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";

export function emitIntrinsicPolymorphicWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, j, emitTypes, wrapperDecls, wrapperNames, stylesIdentifier, emitted } = ctx;
  const {
    buildCompoundVariantExpressions,
    emitNamedPropsType,
    propsTypeHasExistingPolymorphicAs,
    shouldAllowAsProp,
  } = ctx.helpers;
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip specialized wrappers (input/link with attrWrapper) - they have their own handlers
    if (d.attrWrapper) {
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
      const allowAsProp = shouldAllowAsProp(d, tagName);
      const explicit = emitter.stringifyTsType(d.propsType);

      // Polymorphic `as` wrappers: type the wrapper generically so the chosen `as` value
      // influences allowed props (e.g. htmlFor when as="label", react-spring style props when as={animated.span}).
      // Detect if there are no custom user-defined props (just intrinsic element props)
      const hasNoCustomProps = !explicit;

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
        const baseMaybeOmitted =
          omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        const withAs = allowAsProp
          ? emitter.joinIntersection(baseMaybeOmitted, "{ as?: C }")
          : baseMaybeOmitted;
        return explicit ? emitter.joinIntersection(withAs, explicit) : withAs;
      })();

      // When there are no custom props, skip generating a named type.
      // The function parameter will use inline `React.ComponentPropsWithRef<C> & { as?: C }`.
      // When there ARE custom props but a user-defined type already exists, the inline
      // function parameter will use the intersection pattern instead.
      let typeAliasEmitted = false;
      if (!hasNoCustomProps) {
        typeAliasEmitted = emitNamedPropsType(
          d.localName,
          typeText,
          `C extends React.ElementType = "${tagName}"`,
        );
      }
      ctx.markNeedsReactTypeImport();

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

      // Track props that need to be destructured for variant styles
      const destructureProps: string[] = [];
      // Track default values for props (for destructuring defaults)
      const propDefaults = new Map<string, string>();

      // Collect keys used by compound variants (they're handled separately)
      const compoundVariantKeys = new Set<string>();
      for (const cv of d.compoundVariants ?? []) {
        compoundVariantKeys.add(cv.outerProp);
        compoundVariantKeys.add(`${cv.innerProp}True`);
        compoundVariantKeys.add(`${cv.innerProp}False`);
      }

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
          styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
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
      const themeHookName = d.needsThemeHook
        ? emitter.ensureThemeHookName({
            d,
            reservedNames: emitter.buildThemeHookReservedNames({
              d,
              destructureProps,
              additional: ["children", "className", "style", "rest", "Component"],
            }),
          })
        : undefined;
      emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

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

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(
          j.objectPattern([
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
            ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
            ...(includeChildren ? [ctx.patternProp("children", childrenId)] : []),
            ...(allowStyleProp ? [ctx.patternProp("style", styleId)] : []),
            // Add variant props to destructuring (with defaults when available)
            ...destructureProps.filter(Boolean).map((name) => {
              const defaultVal = propDefaults.get(name);
              if (defaultVal) {
                // Create property with default: { name = "defaultValue" }
                return j.property.from({
                  kind: "init",
                  key: j.identifier(name),
                  value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
                  shorthand: false,
                });
              }
              return ctx.patternProp(name);
            }),
            j.restElement(restId),
          ] as any),
          propsId,
        ),
      ]);

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

      const attrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo,
          propExprFor: (prop) => j.identifier(prop),
        }),
        j.jsxSpreadAttribute(restId),
      ];
      emitter.appendMergingAttrs(attrs, merging);
      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs,
        includeChildren,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (d.needsThemeHook) {
        fnBodyStmts.push(emitter.buildThemeHookStatement(themeHookName));
      }
      if (merging.sxDecl) {
        fnBodyStmts.push(merging.sxDecl);
      }
      fnBodyStmts.push(j.returnStatement(jsx as any));

      const polymorphicFnTypeParams =
        emitTypes && allowAsProp
          ? j(`function _<C extends React.ElementType = "${tagName}">() { return null }`).get().node
              .program.body[0].typeParameters
          : undefined;

      emitted.push(
        emitter.buildWrapperFunction({
          localName: d.localName,
          params: [propsParamId],
          bodyStmts: fnBodyStmts,
          typeParameters: polymorphicFnTypeParams,
        }),
      );
    }
  }
}
