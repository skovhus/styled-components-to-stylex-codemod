/**
 * Emits wrapper components for non-intrinsic styled declarations.
 * Core concepts: prop mapping, style merging, and JSX construction.
 */
import type { ASTNode, Property } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { getBridgeClassVar } from "../utilities/bridge-classname.js";
import { emitStyleMerging } from "./style-merger.js";
import { withLeadingComments } from "./comments.js";
import {
  collectInlineStylePropNames,
  type ExpressionKind,
  type InlineStyleProp,
  type WrapperPropDefaults,
} from "./types.js";
import {
  SX_PROP_TYPE_TEXT,
  type JsxAttr,
  type JsxTagName,
  type StatementKind,
  type WrapperEmitter,
} from "./wrapper-emitter.js";
import {
  appendAllPseudoStyleArgs,
  appendThemeBooleanStyleArgs,
  buildUseThemeDeclaration,
} from "./emit-intrinsic-simple.js";
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
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { mergeOrderedEntries, type OrderedStyleEntry } from "./style-expr-builders.js";
import {
  areEquivalentWhen,
  findComplementaryVariantEntry,
  getPositiveWhen,
} from "./variant-condition.js";

export function emitComponentWrappers(emitter: WrapperEmitter): {
  emitted: ASTNode[];
  needsReactTypeImport: boolean;
  needsUseThemeImport: boolean;
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
  let needsUseThemeImport = false;

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
    // Check if the wrapped component's props explicitly include className/style.
    // When true, the wrapper should accept and forward these props so the wrapped
    // component's className/style are not silently dropped by the styled() layer.
    const wrappedHasClassName = localComponentHasProp(wrappedComponent, "className");
    const wrappedHasStyle = localComponentHasProp(wrappedComponent, "style");
    const shouldAllowClassName = emitter.shouldAllowClassNameProp(d);
    const shouldAllowStyle = emitter.shouldAllowStyleProp(d);
    const allowSxProp = emitter.shouldAllowSxProp(d);
    const allowClassNameProp = shouldAllowClassName || wrappedHasClassName;
    const allowStyleProp = shouldAllowStyle || wrappedHasStyle;
    // When the wrapped component has className/style as REQUIRED props, we must
    // force them to be optional in the wrapper's type. Otherwise, the wrapper would
    // inherit the requiredness, breaking call sites that don't pass className/style
    // (styled-components injects them automatically).
    // This applies regardless of whether allowClassNameProp is true - even if call
    // sites pass className, the wrapper should accept it as optional.
    const wrappedClassNameRequired =
      wrappedHasClassName &&
      baseComponentPropsType &&
      emitter.isPropRequiredInPropsTypeLiteral(baseComponentPropsType, "className");
    const wrappedStyleRequired =
      wrappedHasStyle &&
      baseComponentPropsType &&
      emitter.isPropRequiredInPropsTypeLiteral(baseComponentPropsType, "style");
    const forceClassNameOptional = !!wrappedClassNameRequired;
    const forceStyleOptional = !!wrappedStyleRequired;
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

      // Check if the wrapper and wrapped component share the same props type name.
      // This would create a circular type reference, so we should not extend the type.
      const wrappedPropsTypeName = emitter.resolveWrappedExplicitPropsTypeName(renderedComponent);
      const isSelfReferentialPropsType = !!(
        explicitTypeName &&
        wrappedPropsTypeName &&
        explicitTypeName === wrappedPropsTypeName
      );

      if (
        explicitTypeExists &&
        explicit &&
        explicitTypeName &&
        !isPolymorphicComponentWrapper &&
        !isSelfReferentialPropsType
      ) {
        // Pass explicitTypeName to avoid self-referential types when wrapper and wrapped
        // component share the same props type name (P1 fix)
        const base = emitter.componentPropsBaseType(renderedComponent, explicitTypeName);
        const omitted: string[] = [];
        if (!allowClassNameProp || forceClassNameOptional) {
          omitted.push('"className"');
        }
        if (!allowStyleProp || forceStyleOptional) {
          omitted.push('"style"');
        }
        const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        const optionalProps: string[] = [];
        if (forceClassNameOptional) {
          optionalProps.push("className?: string");
        }
        if (forceStyleOptional) {
          optionalProps.push("style?: React.CSSProperties");
        }
        if (allowSxProp) {
          optionalProps.push(SX_PROP_TYPE_TEXT);
        }
        if (hasForwardedAsUsage) {
          optionalProps.push("forwardedAs?: React.ElementType");
        }
        // Extend the existing type in-place so the wrapper can reuse it.
        // For interfaces, use `extends` for the base type and inject optional props
        // as members (since `extends` clauses don't support intersection types).
        // For type aliases, use an intersection of everything.
        const interfaceExtended = emitter.extendExistingInterface(explicitTypeName, baseWithOmit);
        if (interfaceExtended) {
          if (optionalProps.length > 0) {
            emitter.injectMembersIntoInterface(explicitTypeName, optionalProps);
          }
        } else {
          const baseTypeText =
            optionalProps.length > 0
              ? emitter.joinIntersection(baseWithOmit, `{ ${optionalProps.join("; ")} }`)
              : baseWithOmit;
          emitter.extendExistingTypeAlias(explicitTypeName, baseTypeText);
        }
        functionParamTypeName = explicitTypeName;
      } else if (isSelfReferentialPropsType && explicitTypeName) {
        // P1 fix: When wrapper and wrapped component share the same props type,
        // don't modify the existing type (would create circular reference).
        // Instead, use an inline intersection in the function parameter:
        //   SharedProps & Omit<ComponentProps<"div">, keyof SharedProps>
        // This is safe because SharedProps is already defined (no forward reference).
        const defaultTag = emitter.resolveWrappedDefaultTag(renderedComponent);
        const omitted: string[] = [];
        if (!allowClassNameProp) {
          omitted.push('"className"');
        }
        if (!allowStyleProp) {
          omitted.push('"style"');
        }
        const intrinsicBase = defaultTag
          ? `Omit<React.ComponentPropsWithRef<"${defaultTag}">, keyof ${explicitTypeName}${omitted.length ? ` | ${omitted.join(" | ")}` : ""}>`
          : null;
        const optionalProps: string[] = [];
        if (allowSxProp) {
          optionalProps.push(SX_PROP_TYPE_TEXT);
        }
        if (hasForwardedAsUsage) {
          optionalProps.push("forwardedAs?: React.ElementType");
        }
        // Build inline type for the function parameter (don't modify SharedProps)
        inlineTypeText = emitter.joinIntersection(
          explicitTypeName,
          intrinsicBase,
          optionalProps.length > 0 ? `{ ${optionalProps.join("; ")} }` : null,
        );
      } else {
        if (isPolymorphicComponentWrapper) {
          const basePropsRaw = `React.ComponentPropsWithRef<typeof ${renderedComponent}>`;
          // When forcing optional, omit className/style from base to prevent inheriting requiredness
          const baseOmitted: string[] = [];
          if (forceClassNameOptional) {
            baseOmitted.push('"className"');
          }
          if (forceStyleOptional) {
            baseOmitted.push('"style"');
          }
          const baseProps = baseOmitted.length
            ? `Omit<${basePropsRaw}, ${baseOmitted.join(" | ")}>`
            : basePropsRaw;
          const omitted: string[] = [];
          if (!allowClassNameProp) {
            omitted.push('"className"');
          }
          if (!allowStyleProp) {
            omitted.push('"style"');
          }
          // Add optional className/style/sx when forcing optional or when sx is enabled
          const optionalStyleProps: string[] = [];
          if (forceClassNameOptional) {
            optionalStyleProps.push("className?: string");
          }
          if (forceStyleOptional) {
            optionalStyleProps.push("style?: React.CSSProperties");
          }
          if (allowSxProp) {
            optionalStyleProps.push(SX_PROP_TYPE_TEXT);
          }
          const typeText = [
            baseProps,
            `Omit<React.ComponentPropsWithRef<C>, keyof ${basePropsRaw} | "className" | "style">`,
            "{\n  as?: C;\n}",
            ...(hasForwardedAsUsage ? ["{ forwardedAs?: React.ElementType }"] : []),
            ...(optionalStyleProps.length > 0 ? [`{ ${optionalStyleProps.join("; ")} }`] : []),
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
          const skipStyleProps =
            wrappedComponentIsStyledWrapper || (wrappedHasClassName && wrappedHasStyle);
          const hasExplicitPropsType = !!explicit;
          const inferred = emitter.inferredComponentWrapperPropsTypeText({
            d,
            allowClassNameProp,
            allowStyleProp,
            allowSxProp,
            wrappedComponentIsInternalWrapper: skipStyleProps,
            hasExplicitPropsType,
            forceClassNameOptional,
            forceStyleOptional,
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
          // Inject className/style/sx into explicit props when external styles are explicitly
          // enabled via adapter (d.supportsExternalStyles).
          // className/style are skipped when the wrapped component already has them.
          // sx is always injected when allowSxProp is true (it's a new StyleX-specific prop).
          if (explicitWithExtras && d.supportsExternalStyles) {
            explicitWithExtras = injectStylePropsIntoTypeLiteralString(explicitWithExtras, {
              className: !skipStyleProps && allowClassNameProp && !wrappedHasClassName,
              style: !skipStyleProps && allowStyleProp && !wrappedHasStyle,
              sx: allowSxProp,
            });
          }
          const explicitWithRef =
            explicitWithExtras ??
            (refElementType ? `{ ref?: React.Ref<${refElementType}>; }` : null);
          // NOTE: `inferred` already includes `React.ComponentProps<typeof WrappedComponent>`,
          // which carries `children` when the wrapped component accepts them. Wrapping the
          // explicit extra props in `PropsWithChildren` is redundant and can cause extra churn.
          const typeText = explicitWithRef
            ? emitter.joinIntersection(explicitWithRef, inferred)
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
    // Track props that need to be destructured for conditional styles
    const destructureProps: string[] = [];
    // Track default values for props (used for destructuring defaults on optional props)
    const propDefaults: WrapperPropDefaults = new Map();
    // Track namespace boolean props (like 'disabled') that need to be passed to wrapped component
    const namespaceBooleanProps: string[] = [];

    // Track props that are destructured solely for styling purposes (variant conditions
    // and pseudo-alias selectors). These should NOT be forwarded to the wrapped component
    // because they are style-only concerns and may not be valid HTML/component attributes.
    const styleOnlyConditionProps = new Set<string>();
    // Track props that carry CSS values (style functions and inline styles).
    // These are a subset of styleOnlyConditionProps but with stronger non-forwarding signal:
    // when declared in the wrapper's explicit type, they should not be forwarded to the base
    // component even when the base type can't be resolved (imported component).
    const styleFnValueProps = new Set<string>();

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
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
    ];

    // Collect variant and styleFn expressions with source order for interleaving.
    const hasSourceOrder = !!(d.variantSourceOrder && Object.keys(d.variantSourceOrder).length > 0);
    const orderedEntries: OrderedStyleEntry[] = [];

    // Add variant style arguments if this component has variants
    if (d.variantStyleKeys) {
      const sortedEntries = sortVariantEntriesBySpecificity(Object.entries(d.variantStyleKeys));
      const consumedVariantIndices = new Set<number>();
      for (let vi = 0; vi < sortedEntries.length; vi++) {
        if (consumedVariantIndices.has(vi)) {
          continue;
        }
        const [when, variantKey] = sortedEntries[vi]!;
        const prevLength = destructureProps.length;

        // Look for a complementary pair to merge into a ternary expression
        const complementIdx = findComplementaryVariantEntry(
          sortedEntries,
          vi,
          consumedVariantIndices,
        );
        if (complementIdx !== null) {
          consumedVariantIndices.add(complementIdx);
          const [otherWhen, otherKey] = sortedEntries[complementIdx]!;
          const positiveWhen = getPositiveWhen(when, otherWhen) ?? when;
          const { cond } = emitter.collectConditionProps({ when: positiveWhen, destructureProps });
          for (let i = prevLength; i < destructureProps.length; i++) {
            styleOnlyConditionProps.add(destructureProps[i]!);
          }
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
          const expr = j.conditionalExpression(cond, trueExpr, falseExpr);
          const order = d.variantSourceOrder?.[when];
          if (hasSourceOrder && order !== undefined) {
            orderedEntries.push({ order, expr });
          } else {
            styleArgs.push(expr);
          }
          continue;
        }

        const { cond, isBoolean } = emitter.collectConditionProps({ when, destructureProps });
        // Track newly added props as style-only (variant condition props)
        for (let i = prevLength; i < destructureProps.length; i++) {
          styleOnlyConditionProps.add(destructureProps[i]!);
        }
        const styleExpr = j.memberExpression(
          j.identifier(stylesIdentifier),
          j.identifier(variantKey),
        );
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
        namespaceBooleanProps,
        orderedEntries: hasSourceOrder ? orderedEntries : undefined,
      });
    }

    // Handle theme boolean conditionals (e.g., theme.isDark ? styles.boxDark : styles.boxLight)
    const needsUseTheme = appendThemeBooleanStyleArgs(
      d.needsUseThemeHook,
      styleArgs,
      j,
      stylesIdentifier,
      () => {
        needsUseThemeImport = true;
      },
    );

    for (const gp of appendAllPseudoStyleArgs(d, styleArgs, j, stylesIdentifier)) {
      if (!destructureProps.includes(gp)) {
        destructureProps.push(gp);
        styleOnlyConditionProps.add(gp);
      }
    }

    for (const prop of collectInlineStylePropNames(d.inlineStyleProps ?? [])) {
      if (!destructureProps.includes(prop)) {
        destructureProps.push(prop);
      }
      styleOnlyConditionProps.add(prop);
      styleFnValueProps.add(prop);
    }

    // Add style function calls for dynamic prop-based styles
    const prevLengthStyleFn = destructureProps.length;
    emitter.buildStyleFnExpressions({
      d,
      styleArgs,
      destructureProps,
      propExprBuilder: (prop) => j.memberExpression(propsIdForExpr, j.identifier(prop)),
      propsIdentifier: propsIdForExpr,
      orderedEntries: hasSourceOrder ? orderedEntries : undefined,
    });
    // Track props added by style functions as style-only.
    // These props are destructured for dynamic style calls (e.g., styles.width(width))
    // and should not be forwarded unless the base component explicitly accepts them.
    for (let i = prevLengthStyleFn; i < destructureProps.length; i++) {
      const prop = destructureProps[i]!;
      styleOnlyConditionProps.add(prop);
      styleFnValueProps.add(prop);
    }

    // Merge ordered entries (variants + styleFns) by source order to preserve CSS cascade
    mergeOrderedEntries(orderedEntries, styleArgs);

    // For component wrappers, filter out transient props ($-prefixed) that are NOT used in styling.
    // In styled-components, transient props are automatically filtered before passing to wrapped component.
    // We need to mimic this behavior by destructuring them out when not used for conditional styles.
    // For component wrappers, filter out transient props ($-prefixed) that are NOT used in styling.
    // In styled-components, transient props are automatically filtered before passing to wrapped component.
    // We need to mimic this behavior by destructuring them out when not used for conditional styles.
    // Track which transient props are for filtering only (not used in styling).
    // These are transient props that we should strip before forwarding.
    const filterOnlyTransientProps: string[] = [];
    // Track transient props that are defined in the WRAPPER's explicit type (not the base's).
    // These should NOT be passed back to the base component because the base doesn't accept them.
    const wrapperOnlyTransientProps: string[] = [];
    // Track ALL prop names defined in the wrapper's explicit type parameter.
    // Used to avoid forwarding style-only props to the base component when the base type
    // can't be resolved (imported component): if a prop is declared in the wrapper type
    // and only used for styling, it almost certainly doesn't belong on the base component.
    const wrapperExplicitPropNames = new Set<string>();
    {
      // Finds prop names in a named type (interface or type alias) matching a predicate.
      const findMatchingPropsInTypeName = (
        typeName: string,
        predicate: (name: string) => boolean,
      ): string[] => {
        const found: string[] = [];
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
                predicate(member.key.name)
              ) {
                found.push(member.key.name);
              }
            }
          }
        };
        const interfaceDecl = root
          .find(j.TSInterfaceDeclaration)
          .filter((p: any) => (p.node as any).id?.name === typeName);
        if (interfaceDecl.size() > 0) {
          for (const member of interfaceDecl.get().node.body?.body ?? []) {
            if (
              member.type === "TSPropertySignature" &&
              member.key?.type === "Identifier" &&
              predicate(member.key.name)
            ) {
              found.push(member.key.name);
            }
          }
        }
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p: any) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          collectFromTypeNode(typeAlias.get().node.typeAnnotation);
        }
        return found;
      };

      // Find all transient props in the explicit props type
      const explicit = d.propsType;
      let transientProps: string[] = [];
      const renamedTransientValues = d.transientPropRenames
        ? new Set(d.transientPropRenames.values())
        : undefined;

      // Check if explicit type is a type literal with members
      if (explicit?.type === "TSTypeLiteral" && explicit.members) {
        for (const member of explicit.members) {
          if (member.type === "TSPropertySignature" && member.key?.type === "Identifier") {
            const memberName = member.key.name;
            wrapperExplicitPropNames.add(memberName);
            if (memberName.startsWith("$") || renamedTransientValues?.has(memberName)) {
              transientProps.push(memberName);
              wrapperOnlyTransientProps.push(memberName);
            }
          }
        }
      }
      // Check if explicit type is a reference to an interface/type alias
      else if (explicit?.type === "TSTypeReference" && explicit.typeName?.type === "Identifier") {
        const typeName = explicit.typeName.name;
        for (const p of findMatchingPropsInTypeName(typeName, () => true)) {
          wrapperExplicitPropNames.add(p);
        }
        transientProps = findMatchingPropsInTypeName(typeName, (n) => n.startsWith("$"));
        // After interface renaming, $-prefixed members may have been renamed.
        // Also find renamed-from-transient members.
        if (renamedTransientValues) {
          for (const p of findMatchingPropsInTypeName(typeName, (n) =>
            renamedTransientValues.has(n),
          )) {
            if (!transientProps.includes(p)) {
              transientProps.push(p);
            }
          }
        }
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
            transientProps = findMatchingPropsInTypeName(typeName, (n) => n.startsWith("$"));
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
              transientProps = findMatchingPropsInTypeName(typeName, (n) => n.startsWith("$"));
            }
          }
        }
      }

      // When transient props were renamed ($prop → prop), translate
      // wrapperOnlyTransientProps to use the renamed names so they match
      // the entries in destructureProps (which already use renamed names).
      if (d.transientPropRenames) {
        for (let i = 0; i < wrapperOnlyTransientProps.length; i++) {
          const renamed = d.transientPropRenames.get(wrapperOnlyTransientProps[i]!);
          if (renamed) {
            wrapperOnlyTransientProps[i] = renamed;
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

    // For imported base components (type unresolvable), don't destructure non-transient
    // style-fn props that are declared in the wrapper's explicit type. Leaving them in
    // `...rest` naturally forwards them to the base component (matching styled-components
    // semantics) while avoiding an explicit `prop={prop}` attribute that would cause TS
    // errors if the base component doesn't accept it. The style function already references
    // `props.propName`, so destructuring is unnecessary for styling.
    // Transient props ($-prefixed or renamed from $-prefixed) MUST stay destructured to
    // prevent them from leaking to the base component.
    if (!baseComponentPropsType) {
      const renamedTransientValues = d.transientPropRenames
        ? new Set(d.transientPropRenames.values())
        : undefined;
      for (const prop of styleFnValueProps) {
        if (
          wrapperExplicitPropNames.has(prop) &&
          !prop.startsWith("$") &&
          !wrapperOnlyTransientProps.includes(prop) &&
          !filterOnlyTransientProps.includes(prop) &&
          !renamedTransientValues?.has(prop)
        ) {
          const idx = destructureProps.indexOf(prop);
          if (idx !== -1) {
            destructureProps.splice(idx, 1);
          }
          styleOnlyConditionProps.delete(prop);
        }
      }
    }

    const propsParamId = j.identifier("props");
    let polymorphicFnTypeParams: unknown = null;
    if (isPolymorphicComponentWrapper && emitTypes) {
      polymorphicFnTypeParams = buildPolymorphicTypeParams(j, `typeof ${wrappedComponent}`);
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

    const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(
      d.attrsInfo,
      getBridgeClassVar(d),
    );
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
      shouldLowerForwardedAs ||
      (d.supportsRefProp ?? false);
    const includeChildren =
      !isPolymorphicComponentWrapper && emitter.hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const sxId = j.identifier("sx");
      const refId = j.identifier("ref");
      const restId = j.identifier("rest");
      const componentId = j.identifier("Component");
      const forwardedAsId = j.identifier("forwardedAs");
      const wrappedComponentExpr = buildWrappedComponentExpr();

      if (allowSxProp) {
        styleArgs.push(sxId);
      }

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
          ...(allowSxProp ? [patternProp("sx", sxId)] : []),
          ...((d.supportsRefProp ?? false) ? [patternProp("ref", refId)] : []),
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
        allowSxProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
        staticClassNameExpr,
        isIntrinsicElement: false,
      });

      const stmts: StatementKind[] = [declStmt];
      if (needsUseTheme) {
        stmts.push(buildUseThemeDeclaration(j, emitter.themeHook.functionName));
      }
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
      // Use buildDefaultAttrsFromProps to preserve nullish coalescing (e.g., tabIndex ?? 0)
      // Default attrs go first; their ?? operator handles caller overrides internally.
      openingAttrs.push(
        ...emitter.buildDefaultAttrsFromProps({
          defaultAttrs,
          propExprFor: (prop) => j.identifier(prop),
        }),
      );
      if (d.supportsRefProp ?? false) {
        openingAttrs.push(j.jsxAttribute(j.jsxIdentifier("ref"), j.jsxExpressionContainer(refId)));
      }
      // NOTE: staticAttrs are added AFTER {...rest} below so they override caller props
      // (matching styled-components semantics where .attrs() values always win).
      const forwardedProps = new Set<string>();
      // Pre-populate with attr names already emitted as JSX attributes above.
      // defaultAttrs are emitted by buildDefaultAttrsFromProps (e.g., column={column ?? true}).
      for (const attr of defaultAttrs) {
        forwardedProps.add(attr.attrName);
      }
      // staticAttrs are emitted by buildStaticAttrsFromRecord (e.g., column={true}).
      for (const key of Object.keys(staticAttrsWithoutForwardedAsFallback)) {
        forwardedProps.add(key);
      }
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

      // Build reverse lookup for renamed transient props: renamedName → originalName
      const renamedFromTransient = new Map<string, string>();
      if (d.transientPropRenames) {
        for (const [original, renamed] of d.transientPropRenames) {
          renamedFromTransient.set(renamed, original);
        }
      }

      // Pass transient props used for styling back to the base component.
      // These props were destructured for styling but the base component might also need them.
      // Filter out:
      // 1. Props that are for filtering only (not used in styling)
      // 2. Props defined in the wrapper's explicit type (base doesn't accept them)
      for (const propName of destructureProps) {
        const originalTransientName = renamedFromTransient.get(propName);
        if (originalTransientName) {
          // Renamed transient prop: forward with original $-prefixed attribute name
          // e.g., <BaseComp $isOpen={isOpen} /> where $isOpen was renamed to isOpen
          if (
            !filterOnlyTransientProps.includes(propName) &&
            !wrapperOnlyTransientProps.includes(propName)
          ) {
            if (!forwardedProps.has(originalTransientName)) {
              forwardedProps.add(originalTransientName);
              openingAttrs.push(
                j.jsxAttribute(
                  j.jsxIdentifier(originalTransientName),
                  j.jsxExpressionContainer(j.identifier(propName)),
                ),
              );
            }
          }
          continue;
        }
        if (
          propName.startsWith("$") &&
          !filterOnlyTransientProps.includes(propName) &&
          !wrapperOnlyTransientProps.includes(propName)
        ) {
          pushForwardedProp(propName);
        }
      }
      // Forward base-component props (required or optional) that were destructured for styling.
      // Destructuring removes them from `...rest`, so they must be explicitly re-forwarded.
      // In styled-components all non-transient props are forwarded to the wrapped component,
      // so when the base type can't be resolved we preserve that semantic.
      // Only suppress forwarding when the base type is resolvable and explicitly excludes the prop.
      const baseExplicitProps = baseComponentPropsType
        ? emitter.getExplicitPropNames(baseComponentPropsType)
        : null;

      for (const propName of destructureProps) {
        if (
          propName &&
          propName !== "children" &&
          !propName.startsWith("$") &&
          !renamedFromTransient.has(propName)
        ) {
          if (styleOnlyConditionProps.has(propName)) {
            // Props added purely for variant conditions or pseudo-alias selectors are
            // style-only concerns. Forward them when the base component explicitly
            // accepts them, or when the base type can't be resolved (styled-components
            // forwards all non-transient props to wrapped components by default).
            if (!baseExplicitProps || baseExplicitProps.has(propName)) {
              pushForwardedProp(propName);
            }
            continue;
          }
          if (!baseExplicitProps || baseExplicitProps.has(propName)) {
            pushForwardedProp(propName);
          }
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
      // Add staticAttrs from .attrs({...}) AFTER {...rest} so attrs override caller props
      // (styled-components semantics: .attrs() values always win over incoming props).
      openingAttrs.push(
        ...emitter.buildStaticAttrsFromRecord(staticAttrsWithoutForwardedAsFallback, {
          booleanTrueAsShorthand: false,
        }),
      );
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
            bodyStmts: [
              ...(needsUseTheme
                ? [buildUseThemeDeclaration(j, emitter.themeHook.functionName)]
                : []),
              j.returnStatement(jsx as any),
            ],
            typeParameters: polymorphicFnTypeParams,
          }),
          d,
        ),
      );
    }
  }

  return { emitted, needsReactTypeImport, needsUseThemeImport };
}
