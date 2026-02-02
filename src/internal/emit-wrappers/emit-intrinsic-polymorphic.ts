import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import type { ExpressionKind } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { collectInlineStylePropNames } from "./types.js";
import { buildCompoundVariantExpressions, extraStyleArgsFor } from "./emit-intrinsic-helpers.js";

export function emitIntrinsicPolymorphicWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitNamedPropsType, emitted, markNeedsReactTypeImport } = ctx;
  const { j, stylesIdentifier, emitTypes, wrapperDecls, wrapperNames } = emitter;
  const intrinsicPolymorphicWrapperDecls = wrapperDecls.filter((d: StyledDecl) => {
    if (d.base.kind !== "intrinsic") {
      return false;
    }
    // Skip specialized wrappers (input/link with attrWrapper) - they have their own handlers
    if (d.attrWrapper) {
      return false;
    }
    // Use wrapperNames (includes props type check and JSX usage) OR supportsAsProp (adapter opt-in)
    return wrapperNames.has(d.localName) || (d.supportsAsProp ?? false);
  });

  if (intrinsicPolymorphicWrapperDecls.length === 0) {
    return;
  }

  for (const d of intrinsicPolymorphicWrapperDecls) {
    if (d.base.kind !== "intrinsic") {
      continue;
    }
    const tagName = d.base.tagName;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, tagName);
    const explicit = emitter.stringifyTsType(d.propsType);

    // Check if the explicit props type is a simple (non-generic) type reference.
    // If so, we should NOT make the wrapper function generic - just use the existing type directly.
    const isExplicitNonGenericType =
      explicit && d.propsType?.type === "TSTypeReference" && !d.propsType.typeParameters;

    // Polymorphic `as` wrappers: type the wrapper generically so the chosen `as` value
    // influences allowed props (e.g. htmlFor when as="label", react-spring style props when as={animated.span}).
    // Exception: if the original props type is already defined and non-generic, use it directly.
    const typeText = (() => {
      if (explicit) {
        return explicit;
      }
      const used = emitter.getUsedAttrs(d.localName);
      // Use ComponentPropsWithRef when ref is used on the component
      const hasRef = used.has("ref");
      const base = hasRef ? "React.ComponentPropsWithRef<C>" : "React.ComponentPropsWithoutRef<C>";
      // Omit className/style only when we don't want to support them.
      const omitted: string[] = [];
      if (!allowClassNameProp) {
        omitted.push('"className"');
      }
      if (!allowStyleProp) {
        omitted.push('"style"');
      }
      const baseMaybeOmitted = omitted.length > 0 ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
      if (!allowAsProp) {
        return baseMaybeOmitted;
      }
      return emitter.joinIntersection(baseMaybeOmitted, "{ as?: C }");
    })();

    if (!isExplicitNonGenericType) {
      emitNamedPropsType(d.localName, typeText, `C extends React.ElementType = "${tagName}"`);
    }
    markNeedsReactTypeImport();

    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(emitter, d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
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
        const { cond } = emitter.collectConditionProps({ when, destructureProps });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Simple style lookups always use && (falsy values like false/undefined are valid for stylex.props)
        styleArgs.push(j.logicalExpression("&&", cond, styleExpr));
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
      buildCompoundVariantExpressions({
        emitter,
        compoundVariants: d.compoundVariants,
        styleArgs,
        destructureProps,
      });
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
    emitter.collectDestructurePropsFromStyleFns({ d, styleArgs, destructureProps });

    const isVoidTag = VOID_TAGS.has(tagName);
    // When allowAsProp is true, include children support even for void tags
    // because the user might use `as="textarea"` which requires children
    const includeChildren = allowAsProp || !isVoidTag;
    const propsParamId = j.identifier("props");
    if (emitTypes) {
      if (isExplicitNonGenericType) {
        // Use the existing non-generic type directly without making the function generic
        (propsParamId as any).typeAnnotation = j(
          `const x: ${explicit} = null`,
        ).get().node.program.body[0].declarations[0].id.typeAnnotation;
      } else {
        // Make the wrapper function generic so `as` can influence props.
        const tp = j(
          `function _<C extends React.ElementType = "${tagName}">() { return null }`,
        ).get().node.program.body[0].typeParameters;
        (propsParamId as any).typeAnnotation = j(
          `const x: ${emitter.propsTypeNameFor(d.localName)}<C> = null`,
        ).get().node.program.body[0].declarations[0].id.typeAnnotation;
        (propsParamId as any).typeParameters = tp;
      }
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
          ...(allowClassNameProp ? [emitter.patternProp("className", classNameId)] : []),
          ...(includeChildren ? [emitter.patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [emitter.patternProp("style", styleId)] : []),
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
            return emitter.patternProp(name);
          }),
          j.restElement(restId),
        ] as any),
        propsId,
      ),
    ]);

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

    const attrs: JsxAttr[] = [
      ...emitter.buildAttrsFromAttrsInfo({
        attrsInfo: d.attrsInfo,
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
    if (merging.sxDecl) {
      fnBodyStmts.push(merging.sxDecl);
    }
    fnBodyStmts.push(j.returnStatement(jsx as any));

    emitted.push(
      emitter.buildWrapperFunction({
        localName: d.localName,
        params: [propsParamId],
        bodyStmts: fnBodyStmts,
        moveTypeParamsFromParam: propsParamId,
      }),
    );
  }
}
