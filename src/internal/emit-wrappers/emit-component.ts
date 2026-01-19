import { emitStyleMerging, type StyleMergerConfig } from "./style-merger.js";

export function emitComponentWrappers(ctx: any): { emitted: any[]; needsReactTypeImport: boolean } {
  const {
    root,
    j,
    emitTypes,
    wrapperDecls,
    wrapperNames,
    stylesIdentifier,
    shouldAllowClassNameProp,
    shouldAllowStyleProp,
    stringifyTsType,
    typeExistsInFile,
    extendExistingInterface,
    extendExistingTypeAlias,
    getExplicitPropNames,
    inferredComponentWrapperPropsTypeText,
    getAttrsAsString,
    TAG_TO_HTML_ELEMENT,
    injectRefPropIntoTypeLiteralString,
    joinIntersection,
    emitNamedPropsType,
    parseVariantWhenToAst,
    isPropRequiredInPropsTypeLiteral,
    hasJsxChildrenUsage,
    annotatePropsParam,
    patternProp,
    propsTypeNameFor,
    styleMerger,
  } = ctx as { styleMerger: StyleMergerConfig | null } & Record<string, any>;

  const emitted: any[] = [];
  let needsReactTypeImport = false;

  const collectInlineStylePropNames = (
    inlineStyleProps: Array<{ prop: string; expr: any }>,
  ): string[] => {
    const names = new Set<string>();
    const visit = (node: any, parent: any): void => {
      if (!node || typeof node !== "object") {
        return;
      }
      if (Array.isArray(node)) {
        for (const child of node) {
          visit(child, parent);
        }
        return;
      }
      if (node.type === "Identifier") {
        const isMemberProp =
          parent &&
          (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
          parent.property === node &&
          parent.computed === false;
        const isObjectKey =
          parent && parent.type === "Property" && parent.key === node && parent.shorthand !== true;
        if (!isMemberProp && !isObjectKey && node.name?.startsWith("$")) {
          names.add(node.name);
        }
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          visit(child, node);
        }
      }
    };
    for (const p of inlineStyleProps) {
      visit(p.expr, undefined);
    }
    return [...names];
  };

  // Component wrappers (styled(Component)) - these wrap another component
  const componentWrappers = wrapperDecls.filter((d: any) => d.base.kind === "component");

  for (const d of componentWrappers) {
    if (d.base.kind !== "component") {
      continue;
    }
    const wrappedComponent = d.base.ident;
    const wrappedComponentHasAs = wrapperNames.has(wrappedComponent);
    const isPolymorphicComponentWrapper = wrapperNames.has(d.localName) && !wrappedComponentHasAs;
    const allowClassNameProp = shouldAllowClassNameProp(d);
    const allowStyleProp = shouldAllowStyleProp(d);
    const propsIdForExpr = j.identifier("props");
    // Track which type name to use for the function parameter
    let functionParamTypeName: string | null = null;
    {
      const explicit = stringifyTsType(d.propsType);

      // Check if explicit type is a simple type reference (e.g., `TypeAliasProps`)
      // that exists in the file - if so, extend it directly instead of creating a new type
      const isSimpleTypeRef =
        d.propsType?.type === "TSTypeReference" && d.propsType?.typeName?.type === "Identifier";
      const explicitTypeName = isSimpleTypeRef ? d.propsType?.typeName?.name : null;
      const explicitTypeExists = explicitTypeName && typeExistsInFile(explicitTypeName);

      if (explicitTypeExists && explicit && explicitTypeName) {
        const baseTypeText = (() => {
          const base = `React.ComponentProps<typeof ${wrappedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          return omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        })();
        // Extend the existing type in-place so the wrapper can reuse it.
        const interfaceExtended = extendExistingInterface(explicitTypeName, baseTypeText);
        if (!interfaceExtended) {
          extendExistingTypeAlias(explicitTypeName, baseTypeText);
        }
        functionParamTypeName = explicitTypeName;
      } else {
        // Extract prop names from explicit type to avoid duplicating them in inferred type
        const explicitPropNames = d.propsType
          ? getExplicitPropNames(d.propsType)
          : new Set<string>();

        if (isPolymorphicComponentWrapper) {
          const baseProps = `React.ComponentProps<typeof ${wrappedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const baseMaybeOmitted = omitted.length
            ? `Omit<${baseProps}, ${omitted.join(" | ")}>`
            : baseProps;
          const typeText = joinIntersection(baseMaybeOmitted, "{ as?: C }");
          emitNamedPropsType(
            d.localName,
            typeText,
            `C extends React.ElementType = typeof ${wrappedComponent}`,
          );
        } else {
          const inferred = inferredComponentWrapperPropsTypeText({
            d,
            allowClassNameProp,
            allowStyleProp,
            includeAsProp: false,
            skipProps: explicitPropNames,
          });
          // Add ref support when .attrs({ as: "element" }) is used
          const attrsAs = getAttrsAsString(d);
          const refElementType = attrsAs ? TAG_TO_HTML_ELEMENT[attrsAs] : undefined;
          const explicitWithRef =
            refElementType && explicit
              ? injectRefPropIntoTypeLiteralString(explicit, refElementType)
              : (explicit ?? (refElementType ? `{ ref?: React.Ref<${refElementType}>; }` : null));
          // NOTE: `inferred` already includes `React.ComponentProps<typeof WrappedComponent>`,
          // which carries `children` when the wrapped component accepts them. Wrapping the
          // explicit extra props in `PropsWithChildren` is redundant and can cause extra churn.
          const typeText = explicitWithRef ? joinIntersection(inferred, explicitWithRef) : inferred;
          emitNamedPropsType(d.localName, typeText);
        }
      }
      needsReactTypeImport = true;
    }
    // For component wrappers, don't include extendsStyleKey because
    // the wrapped component already applies its own styles.
    const styleArgs: any[] = [
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Track props that need to be destructured for conditional styles
    const destructureProps: string[] = [];

    // Add variant style arguments if this component has variants
    if (d.variantStyleKeys) {
      for (const [when, variantKey] of Object.entries(d.variantStyleKeys)) {
        const { cond, props } = parseVariantWhenToAst(j, when);
        for (const p of props) {
          if (p && !destructureProps.includes(p)) {
            destructureProps.push(p);
          }
        }

        styleArgs.push(
          j.logicalExpression(
            "&&",
            cond,
            j.memberExpression(j.identifier(stylesIdentifier), j.identifier(variantKey)),
          ),
        );
      }
    }

    for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
      if (!destructureProps.includes(prop)) {
        destructureProps.push(prop);
      }
    }

    // Add style function calls for dynamic prop-based styles
    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      const propExpr = j.memberExpression(propsIdForExpr, j.identifier(p.jsxProp));
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [propExpr as any],
      );
      const required = isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        styleArgs.push(
          j.logicalExpression(
            "&&",
            j.binaryExpression("!=", propExpr as any, j.nullLiteral()),
            call,
          ),
        );
      }
    }

    // For component wrappers, filter out transient props ($-prefixed) that are NOT used in styling.
    // In styled-components, transient props are automatically filtered before passing to wrapped component.
    // We need to mimic this behavior by destructuring them out when not used for conditional styles.
    // Track which transient props are for filtering only (not used in styling) so we don't pass them back.
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

      // Add transient props to destructureProps if not already used for styling
      for (const prop of transientProps) {
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
        `const x: ${propsTypeNameFor(d.localName)}<C> = null`,
      ).get().node.program.body[0].declarations[0].id.typeAnnotation;
    }
    // If we extended an existing type directly, use that type name for the parameter.
    if (!isPolymorphicComponentWrapper && functionParamTypeName && emitTypes) {
      propsParamId.typeAnnotation = j.tsTypeAnnotation(
        j.tsTypeReference(j.identifier(functionParamTypeName)),
      );
    } else if (!isPolymorphicComponentWrapper) {
      annotatePropsParam(propsParamId, d.localName);
    }
    const propsId = j.identifier("props");
    const stylexPropsCall = j.callExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("props")),
      styleArgs,
    );

    // Handle both simple identifiers (Button) and member expressions (animated.div)
    let jsxTagName: any;
    if (wrappedComponent.includes(".")) {
      const parts = wrappedComponent.split(".");
      jsxTagName = j.jsxMemberExpression(
        j.jsxIdentifier(parts[0]!),
        j.jsxIdentifier(parts.slice(1).join(".")),
      );
    } else {
      jsxTagName = j.jsxIdentifier(wrappedComponent);
    }

    const defaultAttrs = d.attrsInfo?.defaultAttrs ?? [];
    const staticAttrs = d.attrsInfo?.staticAttrs ?? {};
    const needsSxVar = allowClassNameProp || allowStyleProp || !!d.inlineStyleProps?.length;
    // Only destructure when we have specific reasons: variant props or className/style support
    // Children flows through naturally via {...props} spread, no explicit handling needed
    // Attrs are handled separately (added as JSX attributes before/after the props spread)
    const needsDestructure = destructureProps.length > 0 || needsSxVar;
    const includeChildren = hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const restId = j.identifier("rest");

      const patternProps: any[] = [
        ...(allowClassNameProp ? [patternProp("className", classNameId)] : []),
        ...(includeChildren ? [patternProp("children", childrenId)] : []),
        ...(allowStyleProp ? [patternProp("style", styleId)] : []),
        // Strip transient props ($-prefixed) from the pass-through spread (styled-components behavior)
        ...destructureProps.filter(Boolean).map((name: any) => patternProp(name)),
        j.restElement(restId),
      ];

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps as any), propsId),
      ]);

      // Use the style merger helper
      const merging = emitStyleMerging({
        j,
        styleMerger,
        styleArgs,
        classNameId,
        styleId,
        allowClassNameProp,
        allowStyleProp,
        inlineStyleProps: d.inlineStyleProps ?? [],
      });

      const stmts: any[] = [declStmt];
      if (merging.sxDecl) {
        stmts.push(merging.sxDecl);
      }

      const openingAttrs: any[] = [];
      // Add attrs in order: defaultAttrs, staticAttrs, then {...rest}
      // This allows props passed to the component to override attrs (styled-components semantics)
      for (const a of defaultAttrs) {
        if (typeof a.value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value)));
        } else if (typeof a.value === "number") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.literal(a.value)),
            ),
          );
        } else if (typeof a.value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.booleanLiteral(a.value)),
            ),
          );
        }
      }
      // Add staticAttrs from .attrs({...}) before {...rest} so they can be overridden
      for (const [key, value] of Object.entries(staticAttrs)) {
        if (typeof value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "number") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        } else if (typeof value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.booleanLiteral(value))),
          );
        }
      }
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
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(propName),
              j.jsxExpressionContainer(j.identifier(propName)),
            ),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(restId));
      openingAttrs.push(j.jsxSpreadAttribute(merging.jsxSpreadExpr));

      if (merging.classNameAttr) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier("className"),
            j.jsxExpressionContainer(merging.classNameAttr),
          ),
        );
      }

      if (merging.styleAttr) {
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("style"), j.jsxExpressionContainer(merging.styleAttr)),
        );
      }

      const openingEl = j.jsxOpeningElement(jsxTagName, openingAttrs, !includeChildren);
      const jsx = includeChildren
        ? j.jsxElement(openingEl, j.jsxClosingElement(jsxTagName), [
            j.jsxExpressionContainer(childrenId),
          ])
        : ({
            type: "JSXElement",
            openingElement: openingEl,
            closingElement: null,
            children: [],
          } as any);
      stmts.push(j.returnStatement(jsx as any));

      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement(stmts),
      );
      if (polymorphicFnTypeParams) {
        (fn as any).typeParameters = polymorphicFnTypeParams;
      }
      emitted.push(fn);
    } else {
      // Simple case: always forward props + styles.
      const openingAttrs: any[] = [];
      for (const a of defaultAttrs) {
        if (typeof a.value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(a.attrName), j.literal(a.value)));
        } else if (typeof a.value === "number") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.literal(a.value)),
            ),
          );
        } else if (typeof a.value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(
              j.jsxIdentifier(a.attrName),
              j.jsxExpressionContainer(j.booleanLiteral(a.value)),
            ),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(propsId));
      for (const [key, value] of Object.entries(staticAttrs)) {
        if (typeof value === "string") {
          openingAttrs.push(j.jsxAttribute(j.jsxIdentifier(key), j.literal(value)));
        } else if (typeof value === "number") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.literal(value))),
          );
        } else if (typeof value === "boolean") {
          openingAttrs.push(
            j.jsxAttribute(j.jsxIdentifier(key), j.jsxExpressionContainer(j.booleanLiteral(value))),
          );
        }
      }
      openingAttrs.push(j.jsxSpreadAttribute(stylexPropsCall));

      const jsx = j.jsxElement(j.jsxOpeningElement(jsxTagName, openingAttrs, true), null, []);
      const fn = j.functionDeclaration(
        j.identifier(d.localName),
        [propsParamId],
        j.blockStatement([j.returnStatement(jsx as any)]),
      );
      if (polymorphicFnTypeParams) {
        (fn as any).typeParameters = polymorphicFnTypeParams;
      }
      emitted.push(fn);
    }
  }

  return { emitted, needsReactTypeImport };
}
