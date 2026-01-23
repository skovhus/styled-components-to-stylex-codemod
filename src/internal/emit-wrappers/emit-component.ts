import type { ASTNode, Property, RestElement } from "jscodeshift";
import type { StyledDecl, VariantDimension } from "../transform-types.js";
import { emitStyleMerging, type StyleMergerConfig } from "./style-merger.js";
import { collectInlineStylePropNames, type ExpressionKind, type InlineStyleProp } from "./types.js";
import { TAG_TO_HTML_ELEMENT } from "./type-helpers.js";

export function emitComponentWrappers(ctx: any): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
} {
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
  } = ctx as { styleMerger: StyleMergerConfig | null; wrapperDecls: StyledDecl[] } & Record<
    string,
    any
  >;

  const emitted: ASTNode[] = [];
  let needsReactTypeImport = false;

  // Component wrappers (styled(Component)) - these wrap another component
  const componentWrappers = wrapperDecls.filter((d: StyledDecl) => d.base.kind === "component");

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
      const propsType = d.propsType as
        | (ASTNode & { type?: string; typeName?: { type?: string; name?: string } })
        | undefined;
      const isSimpleTypeRef =
        propsType?.type === "TSTypeReference" && propsType?.typeName?.type === "Identifier";
      const explicitTypeName = isSimpleTypeRef ? (propsType?.typeName?.name ?? null) : null;
      const explicitTypeExists = explicitTypeName && typeExistsInFile(explicitTypeName);

      if (explicitTypeExists && explicit && explicitTypeName) {
        const baseTypeText = (() => {
          const base = `React.ComponentPropsWithRef<typeof ${wrappedComponent}>`;
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
          const baseProps = `React.ComponentPropsWithRef<typeof ${wrappedComponent}>`;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          const typeText = [
            baseProps,
            `Omit<React.ComponentPropsWithoutRef<C>, keyof ${baseProps} | "className" | "style">`,
            "{\n  as?: C;\n}",
          ].join(" & ");
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
    const extraStyleArgs = (d.extraStyleKeys ?? []).map((key) =>
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(key)),
    );
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      j.memberExpression(j.identifier(stylesIdentifier), j.identifier(d.styleKey)),
    ];

    // Track props that need to be destructured for conditional styles
    const destructureProps: string[] = [];
    // Track default values for props (used for destructuring defaults on optional props)
    const propDefaults = new Map<string, string>();
    // Track namespace boolean props (like 'disabled') that need to be passed to wrapped component
    const namespaceBooleanProps: string[] = [];

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

    // Add variant dimension lookups (StyleX variants recipe pattern)
    // Handles both regular dimensions and namespace dimensions (enabled/disabled pairs)
    if (d.variantDimensions) {
      // Group namespace dimensions by their boolean prop and propName
      const namespacePairs = new Map<
        string,
        { enabled?: VariantDimension; disabled?: VariantDimension }
      >();
      const regularDimensions: VariantDimension[] = [];

      for (const dim of d.variantDimensions) {
        if (dim.namespaceBooleanProp) {
          const key = `${dim.namespaceBooleanProp}:${dim.propName}`;
          const pair = namespacePairs.get(key) ?? {};
          if (dim.isDisabledNamespace) {
            pair.disabled = dim;
          } else {
            pair.enabled = dim;
          }
          namespacePairs.set(key, pair);
        } else {
          regularDimensions.push(dim);
        }
      }

      // Process regular (non-namespace) dimensions first
      for (const dim of regularDimensions) {
        if (!destructureProps.includes(dim.propName)) {
          destructureProps.push(dim.propName);
        }
        const variantsId = j.identifier(dim.variantObjectName);
        const propId = j.identifier(dim.propName);

        if (dim.defaultValue === "default") {
          // When defaultValue is "default", use cast + fallback pattern
          const keyofExpr = {
            type: "TSTypeOperator",
            operator: "keyof",
            typeAnnotation: j.tsTypeQuery(j.identifier(dim.variantObjectName)),
          };
          const castProp = j.tsAsExpression(propId, keyofExpr as any);
          const lookup = j.memberExpression(variantsId, castProp, true /* computed */);
          const defaultAccess = j.memberExpression(
            j.identifier(dim.variantObjectName),
            j.identifier("default"),
          );
          styleArgs.push(j.logicalExpression("??", lookup, defaultAccess));
        } else {
          // Simple lookup - all union values are covered in the variant object
          // Track the default for destructuring - only for optional props to ensure type safety
          if (dim.defaultValue && dim.isOptional) {
            propDefaults.set(dim.propName, dim.defaultValue);
          }
          const lookup = j.memberExpression(variantsId, propId, true /* computed */);
          styleArgs.push(lookup);
        }
      }

      // Process namespace dimension pairs - emit ternary: boolProp ? disabledVariants[prop] : enabledVariants[prop]
      for (const [, pair] of namespacePairs) {
        const { enabled, disabled } = pair;
        if (!enabled || !disabled) {
          // Incomplete pair - emit each dimension separately as fallback
          for (const dim of [enabled, disabled].filter(Boolean) as VariantDimension[]) {
            if (!destructureProps.includes(dim.propName)) {
              destructureProps.push(dim.propName);
            }
            const lookup = j.memberExpression(
              j.identifier(dim.variantObjectName),
              j.identifier(dim.propName),
              true,
            );
            styleArgs.push(lookup);
          }
          continue;
        }

        // Add props to destructure list
        if (!destructureProps.includes(enabled.propName)) {
          destructureProps.push(enabled.propName);
        }
        if (!destructureProps.includes(enabled.namespaceBooleanProp!)) {
          destructureProps.push(enabled.namespaceBooleanProp!);
        }

        // Track namespace boolean prop to pass it to the wrapped component
        if (!namespaceBooleanProps.includes(enabled.namespaceBooleanProp!)) {
          namespaceBooleanProps.push(enabled.namespaceBooleanProp!);
        }

        // Track defaults for destructuring - only for optional props to ensure type safety
        if (enabled.defaultValue && enabled.defaultValue !== "default" && enabled.isOptional) {
          propDefaults.set(enabled.propName, enabled.defaultValue);
        }

        // Build: boolProp ? disabledVariants[prop] : enabledVariants[prop]
        const boolPropId = j.identifier(enabled.namespaceBooleanProp!);
        const propId = j.identifier(enabled.propName);

        const enabledLookup = j.memberExpression(
          j.identifier(enabled.variantObjectName),
          propId,
          true,
        );
        const disabledLookup = j.memberExpression(
          j.identifier(disabled.variantObjectName),
          propId,
          true,
        );

        styleArgs.push(j.conditionalExpression(boolPropId, disabledLookup, enabledLookup));
      }
    }

    // Add adapter-resolved StyleX styles (emitted directly into stylex.props args).
    if (d.extraStylexPropsArgs) {
      for (const extra of d.extraStylexPropsArgs) {
        if (extra.when) {
          const { cond, props } = parseVariantWhenToAst(j, extra.when);
          for (const p of props) {
            if (p && !destructureProps.includes(p)) {
              destructureProps.push(p);
            }
          }
          styleArgs.push(j.logicalExpression("&&", cond, extra.expr as any));
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
    const styleFnPairs = d.styleFnFromProps ?? [];
    for (const p of styleFnPairs) {
      if (p.callArg?.type === "Identifier") {
        const name = (p.callArg as any).name as string | undefined;
        if (name && !destructureProps.includes(name)) {
          destructureProps.push(name);
        }
      }
      const propExpr =
        p.jsxProp === "__props"
          ? propsIdForExpr
          : j.memberExpression(propsIdForExpr, j.identifier(p.jsxProp));
      const callArg = p.callArg ? (p.callArg as any) : propExpr;
      const call = j.callExpression(
        j.memberExpression(j.identifier(stylesIdentifier), j.identifier(p.fnKey)),
        [callArg],
      );
      if (p.conditionWhen) {
        const { cond, props } = parseVariantWhenToAst(j, p.conditionWhen);
        for (const prop of props) {
          if (prop && !destructureProps.includes(prop)) {
            destructureProps.push(prop);
          }
        }
        styleArgs.push(j.logicalExpression("&&", cond, call));
        continue;
      }
      if (p.condition === "truthy") {
        const truthy = j.unaryExpression("!", j.unaryExpression("!", propExpr));
        styleArgs.push(j.logicalExpression("&&", truthy, call));
        continue;
      }
      const required =
        p.jsxProp === "__props" || isPropRequiredInPropsTypeLiteral(d.propsType, p.jsxProp);
      if (required) {
        styleArgs.push(call);
      } else {
        styleArgs.push(
          j.logicalExpression("&&", j.binaryExpression("!=", propExpr, j.nullLiteral()), call),
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

    const buildWrappedComponentExpr = (): ExpressionKind => {
      if (!wrappedComponent.includes(".")) {
        return j.identifier(wrappedComponent);
      }
      const parts = wrappedComponent.split(".");
      return parts
        .slice(1)
        .reduce<ExpressionKind>(
          (expr, part) => j.memberExpression(expr, j.identifier(part)),
          j.identifier(parts[0]!),
        );
    };

    // Handle both simple identifiers (Button) and member expressions (animated.div)
    let jsxTagName: any;
    if (isPolymorphicComponentWrapper) {
      jsxTagName = j.jsxIdentifier("Component");
    } else if (wrappedComponent.includes(".")) {
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
    const needsDestructure =
      destructureProps.length > 0 || needsSxVar || isPolymorphicComponentWrapper;
    const includeChildren = !isPolymorphicComponentWrapper && hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const restId = j.identifier("rest");
      const componentId = j.identifier("Component");
      const wrappedComponentExpr = buildWrappedComponentExpr();

      const patternProps: Array<Property | RestElement> = [
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
        // Strip transient props ($-prefixed) from the pass-through spread (styled-components behavior)
        // Add destructuring defaults for optional props to ensure type safety
        ...destructureProps
          .filter((name): name is string => Boolean(name))
          .map((name) => {
            const defaultVal = propDefaults.get(name);
            if (defaultVal) {
              // Create property with default: { name: name = "defaultValue" }
              return j.property.from({
                kind: "init",
                key: j.identifier(name),
                value: j.assignmentPattern(j.identifier(name), j.literal(defaultVal)),
                shorthand: false,
              }) as Property;
            }
            return patternProp(name);
          }),
        j.restElement(restId),
      ];

      const declStmt = j.variableDeclaration("const", [
        j.variableDeclarator(j.objectPattern(patternProps), propsId),
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
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
      });

      const stmts: ASTNode[] = [declStmt];
      if (merging.sxDecl) {
        stmts.push(merging.sxDecl);
      }

      const openingAttrs: ASTNode[] = [];
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
      // Pass namespace boolean props (like 'disabled') to the wrapped component.
      // These are destructured for the enabled/disabled styling ternary but also need
      // to be forwarded as they may be valid HTML attributes on the underlying element.
      for (const propName of namespaceBooleanProps) {
        openingAttrs.push(
          j.jsxAttribute(
            j.jsxIdentifier(propName),
            j.jsxExpressionContainer(j.identifier(propName)),
          ),
        );
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
      const openingAttrs: ASTNode[] = [];
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
