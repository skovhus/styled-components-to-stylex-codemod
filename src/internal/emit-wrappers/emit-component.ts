/**
 * Emits wrapper components for non-intrinsic styled declarations.
 * Core concepts: prop mapping, style merging, and JSX construction.
 */
import type { ASTNode, Property } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { emitStyleMerging } from "./style-merger.js";
import { withLeadingComments } from "./comments.js";
import {
  collectInlineStylePropNames,
  type ExpressionKind,
  type InlineStyleProp,
  type WrapperPropDefaults,
} from "./types.js";
import type { JsxAttr, JsxTagName, StatementKind, WrapperEmitter } from "./wrapper-emitter.js";
import { appendPseudoAliasStyleArgs } from "./emit-intrinsic-simple.js";
import {
  getAttrsAsString,
  injectRefPropIntoTypeLiteralString,
  injectStylePropsIntoTypeLiteralString,
  sortVariantEntriesBySpecificity,
  TAG_TO_HTML_ELEMENT,
} from "./type-helpers.js";
import {
  getDeclaratorId,
  isFunctionNode,
  isIdentifierNode,
} from "../utilities/jscodeshift-utils.js";

export function emitComponentWrappers(emitter: WrapperEmitter): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
  const root = emitter.root;
  const j = emitter.j;
  const emitTypes = emitter.emitTypes;
  const wrapperDecls = emitter.wrapperDecls;
  const wrapperNames = emitter.wrapperNames;
  const stylesIdentifier = emitter.stylesIdentifier;
  const patternProp = emitter.patternProp;
  // Use emitter methods directly throughout this file to avoid threading helper lambdas.

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  const emitNamedPropsType = (localName: string, typeExprText: string, genericParams?: string) =>
    emitter.emitNamedPropsType({ localName, typeExprText, genericParams, emitted });

  const findComponentPropsType = (componentName: string): ASTNode | null => {
    const firstParamType = (node: unknown): ASTNode | null => {
      if (!node || typeof node !== "object") {
        return null;
      }
      const params = (node as { params?: unknown }).params;
      if (!Array.isArray(params) || params.length === 0) {
        return null;
      }
      const param = params[0];
      if (!param || typeof param !== "object") {
        return null;
      }
      const typeAnnotation = (
        param as {
          typeAnnotation?: { typeAnnotation?: ASTNode | null } | null;
        }
      ).typeAnnotation;
      return typeAnnotation?.typeAnnotation ?? null;
    };
    const funcDecl = root
      .find(j.FunctionDeclaration)
      .filter((p) => isIdentifierNode(p.node.id) && p.node.id.name === componentName);
    if (funcDecl.size() > 0) {
      const typeNode = firstParamType(funcDecl.get().node);
      if (typeNode) {
        return typeNode;
      }
    }
    const varDecl = root.find(j.VariableDeclarator).filter((p) => {
      const id = getDeclaratorId(p.node);
      return isIdentifierNode(id) && id.name === componentName;
    });
    if (varDecl.size() > 0) {
      const init = (varDecl.get().node as { init?: unknown }).init;
      if (isFunctionNode(init)) {
        return firstParamType(init);
      }
    }
    return null;
  };

  // Helper to check if a locally-defined component's props include a specific prop.
  // This is used to avoid adding className/style when the wrapped component already has them.
  // Uses findComponentPropsType (which returns null for imported components) and
  // emitter.getExplicitPropNames (which extracts prop names from type literals, interfaces,
  // and type aliases, including through intersections).
  const localComponentHasProp = (componentName: string, propName: string): boolean => {
    const propsType = findComponentPropsType(componentName);
    if (!propsType) {
      // Component is not defined locally or has no typed props - assume it doesn't have the prop
      return false;
    }
    const explicitProps = emitter.getExplicitPropNames(propsType);
    return explicitProps.has(propName);
  };

  // Component wrappers (styled(Component)) - these wrap another component
  const componentWrappers = wrapperDecls.filter((d: StyledDecl) => d.base.kind === "component");

  for (const d of componentWrappers) {
    if (d.base.kind !== "component") {
      continue;
    }
    const wrappedComponent = d.base.ident;
    // When .attrs({ as: ComponentRef }) is present, render and type against that component
    const renderedComponent = d.attrsInfo?.attrsAsTag ?? wrappedComponent;
    const baseComponentPropsType = findComponentPropsType(wrappedComponent);
    const wrappedComponentHasAs = wrapperNames.has(wrappedComponent);
    const supportsAsProp = d.supportsAsProp ?? false;
    const shouldAllowAsProp = wrapperNames.has(d.localName) || supportsAsProp;
    const isPolymorphicComponentWrapper = shouldAllowAsProp && !wrappedComponentHasAs;
    const allowClassNameProp = emitter.shouldAllowClassNameProp(d);
    const allowStyleProp = emitter.shouldAllowStyleProp(d);
    const hasForwardedAsUsage = emitter.hasForwardedAsUsage(d.localName);
    const shouldLowerForwardedAs = hasForwardedAsUsage && !wrappedComponentHasAs;
    const propsIdForExpr = j.identifier("props");
    // Track which type name to use for the function parameter
    let functionParamTypeName: string | null = null;
    // Track inline type text for when we skip emitting a named type (no custom props)
    let inlineTypeText: string | undefined;
    {
      const explicit = emitter.stringifyTsType(d.propsType);

      // Check if explicit type is a simple type reference (e.g., `TypeAliasProps`)
      // that exists in the file - if so, extend it directly instead of creating a new type
      const propsType = d.propsType as
        | (ASTNode & { type?: string; typeName?: { type?: string; name?: string } })
        | undefined;
      const isSimpleTypeRef =
        propsType?.type === "TSTypeReference" && propsType?.typeName?.type === "Identifier";
      const explicitTypeName = isSimpleTypeRef ? (propsType?.typeName?.name ?? null) : null;
      const explicitTypeExists = explicitTypeName && emitter.typeExistsInFile(explicitTypeName);

      if (explicitTypeExists && explicit && explicitTypeName && !isPolymorphicComponentWrapper) {
        const baseTypeText = (() => {
          const base = `React.ComponentPropsWithRef<typeof ${renderedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
          return hasForwardedAsUsage
            ? emitter.joinIntersection(baseWithOmit, "{ forwardedAs?: React.ElementType }")
            : baseWithOmit;
        })();
        // Extend the existing type in-place so the wrapper can reuse it.
        const interfaceExtended = emitter.extendExistingInterface(explicitTypeName, baseTypeText);
        if (!interfaceExtended) {
          emitter.extendExistingTypeAlias(explicitTypeName, baseTypeText);
        }
        functionParamTypeName = explicitTypeName;
      } else {
        if (isPolymorphicComponentWrapper) {
          const baseProps = `React.ComponentPropsWithRef<typeof ${renderedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const typeText = [
            baseProps,
            `Omit<React.ComponentPropsWithRef<C>, keyof ${baseProps} | "className" | "style">`,
            "{\n  as?: C;\n}",
            ...(hasForwardedAsUsage ? ["{ forwardedAs?: React.ElementType }"] : []),
            // Include user's explicit props type if it exists
            ...(explicit ? [explicit] : []),
          ].join(" & ");
          emitNamedPropsType(
            d.localName,
            typeText,
            `C extends React.ElementType = typeof ${wrappedComponent}`,
          );
        } else {
          // Check if the wrapped component is one of our styled component wrappers.
          // If so, it already has className/style in its props and we don't need to add them.
          const wrappedComponentIsStyledWrapper = wrapperDecls.some(
            (decl) => decl.localName === wrappedComponent,
          );
          // Check if the wrapped component is a local React component that already has className/style.
          // This avoids adding redundant props for components that already accept them.
          const wrappedHasClassName = localComponentHasProp(wrappedComponent, "className");
          const wrappedHasStyle = localComponentHasProp(wrappedComponent, "style");
          const skipStyleProps =
            wrappedComponentIsStyledWrapper || (wrappedHasClassName && wrappedHasStyle);
          const hasExplicitPropsType = !!explicit;
          const inferred = emitter.inferredComponentWrapperPropsTypeText({
            d,
            allowClassNameProp,
            allowStyleProp,
            wrappedComponentIsInternalWrapper: skipStyleProps,
            hasExplicitPropsType,
          });
          // Add ref support when .attrs({ as: "element" }) is used
          const attrsAs = getAttrsAsString(d);
          const refElementType = attrsAs ? TAG_TO_HTML_ELEMENT[attrsAs] : undefined;
          // Build explicit props type with ref and className/style injected
          let explicitWithExtras = explicit;
          if (explicitWithExtras && refElementType) {
            explicitWithExtras = injectRefPropIntoTypeLiteralString(
              explicitWithExtras,
              refElementType,
            );
          }
          // Inject className/style into explicit props when external styles are explicitly enabled
          // via adapter (d.supportsExternalStyles) and the wrapped component doesn't already have them
          if (explicitWithExtras && d.supportsExternalStyles && !skipStyleProps) {
            explicitWithExtras = injectStylePropsIntoTypeLiteralString(explicitWithExtras, {
              className: allowClassNameProp && !wrappedHasClassName,
              style: allowStyleProp && !wrappedHasStyle,
            });
          }
          const explicitWithRef =
            explicitWithExtras ??
            (refElementType ? `{ ref?: React.Ref<${refElementType}>; }` : null);
          // NOTE: `inferred` already includes `React.ComponentProps<typeof WrappedComponent>`,
          // which carries `children` when the wrapped component accepts them. Wrapping the
          // explicit extra props in `PropsWithChildren` is redundant and can cause extra churn.
          const typeText = explicitWithRef
            ? emitter.joinIntersection(inferred, explicitWithRef)
            : inferred;
          // When there are no custom props, skip emitting named type and use inline type instead
          const hasNoCustomProps = !explicitWithRef;
          if (hasNoCustomProps) {
            inlineTypeText = typeText;
          } else {
            emitNamedPropsType(d.localName, typeText);
          }
        }
      }
      needsReactTypeImport = true;
    }
    // For component wrappers, don't include extendsStyleKey because
    // the wrapped component already applies its own styles.
    const { beforeBase: extraStyleArgs, afterBase: extraStyleArgsAfterBase } =
      emitter.splitExtraStyleArgs(d);
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
      ...extraStyleArgsAfterBase,
    ];

    // Track props that need to be destructured for conditional styles
    const destructureProps: string[] = [];
    // Track default values for props (used for destructuring defaults on optional props)
    const propDefaults: WrapperPropDefaults = new Map();
    // Track namespace boolean props (like 'disabled') that need to be passed to wrapped component
    const namespaceBooleanProps: string[] = [];

    // Add variant style arguments if this component has variants
    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      for (const [when, variantKey] of sortedEntries) {
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
        namespaceBooleanProps,
      });
    }

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      styleArgs.push(
        ...emitter.buildExtraStylexPropsExprs({
          entries: d.extraStylexPropsArgs,
          destructureProps,
          propDefaults,
        }),
      );
    }

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
      propExprBuilder: (prop) => j.memberExpression(propsIdForExpr, j.identifier(prop)),
      propsIdentifier: propsIdForExpr,
    });

    // For component wrappers, filter out transient props ($-prefixed) that are NOT used in styling.
    // In styled-components, transient props are automatically filtered before passing to wrapped component.
    // We need to mimic this behavior by destructuring them out when not used for conditional styles.
    // Track which transient props are for filtering only (not used in styling).
    // These are transient props that we should strip before forwarding.
    const filterOnlyTransientProps: string[] = [];
    // Track transient props that are defined in the WRAPPER's explicit type (not the base's).
    // These should NOT be passed back to the base component because the base doesn't accept them.
    const wrapperOnlyTransientProps: string[] = [];
    {
      // Helper to find transient props in a type name
      const findTransientPropsInTypeName = (typeName: string): string[] => {
        const props: string[] = [];
        const collectFromTypeNode = (typeNode: any) => {
          if (!typeNode) {
            return;
          }
          if (typeNode.type === "TSParenthesizedType") {
            collectFromTypeNode(typeNode.typeAnnotation);
            return;
          }
          if (typeNode.type === "TSIntersectionType") {
            for (const t of typeNode.types ?? []) {
              collectFromTypeNode(t);
            }
            return;
          }
          if (typeNode.type === "TSTypeLiteral" && typeNode.members) {
            for (const member of typeNode.members) {
              if (
                member.type === "TSPropertySignature" &&
                member.key?.type === "Identifier" &&
                member.key.name.startsWith("$")
              ) {
                props.push(member.key.name);
              }
            }
          }
        };
        // Look up the interface
        const interfaceDecl = root
          .find(j.TSInterfaceDeclaration)
          .filter((p: any) => (p.node as any).id?.name === typeName);
        if (interfaceDecl.size() > 0) {
          const body = interfaceDecl.get().node.body?.body ?? [];
          for (const member of body) {
            if (
              member.type === "TSPropertySignature" &&
              member.key?.type === "Identifier" &&
              member.key.name.startsWith("$")
            ) {
              props.push(member.key.name);
            }
          }
        }
        // Look up the type alias
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p: any) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          const typeAnnotation = typeAlias.get().node.typeAnnotation;
          collectFromTypeNode(typeAnnotation);
        }
        return props;
      };

      // Find all transient props in the explicit props type
      const explicit = d.propsType;
      let transientProps: string[] = [];

      // Check if explicit type is a type literal with members
      if (explicit?.type === "TSTypeLiteral" && explicit.members) {
        for (const member of explicit.members) {
          if (
            member.type === "TSPropertySignature" &&
            member.key?.type === "Identifier" &&
            member.key.name.startsWith("$")
          ) {
            transientProps.push(member.key.name);
            // This is a wrapper-only transient prop (defined in wrapper's explicit type)
            wrapperOnlyTransientProps.push(member.key.name);
          }
        }
      }
      // Check if explicit type is a reference to an interface/type alias
      else if (explicit?.type === "TSTypeReference" && explicit.typeName?.type === "Identifier") {
        const typeName = explicit.typeName.name;
        transientProps = findTransientPropsInTypeName(typeName);
        // These are also wrapper-only transient props
        wrapperOnlyTransientProps.push(...transientProps);
      }

      // Also check the wrapped component's props type for transient props
      // This handles styled(Component) without explicit type annotation
      if (transientProps.length === 0) {
        // Look for the wrapped component's function declaration and its param type
        const funcDecls = root
          .find(j.FunctionDeclaration)
          .filter((p: any) => (p.node as any).id?.name === wrappedComponent);
        if (funcDecls.size() > 0) {
          const param = funcDecls.get().node.params[0] as any;
          if (param?.typeAnnotation?.typeAnnotation?.typeName?.type === "Identifier") {
            const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
            transientProps = findTransientPropsInTypeName(typeName);
          }
        }
        // Also check variable declarators with arrow functions
        const varDecls = root
          .find(j.VariableDeclarator)
          .filter((p: any) => (p.node as any).id?.name === wrappedComponent);
        if (varDecls.size() > 0) {
          const init = varDecls.get().node.init;
          if (init?.type === "ArrowFunctionExpression" && init.params[0]) {
            const param = init.params[0] as any;
            if (param?.typeAnnotation?.typeAnnotation?.typeName?.type === "Identifier") {
              const typeName = param.typeAnnotation.typeAnnotation.typeName.name;
              transientProps = findTransientPropsInTypeName(typeName);
            }
          }
        }
      }

      // Add wrapper-only transient props to destructureProps to filter them out.
      for (const prop of wrapperOnlyTransientProps) {
        if (!destructureProps.includes(prop)) {
          destructureProps.push(prop);
          // Track that this prop is for filtering only, not for styling
          filterOnlyTransientProps.push(prop);
        }
      }
    }

    const propsParamId = j.identifier("props");
    let polymorphicFnTypeParams: any = null;
    if (isPolymorphicComponentWrapper && emitTypes) {
      polymorphicFnTypeParams = j(
        `function _<C extends React.ElementType = typeof ${wrappedComponent}>() { return null }`,
      ).get().node.program.body[0].typeParameters;
      (propsParamId as any).typeAnnotation = j(
        `const x: ${emitter.propsTypeNameFor(d.localName)}<C> = null`,
      ).get().node.program.body[0].declarations[0].id.typeAnnotation;
    }
    // If we extended an existing type directly, use that type name for the parameter.
    if (!isPolymorphicComponentWrapper && functionParamTypeName && emitTypes) {
      propsParamId.typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(functionParamTypeName)),
      );
    } else if (!isPolymorphicComponentWrapper) {
      // When there are no custom props, use inline type instead of named type
      emitter.annotatePropsParam(propsParamId, d.localName, inlineTypeText);
    }
    const propsId = j.identifier("props");
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );

    const buildWrappedComponentExpr = (): ExpressionKind => {
      if (!wrappedComponent.includes(".")) {
        return j.identifier(wrappedComponent);
      }
      const parts = wrappedComponent.split(".");
      const firstPart = parts[0];
      if (!firstPart) {
        return j.identifier(wrappedComponent);
      }
      return parts
        .slice(1)
        .reduce<ExpressionKind>(
          (expr, part) => j.memberExpression(expr, j.identifier(part)),
          j.identifier(firstPart),
        );
    };

    // Handle both simple identifiers (Button) and member expressions (animated.div)
    let jsxTagName: JsxTagName;
    if (isPolymorphicComponentWrapper) {
      jsxTagName = j.jsxIdentifier("Component");
    } else if (renderedComponent.includes(".")) {
      const parts = renderedComponent.split(".");
      const firstPart = parts[0];
      if (!firstPart) {
        jsxTagName = j.jsxIdentifier(renderedComponent);
      } else {
        jsxTagName = j.jsxMemberExpression(
          j.jsxIdentifier(firstPart),
          j.jsxIdentifier(parts.slice(1).join(".")),
        );
      }
    } else {
      jsxTagName = j.jsxIdentifier(renderedComponent);
    }

    const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(d.attrsInfo);
    const defaultAttrs = attrsInfo?.defaultAttrs ?? [];
    const staticAttrs = attrsInfo?.staticAttrs ?? {};
    const needsSxVar =
      allowClassNameProp || allowStyleProp || !!d.inlineStyleProps?.length || !!staticClassNameExpr;
    // Only destructure when we have specific reasons: variant props or className/style support
    // Children flows through naturally via {...props} spread, no explicit handling needed
    // Attrs are handled separately (added as JSX attributes before/after the props spread)
    // Also need to destructure when defaultAttrs exist, to properly handle nullish coalescing
    const needsDestructure =
      destructureProps.length > 0 ||
      needsSxVar ||
      isPolymorphicComponentWrapper ||
      defaultAttrs.length > 0 ||
      shouldLowerForwardedAs;
    const includeChildren =
      !isPolymorphicComponentWrapper && emitter.hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const restId = j.identifier("rest");
      const componentId = j.identifier("Component");
      const forwardedAsId = j.identifier("forwardedAs");
      const wrappedComponentExpr = buildWrappedComponentExpr();

      // Add defaultAttrs props to destructureProps for nullish coalescing patterns
      // (e.g., tabIndex: props.tabIndex ?? 0 needs tabIndex destructured)
      for (const attr of defaultAttrs) {
        if (!destructureProps.includes(attr.jsxProp)) {
          destructureProps.push(attr.jsxProp);
        }
      }

      const patternProps = emitter.buildDestructurePatternProps({
        baseProps: [
          ...(isPolymorphicComponentWrapper
            ? [
                j.property(
                  "init",
                  j.identifier("as"),
                  j.assignmentPattern(componentId, wrappedComponentExpr),
                ) as Property,
              ]
            : []),
          ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
          ...(includeChildren ? [patternProp("children", childrenId)] : []),
          ...(allowStyleProp ? [patternProp("style", styleId)] : []),
          ...(shouldLowerForwardedAs ? [patternProp("forwardedAs", forwardedAsId)] : []),
        ],
        destructureProps,
        propDefaults,
        includeRest: true,
        restId,
      });

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps), propsId),
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
        staticClassNameExpr,
      });

      const stmts: StatementKind[] = [declStmt];
      if (merging.sxDecl) {
        stmts.push(merging.sxDecl);
      }

      const openingAttrs: JsxAttr[] = [];
      const hasStaticForwardedAsFallback =
        shouldLowerForwardedAs && Object.hasOwn(staticAttrs, "as");
      const staticForwardedAsFallback = hasStaticForwardedAsFallback ? staticAttrs.as : undefined;
      const staticAttrsWithoutForwardedAsFallback = (() => {
        if (!hasStaticForwardedAsFallback) {
          return staticAttrs;
        }
        const { as: _omitAs, ...restStaticAttrs } = staticAttrs;
        return restStaticAttrs;
      })();
      // Add attrs in order: defaultAttrs, staticAttrs, then {...rest}
      // This allows props passed to the component to override attrs (styled-components semantics)
      // Use buildDefaultAttrsFromProps to preserve nullish coalescing (e.g., tabIndex ?? 0)
      openingAttrs.push(
        ...emitter.buildDefaultAttrsFromProps({
          defaultAttrs,
          propExprFor: (prop) => j.identifier(prop),
        }),
      );
      // Add staticAttrs from .attrs({...}) before {...rest} so they can be overridden
      openingAttrs.push(
        ...emitter.buildStaticAttrsFromRecord(staticAttrsWithoutForwardedAsFallback, {
          booleanTrueAsShorthand: false,
        }),
      );
      const forwardedProps = new Set<string>();
      const pushForwardedProp = (propName: string) => {
        if (forwardedProps.has(propName)) {
          return;
        }
        forwardedProps.add(propName);
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(propName),
            j.jsxExpressionContainer(j.identifier(propName)),
          ),
        );
      };

      // Pass transient props used for styling back to the base component.
      // These props were destructured for styling but the base component might also need them.
      // Filter out:
      // 1. Props that are for filtering only (not used in styling)
      // 2. Props defined in the wrapper's explicit type (base doesn't accept them)
      for (const propName of destructureProps) {
        if (
          propName.startsWith("$") &&
          !filterOnlyTransientProps.includes(propName) &&
          !wrapperOnlyTransientProps.includes(propName)
        ) {
          pushForwardedProp(propName);
        }
      }
      // Forward required base-component props that were destructured for styling.
      for (const propName of destructureProps) {
        if (
          propName &&
          propName !== "children" &&
          !propName.startsWith("$") &&
          baseComponentPropsType &&
          emitter.isPropRequiredInPropsTypeLiteral(baseComponentPropsType, propName)
        ) {
          pushForwardedProp(propName);
        }
      }
      // Re-forward non-transient defaultAttrs props when jsxProp !== attrName.
      // In styled-components, normal props are passed through unless transient ($-prefixed).
      // E.g., { tabIndex: props.focusIndex ?? 0 } should still forward focusIndex to the wrapped component.
      for (const attr of defaultAttrs) {
        if (attr.jsxProp !== attr.attrName && !attr.jsxProp.startsWith("$")) {
          pushForwardedProp(attr.jsxProp);
        }
      }
      // Pass namespace boolean props (like 'disabled') to the wrapped component.
      // These are destructured for the enabled/disabled styling ternary but also need
      // to be forwarded as they may be valid HTML attributes on the underlying element.
      for (const propName of namespaceBooleanProps) {
        pushForwardedProp(propName);
      }
      openingAttrs.push(j.jsxSpreadAttribute(restId));
      if (shouldLowerForwardedAs) {
        const forwardedAsValueExpr =
          hasStaticForwardedAsFallback &&
          (typeof staticForwardedAsFallback === "string" ||
            typeof staticForwardedAsFallback === "number" ||
            typeof staticForwardedAsFallback === "boolean" ||
            staticForwardedAsFallback === null)
            ? j.logicalExpression("??", forwardedAsId, j.literal(staticForwardedAsFallback))
            : forwardedAsId;
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsValueExpr)),
        );
      }
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: jsxTagName,
        attrs: openingAttrs,
        includeChildren,
        childrenExpr: childrenId,
      });
      stmts.push(j.returnStatement(jsx as any));

      emitted.push(
        withLeadingComments(
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts: stmts,
            typeParameters: polymorphicFnTypeParams,
          }),
          d,
        ),
      );
    } else {
      // Simple case: always forward props + styles.
      const openingAttrs: JsxAttr[] = [];
      openingAttrs.push(...emitter.buildStaticValueAttrs({ attrs: defaultAttrs }));
      openingAttrs.push(j.jsxSpreadAttribute(propsId));
      openingAttrs.push(
        ...emitter.buildStaticAttrsFromRecord(staticAttrs, { booleanTrueAsShorthand: false }),
      );
      openingAttrs.push(j.jsxSpreadAttribute(stylexPropsCall));

      const jsx = emitter.buildJsxElement({
        tagName: jsxTagName,
        attrs: openingAttrs,
        includeChildren: false,
      });
      emitted.push(
        withLeadingComments(
          emitter.buildWrapperFunction({
            localName: d.localName,
            params: [propsParamId],
            bodyStmts: [j.returnStatement(jsx as any)],
            typeParameters: polymorphicFnTypeParams,
          }),
          d,
        ),
      );
    }
  }

  return { emitted, needsReactTypeImport };
}
