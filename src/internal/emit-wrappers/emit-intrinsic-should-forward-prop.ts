/**
 * Emits intrinsic wrappers for shouldForwardProp configurations.
 *
 * These wrappers filter props before forwarding and generate stylex merge
 * AST for the remaining props.
 */
import type { StyledDecl } from "../transform-types.js";
import { buildStyleFnConditionExpr } from "../utilities/jscodeshift-utils.js";
import { type ExpressionKind, type InlineStyleProp } from "./types.js";
import type { JsxAttr, StatementKind } from "./wrapper-emitter.js";
import { emitStyleMerging } from "./style-merger.js";
import { sortVariantEntriesBySpecificity, VOID_TAGS } from "./type-helpers.js";
import { withLeadingComments } from "./comments.js";
import type { EmitIntrinsicContext } from "./emit-intrinsic-helpers.js";
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
    canUseSimplePropsType,
    shouldIncludeRestForProps,
    buildCompoundVariantExpressions,
    emitPropsType,
    asDestructureProp,
    shouldAllowAsProp,
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

    const explicit = emitter.stringifyTsType(d.propsType);
    // Extract prop names from explicit type to avoid duplicating them in inferred type
    const explicitPropNames = d.propsType
      ? emitter.getExplicitPropNames(d.propsType)
      : new Set<string>();
    const extrasTypeText = (() => {
      // If input provided an explicit props type, prefer it and avoid emitting `any` overrides
      // for the same keys (e.g. `color?: string` should not become `color?: any`).
      if (explicit && explicit.trim()) {
        // Only allow arbitrary `$...` transient props when we see unknown/spread attrs at call-sites.
        return dropPrefixFromFilter === "$" && shouldAllowAnyPrefixProps
          ? `${explicit} & { [K in \`$\${string}\`]?: any }`
          : explicit;
      }
      const lines: string[] = [];
      for (const p of extraProps) {
        // Only emit valid identifier keys (fixtures use simple identifiers like `hasError` / `$foo`).
        if (!isValidIdentifier(p)) {
          continue;
        }
        lines.push(`  ${p}?: any;`);
      }
      const literal = lines.length > 0 ? `{\n${lines.join("\n")}\n}` : "{}";
      if (dropPrefixFromFilter === "$") {
        // Allow any `$...` transient prop when the filter is prefix-based.
        return `${literal} & { [K in \`$\${string}\`]?: any }`;
      }
      return literal;
    })();
    const finalTypeText = (() => {
      if (explicit) {
        // For non-exported components that only use transient props ($-prefixed),
        // use simple PropsWithChildren instead of verbose intersection type
        if (
          canUseSimplePropsType({
            isExported: d.isExported ?? false,
            usedAttrs,
            isVoidTag: VOID_TAGS.has(tagName),
          })
        ) {
          return emitter.withChildren(extrasTypeText);
        }
        if (VOID_TAGS.has(tagName)) {
          const base = emitter.reactIntrinsicAttrsType(tagName);
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          return emitter.joinIntersection(baseWithOmit, extrasTypeText);
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
        return emitter.joinIntersection(baseWithOmit, extrasTypeText);
      }
      const inferred = emitter.inferredIntrinsicPropsTypeText({
        d,
        tagName,
        allowClassNameProp,
        allowStyleProp,
        skipProps: explicitPropNames,
      });
      return VOID_TAGS.has(tagName) ? inferred : emitter.withChildren(inferred);
    })();

    // Detect if there are no custom user-defined props (just intrinsic element props)
    const hasNoCustomProps = !explicit && extraProps.size === 0;

    // Emit props type (result not used - inline type is always used in function parameter)
    emitPropsType({
      localName: d.localName,
      tagName,
      typeText: finalTypeText,
      allowAsProp,
      allowClassNameProp,
      allowStyleProp,
      hasNoCustomProps,
    });
    // For NON-POLYMORPHIC components (without `as` support), extend user-defined types
    // to include element props like children, className, style.
    // For POLYMORPHIC components (with `as` support), we don't modify the type -
    // instead we add element props as an inline intersection in the function parameter.
    if (!allowAsProp && explicit) {
      const propsTypeName = emitter.propsTypeNameFor(d.localName);
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
      emitter.extendExistingType(propsTypeName, extendBaseTypeText);
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

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { cond, isBoolean } = emitter.collectConditionProps({ when: extra.when });
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
        const { cond, isBoolean } = emitter.collectConditionProps({ when });
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
        // Use makeConditionalStyleExpr to handle boolean vs non-boolean conditions correctly.
        // For boolean conditions, && is used. For non-boolean (could be "" or 0), ternary is used.
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: styleExpr, isBoolean }));
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

    // Initialize destructureParts and propDefaults early so buildVariantDimensionLookups can populate them
    const destructureParts: string[] = [];
    // Track default values for props (for destructuring defaults)
    const propDefaults = new Map<string, string>();
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

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      // Pass destructureParts and propDefaults to track props and their defaults
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps: destructureParts,
        propDefaults,
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
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [callArg],
      );
      if (p.conditionWhen) {
        const { cond, isBoolean } = emitter.collectConditionProps({ when: p.conditionWhen });
        styleArgs.push(emitter.makeConditionalStyleExpr({ cond, expr: call, isBoolean }));
        continue;
      }
      const isRequired =
        p.jsxProp === "__props" || emitter.isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      styleArgs.push(
        buildStyleFnConditionExpr({ j, condition: p.condition, propExpr, call, isRequired }),
      );
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

    const themeHookName = d.needsThemeHook
      ? emitter.getThemeHookName({ d, destructureProps: destructureParts })
      : undefined;

    const propsParamId = j.identifier("props");
    if (allowAsProp && emitTypes) {
      // When there are no custom props, use inline type
      // When there ARE custom props (explicit), use inline intersection with user-defined type
      const propsTypeText = hasNoCustomProps
        ? "React.ComponentPropsWithRef<C> & { as?: C }"
        : explicit
          ? `${explicit} & React.ComponentPropsWithRef<C> & { as?: C }`
          : `${emitter.propsTypeNameFor(d.localName)}<C>`;
      emitter.annotatePropsParam(propsParamId, d.localName, propsTypeText);
    } else {
      emitter.annotatePropsParam(propsParamId, d.localName);
    }
    const propsId = j.identifier("props");
    const classNameId = j.identifier("className");
    const childrenId = j.identifier("children");
    const styleId = j.identifier("style");
    const restId = j.identifier("rest");
    const isVoidTag = tagName === "input";
    const { hasAny: hasLocalUsage } = emitter.getJsxCallsites(d.localName);

    const shouldIncludeRest = shouldIncludeRestForProps({
      usedAsValue: emitter.isUsedAsValueInFile(d.localName),
      hasLocalUsage,
      usedAttrs,
      destructureProps: destructureParts,
      ignoreTransientAttrs: true,
    });

    // Skip rest spread omission for exported components - external consumers may pass additional props
    // d.isExported is already set from exportedComponents during analyze-before-emit
    const isExportedComponent = d.isExported ?? false;
    const shouldOmitRestSpread =
      !isExportedComponent &&
      !dropPrefix &&
      dropProps.length > 0 &&
      dropProps.every((p: string) => p.startsWith("$")) &&
      !usedAttrs.has("*") &&
      [...usedAttrs].every((n) => n === "children" || dropProps.includes(n));
    // Exported components should always include rest spread so that all element props
    // (id, onClick, aria-*, etc.) are forwarded to the element.
    const includeRest = isExportedComponent || (!shouldOmitRestSpread && shouldIncludeRest);

    if (!allowClassNameProp && !allowStyleProp) {
      const isVoid = VOID_TAGS.has(tagName);
      // When allowAsProp is true, include children support even for void tags
      // because the user might use `as="textarea"` which requires children
      const includeChildrenInner = allowAsProp || !isVoid;
      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(allowAsProp ? [asDestructureProp(tagName)] : []),
          ...(includeChildrenInner ? [ctx.patternProp("children", childrenId)] : []),
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
      // - Either: local usage of unknown prefix props, OR exported component (external callers may pass unknown prefix props)
      // - Rest spread is included
      const needsCleanupLoop =
        dropPrefix && (isExportedComponent || shouldAllowAnyPrefixProps) && includeRest;
      const cleanupPrefixStmt = needsCleanupLoop
        ? buildPrefixCleanupStatements(j, restId, dropPrefix)
        : null;

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
        ...(includeRest ? [j.jsxSpreadAttribute(restId)] : []),
      ];
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: allowAsProp ? "Component" : tagName,
        attrs: openingAttrs,
        includeChildren: includeChildrenInner,
        childrenExpr: childrenId,
      });

      const fnBodyStmts: StatementKind[] = [declStmt];
      if (d.needsThemeHook) {
        fnBodyStmts.push(emitter.buildThemeHookStatement(themeHookName));
      }
      if (cleanupPrefixStmt) {
        fnBodyStmts.push(...cleanupPrefixStmt);
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
              allowAsProp && emitTypes
                ? j(
                    `function _<C extends React.ElementType = "${tagName}">() { return null }`,
                  ).get().node.program.body[0].typeParameters
                : undefined,
          }),
          d,
        ),
      );
      continue;
    }

    // When allowAsProp is true, include children support even for void tags
    // because the user might use `as="textarea"` which requires children
    const includeChildrenOuter = allowAsProp || !isVoidTag;
    const patternProps = emitter.buildDestructurePatternProps({
      baseProps: [
        ...(allowAsProp ? [asDestructureProp(tagName)] : []),
        ...(allowClassNameProp ? [ctx.patternProp("className", classNameId)] : []),
        ...(includeChildrenOuter ? [ctx.patternProp("children", childrenId)] : []),
        ...(allowStyleProp ? [ctx.patternProp("style", styleId)] : []),
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
    // - Either: local usage of unknown prefix props, OR exported component (external callers may pass unknown prefix props)
    // - Rest spread is included
    const needsCleanupLoopOuter =
      dropPrefix && (isExportedComponent || shouldAllowAnyPrefixProps) && includeRest;
    const cleanupPrefixStmt = needsCleanupLoopOuter
      ? buildPrefixCleanupStatements(j, restId, dropPrefix)
      : null;

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

    // Build attrs: {...rest} then {...mergedStylexProps(...)} so stylex styles override
    const openingAttrs: JsxAttr[] = [];
    if (includeRest) {
      openingAttrs.push(j.jsxSpreadAttribute(restId));
    }
    emitter.appendMergingAttrs(openingAttrs, merging);

    const jsx = emitter.buildJsxElement({
      tagName: allowAsProp ? "Component" : tagName,
      attrs: openingAttrs,
      includeChildren: includeChildrenOuter,
      childrenExpr: childrenId,
    });

    const fnBodyStmts: StatementKind[] = [declStmt];
    if (d.needsThemeHook) {
      fnBodyStmts.push(emitter.buildThemeHookStatement(themeHookName));
    }
    if (cleanupPrefixStmt) {
      fnBodyStmts.push(...cleanupPrefixStmt);
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
            allowAsProp && emitTypes
              ? j(`function _<C extends React.ElementType = "${tagName}">() { return null }`).get()
                  .node.program.body[0].typeParameters
              : undefined,
        }),
        d,
      ),
    );
  }
}
