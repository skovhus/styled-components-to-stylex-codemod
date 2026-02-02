import type { StyledDecl } from "../transform-types.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-context.js";
import type { ExpressionKind, InlineStyleProp } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { collectInlineStylePropNames } from "./types.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { withLeadingCommentsOnFirstFunction } from "./comments.js";
import {
  addAsPropToExistingType,
  buildCompoundVariantExpressions,
  extraStyleArgsFor,
  hasElementPropsInDefaultAttrs,
  mergeAsIntoPropsWithChildren,
  shouldIncludeRestForProps,
} from "./emit-intrinsic-helpers.js";

export function emitSimpleExportedIntrinsicWrappers(ctx: EmitIntrinsicContext): void {
  const { emitter, emitNamedPropsType, emitMinimalWrapper, emitted, markNeedsReactTypeImport } = ctx;
  const { j, stylesIdentifier, wrapperDecls } = emitter;

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
    if (d.siblingWrapper) {
      return false;
    }
    if (d.attrWrapper) {
      return false;
    }
    // Skip specialized wrapper categories (polymorphic intrinsic wrappers)
    if (emitter.wrapperNames.has(d.localName) || (d.supportsAsProp ?? false)) {
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
    const allowAsProp = emitter.shouldAllowAsPropForIntrinsic(d, tagName);
    let inlineTypeText: string | undefined;
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
        return emitter.withChildren(explicit);
      })();
      const asPropTypeText = allowAsProp ? "{ as?: React.ElementType }" : null;
      const mergedPropsWithChildren = allowAsProp ? mergeAsIntoPropsWithChildren(typeText) : null;
      const typeWithAs = mergedPropsWithChildren
        ? mergedPropsWithChildren
        : asPropTypeText
          ? emitter.joinIntersection(typeText, asPropTypeText)
          : typeText;
      // Check if explicit type is a simple type reference (e.g., `Props`) that exists in the file
      const explicitTypeName = emitter.getExplicitTypeNameIfExists(d.propsType);

      let typeAliasEmitted = false;
      const needsElementPropsForAttrs = hasElementPropsInDefaultAttrs(d);
      // When the explicit type exists and defaultAttrs reference element props
      // (like tabIndex: props.tabIndex ?? 0), extend the explicit type directly
      if (explicitTypeName && needsElementPropsForAttrs) {
        emitter.extendExistingType(explicitTypeName, extendBaseTypeText);
        // Also extend with as prop if needed
        if (asPropTypeText) {
          emitter.extendExistingType(explicitTypeName, asPropTypeText);
        }
        // Use the explicit type wrapped in PropsWithChildren for the function parameter
        // explicit is guaranteed to be truthy here since explicitTypeExists is true
        inlineTypeText = VOID_TAGS.has(tagName)
          ? (explicit ?? undefined)
          : emitter.withChildren(explicit!);
        // Note: Don't add asPropTypeText to inlineTypeText since it's already in the explicit type
      } else {
        typeAliasEmitted = emitNamedPropsType(d.localName, typeWithAs);
        if (!typeAliasEmitted && explicit) {
          const propsTypeName = emitter.propsTypeNameFor(d.localName);
          const typeExtended = emitter.extendExistingType(propsTypeName, extendBaseTypeText);
          if (!typeExtended) {
            inlineTypeText = VOID_TAGS.has(tagName) ? explicit : emitter.withChildren(explicit);
            if (asPropTypeText) {
              inlineTypeText = emitter.joinIntersection(inlineTypeText, asPropTypeText);
            }
          }
        }
      }
      if (!typeAliasEmitted && asPropTypeText) {
        addAsPropToExistingType(emitter, emitter.propsTypeNameFor(d.localName));
      }
      markNeedsReactTypeImport();
    }
    const styleArgs: ExpressionKind[] = [
      ...(d.extendsStyleKey
        ? [j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.extendsStyleKey))]
        : []),
      ...extraStyleArgsFor(emitter, d),
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
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
    if (shouldIncludeRest) {
      for (const name of explicitTransientProps) {
        if (!destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
    }

    if (allowAsProp || allowClassNameProp || allowStyleProp) {
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
          ...(allowClassNameProp ? [emitter.patternProp("className", classNameId)] : []),
          ...(includeChildren ? [emitter.patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [emitter.patternProp("style", styleId)] : []),
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
      const merging = emitStyleMerging({
        j,
        emitter,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      const openingAttrs: JsxAttr[] = [
        ...emitter.buildAttrsFromAttrsInfo({
          attrsInfo: d.attrsInfo,
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
        }),
        d,
      ),
    );
  }
}
