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
  appendAttrsProvidedPropOmissions,
  collectAttrsProvidedPropNames,
  type AttrsProvidedPropOptions,
  collectBooleanPropNames,
  getAttrsAsString,
  injectRefPropIntoTypeLiteralString,
  injectStylePropsIntoTypeLiteralString,
  TAG_TO_HTML_ELEMENT,
} from "./type-helpers.js";
import {
  getDeclaratorId,
  isIdentifierNode,
  isFunctionNode,
} from "../utilities/jscodeshift-utils.js";
import { typeContainsPolymorphicAs } from "../utilities/polymorphic-as-detection.js";
import { buildPolymorphicTypeParams } from "./jsx-builders.js";
import { rewriteBarePropIdentifiersToPropsAccess } from "./rewrite-prop-identifiers.js";
import {
  appendAllPseudoStyleArgs,
  appendThemeBooleanStyleArgs,
  buildUseThemeDeclaration,
  collectKnownConditionPropNames,
  buildVariantStyleExprs,
  hasStyleSourceOrder,
  mergeOrderedEntries,
  type OrderedStyleEntry,
} from "./style-expr-builders.js";
import { appendCompoundVariantStyleArgs, collectCompoundVariantKeys } from "./compound-variants.js";
import {
  createTypeReferenceFromName,
  getHeritageTypeReferenceName,
  getTypeReferenceParams,
  membersExposeProp,
  propsTypeOmitsProp,
  resolveTypeIdentifierName,
  resolveTypeReferenceName,
  typeReferenceIsComponentPropsOfWrapped,
  typeReferenceNameKey,
} from "./type-reference-names.js";
import {
  importedNamespacePropsTypeExposesForwardedSx,
  importedPropsTypeExposesForwardedSx,
} from "./external-forwarded-sx.js";
import {
  explicitTypeMayBeUnion,
  getExplicitAttrsOmitUnion,
  getExplicitTransientPropRenames,
  localOnlyComponentWrapperPropsTypeText,
  shouldKeepStylePropSeparate,
} from "./attrs-type-analysis.js";
import {
  buildOmitUnion,
  isIntrinsicPassthroughType,
  isTypeNameUsedOutsideOwner,
  normalizeStaticForwardedAsAttr,
  omitStaticAttr,
  removeAttrsMembersInExistingType,
  renameTransientMembersInExistingType,
  resolveRenderedAsProp,
  resolveTypeTextFromType,
  staticSxAttrToExpression,
  transformExplicitPropsTypeText,
} from "./props-type-text.js";

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
  const localComponentHasProp = (args: {
    componentName: string;
    propName: string;
    propsType?: ASTNode | null;
    lookThroughPropsWithChildren?: boolean;
  }): boolean => {
    const { componentName, propName, lookThroughPropsWithChildren } = args;
    if (
      (propName === "sx" || propName === "className" || propName === "style") &&
      emitter.hasTypeScriptComponentMetadata(componentName)
    ) {
      return emitter.typedComponentHasProp(componentName, propName);
    }
    const propsType = args.propsType ?? findComponentPropsType(componentName);
    if (!propsType) {
      return emitter.typedComponentHasProp(componentName, propName);
    }
    const explicitProps = emitter.getExplicitPropNames(propsType, { lookThroughPropsWithChildren });
    return explicitProps.has(propName) || emitter.typedComponentHasProp(componentName, propName);
  };

  const propsTypeExposesForwardedSx = (
    propsType: ASTNode | undefined,
    wrappedComponent: string,
    seenTypeNames = new Set<string>(),
  ): boolean => {
    if (!propsType) {
      return false;
    }
    const explicitProps = emitter.getExplicitPropNames(propsType, {
      lookThroughPropsWithChildren: true,
    });
    if (explicitProps.has("sx")) {
      return true;
    }
    if (typeReferenceIsComponentPropsOfWrapped(propsType, wrappedComponent)) {
      return true;
    }
    if (propsType.type === "TSIntersectionType") {
      for (const member of (propsType as { types?: ASTNode[] }).types ?? []) {
        if (propsTypeExposesForwardedSx(member, wrappedComponent, seenTypeNames)) {
          return true;
        }
      }
      return false;
    }
    const typeRefName = resolveTypeReferenceName(propsType);
    if (!typeRefName) {
      return false;
    }
    const visitedKey = `${emitter.filePath}\u0000${typeReferenceNameKey(typeRefName)}`;
    if (seenTypeNames.has(visitedKey)) {
      return false;
    }
    seenTypeNames.add(visitedKey);
    if (typeRefName.kind === "qualified") {
      return importedNamespacePropsTypeExposesForwardedSx({
        emitter,
        typeName: typeRefName,
        wrappedComponent,
        seenTypeNames,
      });
    }
    const alias = root.find(j.TSTypeAliasDeclaration).filter((p) => {
      const id = (p.node as { id?: { name?: string } }).id;
      return id?.name === typeRefName.name;
    });
    if (alias.size() === 0) {
      const iface = root.find(j.TSInterfaceDeclaration).filter((p) => {
        const id = (p.node as { id?: { name?: string } }).id;
        return id?.name === typeRefName.name;
      });
      if (iface.size() === 0) {
        return importedPropsTypeExposesForwardedSx({
          emitter,
          typeName: typeRefName.name,
          wrappedComponent,
          seenTypeNames,
        });
      }
      const node = iface.get().node as {
        body?: { body?: unknown[] };
        extends?: unknown[];
      };
      if (membersExposeProp(node.body?.body, "sx")) {
        return true;
      }
      for (const heritage of node.extends ?? []) {
        const heritageText = emitter.stringifyTsType(heritage as ASTNode);
        if (
          typeReferenceIsComponentPropsOfWrapped(heritage as ASTNode, wrappedComponent) ||
          heritageText === `typeof ${wrappedComponent}`
        ) {
          return true;
        }
        const heritageName = getHeritageTypeReferenceName(heritage);
        if (
          heritageName &&
          propsTypeExposesForwardedSx(
            createTypeReferenceFromName(j, heritageName),
            wrappedComponent,
            seenTypeNames,
          )
        ) {
          return true;
        }
      }
      return false;
    }
    const annotation = (alias.get().node as { typeAnnotation?: ASTNode }).typeAnnotation;
    return propsTypeExposesForwardedSx(annotation, wrappedComponent, seenTypeNames);
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
    const renderedComponentPropsType = findComponentPropsType(renderedComponent);
    const wrappedLocalDecl = wrapperDecls.find((decl) => decl.localName === wrappedComponent);
    const wrappedComponentIsLocalStyledWrapper = !!wrappedLocalDecl;
    const renderedAsProp = resolveRenderedAsProp({
      emitter,
      propsType: renderedComponentPropsType,
      fallbackTypeName:
        renderedComponent === wrappedComponent && !wrappedComponentIsLocalStyledWrapper
          ? resolveTypeTextFromType(emitter, renderedComponentPropsType)
          : null,
    });
    const wrappedComponentHasAs = wrapperNames.has(wrappedComponent);
    const supportsAsProp = d.supportsAsProp ?? false;
    const hasOwnAsUsage = emitter.getUsedAttrs(d.localName).has("as");
    const hasStaticAsAttr = Object.hasOwn(d.attrsInfo?.staticAttrs ?? {}, "as");
    const propsTypeHasAs =
      d.propsType &&
      typeContainsPolymorphicAs({ root: emitter.root, j: emitter.j, typeNode: d.propsType });
    const shouldAllowAsProp =
      ((hasOwnAsUsage || Boolean(propsTypeHasAs)) && !hasStaticAsAttr) || supportsAsProp;
    const isPolymorphicComponentWrapper = shouldAllowAsProp && !wrappedComponentHasAs;
    // Check if the wrapped component's props explicitly include className/style.
    // This is used to avoid redeclaring props the base already owns. It must not
    // by itself widen this wrapper's public surface; consumer usage/externalInterface
    // still decides whether this wrapper should accept className/style.
    const shouldLookThroughWrappedPropsWithChildren =
      !!d.transientPropRenames && d.transientPropRenames.size > 0;
    const wrappedHasClassName = localComponentHasProp({
      componentName: wrappedComponent,
      propName: "className",
      propsType: baseComponentPropsType,
      lookThroughPropsWithChildren: shouldLookThroughWrappedPropsWithChildren,
    });
    const wrappedHasStyle = localComponentHasProp({
      componentName: wrappedComponent,
      propName: "style",
      propsType: baseComponentPropsType,
      lookThroughPropsWithChildren: shouldLookThroughWrappedPropsWithChildren,
    });
    const shouldAllowClassName = emitter.shouldAllowClassNameProp(d);
    const shouldAllowStyle = emitter.shouldAllowStyleProp(d);
    const hasForwardedAsUsage = emitter.hasForwardedAsUsage(d.localName);
    const shouldLowerForwardedAs = hasForwardedAsUsage && !wrappedComponentHasAs;
    const allowSxProp = emitter.shouldAllowSxProp(d);
    const allowClassNameProp = shouldAllowClassName;
    const allowStyleProp = shouldAllowStyle;
    // When the wrapped component accepts a StyleX `sx` prop (per adapter), the
    // wrapper passes className/style through unchanged via `{...rest}` and the
    // wrapped component merges them with its `sx` itself. The wrapper still
    // accepts className/style in its type, but does not destructure them.
    const wrappedPropsAreOnlyIntrinsic = baseComponentPropsType
      ? isIntrinsicPassthroughType(emitter, baseComponentPropsType)
      : false;
    const wrappedAcceptsSx =
      emitter.useSxProp &&
      ((wrappedLocalDecl ? emitter.shouldAllowSxProp(wrappedLocalDecl) : false) ||
        (!wrappedPropsAreOnlyIntrinsic && emitter.wrappedComponentAcceptsSxProp(wrappedComponent)));
    const attrsProvidedPropOptions: AttrsProvidedPropOptions = {
      normalizeForwardedAs: !shouldLowerForwardedAs,
    };
    const attrsProvidedPropNames = collectAttrsProvidedPropNames(
      d.attrsInfo,
      attrsProvidedPropOptions,
    );
    const explicitPropsTypeRef = resolveTypeReferenceName(d.propsType ?? null);
    const wrapperReusesWrappedPropsType =
      explicitPropsTypeRef?.kind === "identifier" &&
      explicitPropsTypeRef.name ===
        emitter.resolveWrappedExplicitPropsTypeRef(renderedComponent)?.name;
    const wrapperPropsExposeSx =
      wrappedAcceptsSx &&
      !attrsProvidedPropNames.has("sx") &&
      ((wrappedLocalDecl &&
        d.propsType &&
        !wrapperReusesWrappedPropsType &&
        !propsTypeOmitsProp(d.propsType, "sx")) ||
        propsTypeExposesForwardedSx(d.propsType, wrappedComponent) ||
        !d.propsType ||
        !wrappedLocalDecl);
    const exposeSxProp = wrapperPropsExposeSx || allowSxProp;
    const shouldAddOwnSxProp = exposeSxProp && !wrapperPropsExposeSx;
    // When the wrapper intentionally exposes className/style and the wrapped component
    // requires them, force the exposed props to be optional. If this wrapper does not
    // expose className/style, they are omitted from the inherited base type instead.
    const wrappedClassNameRequired =
      allowClassNameProp &&
      wrappedHasClassName &&
      (baseComponentPropsType
        ? emitter.isPropRequiredInPropsTypeLiteral(baseComponentPropsType, "className")
        : emitter.typedComponentProp(wrappedComponent, "className")?.optional === false);
    const wrappedStyleRequired =
      allowStyleProp &&
      wrappedHasStyle &&
      (baseComponentPropsType
        ? emitter.isPropRequiredInPropsTypeLiteral(baseComponentPropsType, "style")
        : emitter.typedComponentProp(wrappedComponent, "style")?.optional === false);
    const forceClassNameOptional = !!wrappedClassNameRequired;
    const forceStyleOptional = !!wrappedStyleRequired;
    const forwardedAsPropTypeText = renderedAsProp?.typeText ?? "React.ElementType";
    const propsIdForExpr = j.identifier("props");
    // Track which type name to use for the function parameter
    let functionParamTypeName: string | null = null;
    // Track inline type text for when we skip emitting a named type (no custom props)
    let inlineTypeText: string | undefined;
    {
      const explicit = emitter.stringifyTsType(d.propsType);
      let explicitAttrsOmitUnion = getExplicitAttrsOmitUnion({
        emitter,
        propsType: d.propsType,
        attrsProvidedPropNames,
      });

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
      const wrappedPropsTypeName =
        emitter.resolveWrappedExplicitPropsTypeRef(renderedComponent)?.name ?? null;
      const isSelfReferentialPropsType = !!(
        explicitTypeName &&
        wrappedPropsTypeName &&
        explicitTypeName === wrappedPropsTypeName
      );
      const explicitTypeNeedsDistributiveOmit = !!(
        d.propsType && explicitTypeMayBeUnion(emitter, d.propsType)
      );
      const explicitTransientPropRenames = getExplicitTransientPropRenames({
        emitter,
        propsType: d.propsType,
        transientPropRenames: d.transientPropRenames,
      });
      const canMutateExplicitType = !!(
        explicitTypeExists &&
        explicitTypeName &&
        !isPolymorphicComponentWrapper &&
        !isSelfReferentialPropsType &&
        !explicitTypeNeedsDistributiveOmit &&
        !isTypeNameUsedOutsideOwner(emitter, explicitTypeName, d.localName)
      );

      if (canMutateExplicitType && explicitTypeName) {
        renameTransientMembersInExistingType(emitter, explicitTypeName, d.transientPropRenames);
        const removedExplicitAttrs = explicitAttrsOmitUnion
          ? removeAttrsMembersInExistingType(emitter, explicitTypeName, attrsProvidedPropNames)
          : true;
        if (removedExplicitAttrs) {
          explicitAttrsOmitUnion = null;
        }
      }
      const canReuseExplicitType = canMutateExplicitType && !explicitAttrsOmitUnion;

      if (
        explicitTypeExists &&
        explicit &&
        explicitTypeName &&
        !isPolymorphicComponentWrapper &&
        !isSelfReferentialPropsType &&
        canReuseExplicitType
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
        appendAttrsProvidedPropOmissions(omitted, d.attrsInfo, attrsProvidedPropOptions);
        const baseWithOmit = omitted.length ? `Omit<${base}, ${omitted.join(" | ")}>` : base;
        const optionalProps: string[] = [];
        if (forceClassNameOptional) {
          optionalProps.push("className?: string");
        }
        if (forceStyleOptional) {
          optionalProps.push("style?: React.CSSProperties");
        }
        if (shouldAddOwnSxProp) {
          optionalProps.push(SX_PROP_TYPE_TEXT);
        }
        if (hasForwardedAsUsage) {
          optionalProps.push(`forwardedAs?: ${forwardedAsPropTypeText}`);
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
        appendAttrsProvidedPropOmissions(omitted, d.attrsInfo, attrsProvidedPropOptions);
        const intrinsicBase = defaultTag
          ? `Omit<React.ComponentPropsWithRef<"${defaultTag}">, keyof ${explicitTypeName}${omitted.length ? ` | ${omitted.join(" | ")}` : ""}>`
          : null;
        const optionalProps: string[] = [];
        if (shouldAddOwnSxProp) {
          optionalProps.push(SX_PROP_TYPE_TEXT);
        }
        if (hasForwardedAsUsage) {
          optionalProps.push(`forwardedAs?: ${forwardedAsPropTypeText}`);
        }
        // Build inline type for the function parameter (don't modify SharedProps)
        inlineTypeText = emitter.joinIntersection(
          transformExplicitPropsTypeText({
            canMutateExplicitType,
            explicitAttrsOmitUnion,
            typeText: explicitTypeName,
            useDistributiveOmit: explicitTypeNeedsDistributiveOmit,
            transientPropRenames: explicitTransientPropRenames,
          }),
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
          appendAttrsProvidedPropOmissions(baseOmitted, d.attrsInfo, attrsProvidedPropOptions);
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
          appendAttrsProvidedPropOmissions(omitted, d.attrsInfo, attrsProvidedPropOptions);
          // Add optional className/style/sx when forcing optional or when sx is enabled
          const optionalStyleProps: string[] = [];
          if (forceClassNameOptional) {
            optionalStyleProps.push("className?: string");
          }
          if (forceStyleOptional) {
            optionalStyleProps.push("style?: React.CSSProperties");
          }
          if (shouldAddOwnSxProp) {
            optionalStyleProps.push(SX_PROP_TYPE_TEXT);
          }
          const typeText = [
            baseProps,
            `Omit<React.ComponentPropsWithRef<C>, ${buildOmitUnion([
              `keyof ${basePropsRaw}`,
              '"className"',
              '"style"',
              ...[...attrsProvidedPropNames].map((name) => JSON.stringify(name)),
            ])}>`,
            attrsProvidedPropNames.has("as") ? "{\n  as?: never;\n}" : "{\n  as?: C;\n}",
            ...(hasForwardedAsUsage ? [`{ forwardedAs?: ${forwardedAsPropTypeText} }`] : []),
            ...(optionalStyleProps.length > 0 ? [`{ ${optionalStyleProps.join("; ")} }`] : []),
            // Include user's explicit props type if it exists
            ...(explicit
              ? [
                  transformExplicitPropsTypeText({
                    canMutateExplicitType,
                    explicitAttrsOmitUnion,
                    typeText: explicit,
                    useDistributiveOmit: explicitTypeNeedsDistributiveOmit,
                    transientPropRenames: explicitTransientPropRenames,
                  }),
                ]
              : []),
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
            allowSxProp: shouldAddOwnSxProp,
            wrappedComponentIsInternalWrapper: skipStyleProps,
            wrappedComponentIsStyledWrapper,
            hasExplicitPropsType,
            forceClassNameOptional,
            forceStyleOptional,
            wrappedComponent,
            forwardedAsPropTypeText,
            attrsProvidedPropOptions,
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
          // Inject className/style into explicit props when external styles are explicitly
          // enabled via adapter (d.supportsExternalStyles).
          // className/style are skipped when the wrapped component already has them.
          // sx is injected into the wrapper's own props when it is consumed locally
          // rather than inherited from an sx-aware wrapped component.
          //
          // Also inject when the wrapper will destructure className/style from `props`
          // but the wrapped component's prepass metadata proves it doesn't accept them.
          // Without this lift the wrapper's prop type (an intersection with
          // `React.ComponentPropsWithRef<typeof Wrapped>`) lacks those keys, and the
          // destructure produces TS2339 — same fix as in `inferredComponentWrapperPropsTypeText`,
          // applied to the explicit-propsType code path.
          const wrappedRejectsClassName =
            !!wrappedComponent && emitter.wrappedRejectsStyleProp(wrappedComponent, "className");
          const wrappedRejectsStyle =
            !!wrappedComponent && emitter.wrappedRejectsStyleProp(wrappedComponent, "style");
          const shouldLiftClassNameOntoExplicit =
            !skipStyleProps && allowClassNameProp && wrappedRejectsClassName;
          const shouldLiftStyleOntoExplicit =
            !skipStyleProps && allowStyleProp && wrappedRejectsStyle;
          const shouldLiftSxOntoExplicit = !wrappedComponentIsStyledWrapper && shouldAddOwnSxProp;
          const shouldInjectClassNameOntoExplicit =
            !skipStyleProps &&
            allowClassNameProp &&
            ((d.supportsExternalStyles && !wrappedHasClassName) || shouldLiftClassNameOntoExplicit);
          const shouldInjectStyleOntoExplicit =
            !skipStyleProps &&
            allowStyleProp &&
            ((d.supportsExternalStyles && !wrappedHasStyle) || shouldLiftStyleOntoExplicit);
          if (
            explicitWithExtras &&
            (shouldInjectClassNameOntoExplicit ||
              shouldInjectStyleOntoExplicit ||
              shouldLiftClassNameOntoExplicit ||
              shouldLiftStyleOntoExplicit ||
              shouldLiftSxOntoExplicit)
          ) {
            explicitWithExtras = injectStylePropsIntoTypeLiteralString(explicitWithExtras, {
              className: shouldInjectClassNameOntoExplicit,
              style: shouldInjectStyleOntoExplicit,
              sx: shouldLiftSxOntoExplicit,
            });
          }
          const explicitWithRef =
            (explicitWithExtras
              ? transformExplicitPropsTypeText({
                  canMutateExplicitType,
                  explicitAttrsOmitUnion,
                  typeText: explicitWithExtras,
                  useDistributiveOmit: explicitTypeNeedsDistributiveOmit,
                  transientPropRenames: explicitTransientPropRenames,
                })
              : null) ?? (refElementType ? `{ ref?: React.Ref<${refElementType}>; }` : null);
          // NOTE: `inferred` already includes `React.ComponentProps<typeof WrappedComponent>`,
          // which carries `children` when the wrapped component accepts them. Wrapping the
          // explicit extra props in `PropsWithChildren` is redundant and can cause extra churn.
          const typeText = explicitWithRef
            ? emitter.joinIntersection(explicitWithRef, inferred)
            : inferred;
          // When there are no custom props, skip emitting named type and use inline type instead
          const hasNoCustomProps = !explicitWithRef;
          if (
            hasNoCustomProps &&
            shouldLowerForwardedAs &&
            renderedAsProp?.baseTypeText &&
            !exposeSxProp &&
            !forceClassNameOptional &&
            !forceStyleOptional
          ) {
            emitNamedPropsType(
              d.localName,
              emitter.joinIntersection(
                renderedAsProp.baseTypeText,
                `{ forwardedAs?: ${renderedAsProp.typeText} }`,
              ),
            );
          } else if (hasNoCustomProps || (explicitAttrsOmitUnion && explicitTypeExists)) {
            inlineTypeText = typeText;
          } else if (!emitNamedPropsType(d.localName, typeText)) {
            inlineTypeText = typeText;
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
    const styleValueVariantProps = new Set(d.styleValueVariantProps ?? []);
    const observedExpressionConditionDropProps = new Set(
      d.observedExpressionConditionDropProps ?? [],
    );
    for (const prop of styleValueVariantProps) {
      styleFnValueProps.add(prop);
    }

    // Build propsArg expressions first (may be needed for interleaving)
    const propsArgExprs = d.extraStylexPropsArgs
      ? emitter.buildExtraStylexPropsExprEntries({
          entries: d.extraStylexPropsArgs,
          destructureProps,
        })
      : [];

    // Build interleaved before/after-base args using mixinOrder
    const {
      beforeBase: extraStyleArgs,
      afterBase: extraStyleArgsAfterBase,
      afterVariants: afterVariantStyleArgs,
    } = emitter.buildInterleavedExtraStyleArgs(d, propsArgExprs);
    const styleArgs: ExpressionKind[] = [
      ...extraStyleArgs,
      ...emitter.baseStyleExpr(d),
      ...extraStyleArgsAfterBase,
    ];

    // Collect variant and styleFn expressions with source order for interleaving.
    const hasSourceOrder = hasStyleSourceOrder(d);
    const orderedEntries: OrderedStyleEntry[] = [];
    const booleanProps = collectBooleanPropNames(d);
    const knownProps = collectKnownConditionPropNames(emitter, d);

    // Add variant style arguments if this component has variants
    buildVariantStyleExprs({
      d,
      emitter,
      j,
      stylesIdentifier,
      styleArgs,
      orderedEntries,
      hasSourceOrder,
      destructureProps,
      booleanProps,
      knownProps,
      compoundVariantKeys: collectCompoundVariantKeys(d.compoundVariants),
      enableComplementaryMerging: true,
      onNewDestructureProp: (prop) => styleOnlyConditionProps.add(prop),
    });

    // Add variant dimension lookups (StyleX variants recipe pattern)
    if (d.variantDimensions) {
      emitter.buildVariantDimensionLookups({
        dimensions: d.variantDimensions,
        styleArgs,
        destructureProps,
        propDefaults,
        namespaceBooleanProps,
        orderedEntries: hasSourceOrder ? orderedEntries : undefined,
        knownProps,
      });
    }

    if (d.compoundVariants) {
      const prevLengthCompound = destructureProps.length;
      appendCompoundVariantStyleArgs({
        compoundVariants: d.compoundVariants,
        styleArgs,
        destructureProps,
        j,
        stylesIdentifier,
      });
      for (let i = prevLengthCompound; i < destructureProps.length; i++) {
        styleOnlyConditionProps.add(destructureProps[i]!);
      }
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
      hasSourceOrder ? orderedEntries : undefined,
    );

    for (const gp of appendAllPseudoStyleArgs(
      d,
      styleArgs,
      j,
      stylesIdentifier,
      hasSourceOrder ? orderedEntries : undefined,
    )) {
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
    if (afterVariantStyleArgs.length > 0) {
      styleArgs.push(...afterVariantStyleArgs);
    }

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
      const findMatchingPropsInTypeNode = (
        typeNode: ASTNode | undefined,
        predicate: (name: string) => boolean,
        visitedTypeNames = new Set<string>(),
      ): string[] => {
        const found: string[] = [];
        const collectFromTypeNode = (node: ASTNode | undefined) => {
          if (!node) {
            return;
          }
          if (node.type === "TSParenthesizedType") {
            collectFromTypeNode((node as { typeAnnotation?: ASTNode }).typeAnnotation);
            return;
          }
          if (node.type === "TSIntersectionType" || node.type === "TSUnionType") {
            for (const part of (node as { types?: ASTNode[] }).types ?? []) {
              collectFromTypeNode(part);
            }
            return;
          }
          if (node.type === "TSTypeLiteral") {
            for (const member of (node as { members?: unknown[] }).members ?? []) {
              const typed = member as { type?: string; key?: { type?: string; name?: string } };
              if (typed.type !== "TSPropertySignature" || typed.key?.type !== "Identifier") {
                continue;
              }
              const propName = typed.key.name;
              if (propName && predicate(propName)) {
                found.push(propName);
              }
            }
            return;
          }
          if (node.type !== "TSTypeReference") {
            return;
          }
          const typeName = resolveTypeIdentifierName(node);
          if (!typeName) {
            for (const param of getTypeReferenceParams(node)) {
              collectFromTypeNode(param);
            }
            return;
          }
          if (visitedTypeNames.has(typeName)) {
            return;
          }
          visitedTypeNames.add(typeName);
          const interfaceDecl = root
            .find(j.TSInterfaceDeclaration)
            .filter((p: any) => (p.node as any).id?.name === typeName);
          if (interfaceDecl.size() > 0) {
            for (const member of interfaceDecl.get().node.body?.body ?? []) {
              const typed = member as { type?: string; key?: { type?: string; name?: string } };
              if (typed.type !== "TSPropertySignature" || typed.key?.type !== "Identifier") {
                continue;
              }
              const propName = typed.key.name;
              if (propName && predicate(propName)) {
                found.push(propName);
              }
            }
          }
          const typeAlias = root
            .find(j.TSTypeAliasDeclaration)
            .filter((p: any) => (p.node as any).id?.name === typeName);
          if (typeAlias.size() > 0) {
            collectFromTypeNode(typeAlias.get().node.typeAnnotation as ASTNode);
          }
        };
        collectFromTypeNode(typeNode);
        return [...new Set(found)];
      };

      // Finds prop names in a named type (interface or type alias) matching a predicate.
      const findMatchingPropsInTypeName = (
        typeName: string,
        predicate: (name: string) => boolean,
      ): string[] =>
        findMatchingPropsInTypeNode(
          j.tsTypeReference(j.identifier(typeName)) as ASTNode,
          predicate,
        );

      // Find all transient props in the explicit props type
      const explicit = d.propsType;
      let transientProps: string[] = [];
      const renamedTransientValues = d.transientPropRenames
        ? new Set(d.transientPropRenames.values())
        : undefined;

      if (explicit) {
        for (const p of findMatchingPropsInTypeNode(explicit, () => true)) {
          wrapperExplicitPropNames.add(p);
        }
        transientProps = findMatchingPropsInTypeNode(
          explicit,
          (n) => n.startsWith("$") || !!renamedTransientValues?.has(n),
        );
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
    const splicedStyleFnProps = new Set<string>();
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
            splicedStyleFnProps.add(prop);
          }
          styleOnlyConditionProps.delete(prop);
        }
      }
    }
    // When a style-fn prop is spliced out of destructure (so it flows to the
    // base component via `...rest`), any bare-identifier references to it in
    // styleArgs are no longer in scope — TS2304 "Cannot find name 'X'". Rewrite
    // those bare references to `props.X` so the style fn call site keeps
    // working without relying on the (now absent) destructured binding.
    if (splicedStyleFnProps.size > 0) {
      for (const arg of styleArgs) {
        rewriteBarePropIdentifiersToPropsAccess({
          j,
          node: arg,
          propNames: splicedStyleFnProps,
        });
      }
    }

    const localOnlyPropsTypeText = localOnlyComponentWrapperPropsTypeText({
      d,
      emitter,
      allowClassNameProp,
      allowStyleProp,
      exposeSxProp,
      forceClassNameOptional,
      forceStyleOptional,
      functionParamTypeName,
      isPolymorphicComponentWrapper,
      shouldLowerForwardedAs,
    });
    if (localOnlyPropsTypeText) {
      inlineTypeText = localOnlyPropsTypeText;
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
      const [firstPart, ...memberParts] = parts;
      if (!firstPart || memberParts.length === 0) {
        jsxTagName = j.jsxIdentifier(renderedComponent);
      } else {
        type JsxMemberObject = Parameters<typeof j.jsxMemberExpression>[0];
        jsxTagName = memberParts.reduce<JsxMemberObject>(
          (object, member) => j.jsxMemberExpression(object, j.jsxIdentifier(member)),
          j.jsxIdentifier(firstPart),
        );
      }
    } else {
      jsxTagName = j.jsxIdentifier(renderedComponent);
    }

    const ownBridgeClassVar = getBridgeClassVar(d);
    const inheritedBridgeClassVar =
      renderedComponent !== wrappedComponent && wrappedLocalDecl
        ? getBridgeClassVar(wrappedLocalDecl)
        : undefined;
    const hasInheritedBridgeExtraClass =
      !!inheritedBridgeClassVar &&
      (d.extraClassNames ?? []).some(
        (entry) => entry.expr.type === "Identifier" && entry.expr.name === inheritedBridgeClassVar,
      );
    const inheritedBridgeClassNames =
      inheritedBridgeClassVar &&
      inheritedBridgeClassVar !== ownBridgeClassVar &&
      !hasInheritedBridgeExtraClass
        ? [{ expr: j.identifier(inheritedBridgeClassVar) as ExpressionKind }]
        : [];
    const { attrsInfo, staticClassNameExpr } = emitter.splitAttrsInfo(
      d.attrsInfo,
      ownBridgeClassVar,
      inheritedBridgeClassNames.length > 0
        ? [...inheritedBridgeClassNames, ...(d.extraClassNames ?? [])]
        : d.extraClassNames,
    );
    const defaultAttrs = attrsInfo?.defaultAttrs ?? [];
    const dynamicAttrs = attrsInfo?.dynamicAttrs ?? [];
    const staticAttrs = normalizeStaticForwardedAsAttr(
      attrsInfo?.staticAttrs ?? {},
      shouldLowerForwardedAs,
    );
    const attrsSxExpr = wrappedAcceptsSx ? staticSxAttrToExpression(j, staticAttrs.sx) : null;
    const staticAttrsForJsx = attrsSxExpr ? omitStaticAttr(staticAttrs, "sx") : staticAttrs;
    const attrsStaticStyleExpr = attrsInfo?.attrsStaticStyleExpr as ExpressionKind | undefined;
    const needsSxVar =
      allowClassNameProp ||
      allowStyleProp ||
      wrappedAcceptsSx ||
      !!d.inlineStyleProps?.length ||
      !!attrsStaticStyleExpr ||
      !!staticClassNameExpr;
    // Only destructure when we have specific reasons: variant props or className/style support
    // Children flows through naturally via {...props} spread, no explicit handling needed
    // Attrs are handled separately (added as JSX attributes before/after the props spread)
    // Also need to destructure when defaultAttrs exist, to properly handle nullish coalescing
    const needsDestructure =
      destructureProps.length > 0 ||
      needsSxVar ||
      isPolymorphicComponentWrapper ||
      defaultAttrs.length > 0 ||
      dynamicAttrs.length > 0 ||
      shouldLowerForwardedAs;
    const includeChildren =
      !isPolymorphicComponentWrapper && emitter.hasJsxChildrenUsage(d.localName);

    if (needsDestructure) {
      const childrenId = j.identifier("children");
      const classNameId = j.identifier("className");
      const styleId = j.identifier("style");
      const sxId = j.identifier("sx");
      let restId = j.identifier("rest");
      const componentId = j.identifier("Component");
      const forwardedAsId = j.identifier("forwardedAs");
      const wrappedComponentExpr = buildWrappedComponentExpr();

      if (exposeSxProp) {
        styleArgs.push(sxId);
      }
      if (attrsSxExpr) {
        styleArgs.push(attrsSxExpr);
      }

      // Add defaultAttrs props to destructureProps for nullish coalescing patterns
      // (e.g., tabIndex: props.tabIndex ?? 0 needs tabIndex destructured)
      for (const attr of defaultAttrs) {
        if (!destructureProps.includes(attr.jsxProp)) {
          destructureProps.push(attr.jsxProp);
        }
      }
      for (const attr of dynamicAttrs) {
        if (!destructureProps.includes(attr.jsxProp)) {
          destructureProps.push(attr.jsxProp);
        }
      }

      // When the wrapped component is sx-aware and we can use the sx-only path,
      // className/style flow through `{...rest}` unchanged. If extra className
      // expressions or inline styles force explicit merging, bind them locally.
      const canForwardClassNameStyleThroughRest =
        wrappedAcceptsSx &&
        !(staticClassNameExpr || attrsStaticStyleExpr || d.inlineStyleProps?.length);
      const destructureClassName = allowClassNameProp && !canForwardClassNameStyleThroughRest;
      const destructureStyle = allowStyleProp && !canForwardClassNameStyleThroughRest;
      const destructureSx = exposeSxProp;
      // When the wrapper will emit `const theme = useTheme()`, don't also
      // destructure `theme` from props — the redeclaration produces TS2451
      // ("Cannot redeclare block-scoped variable 'theme'"). The theme
      // identifier is owned by the useTheme call site; any `props.theme`
      // references in the original source were already rewritten to use this
      // local `theme` binding.
      const destructurePropsForPattern = needsUseTheme
        ? destructureProps.filter((name) => name !== "theme")
        : destructureProps;
      const passChildrenThroughRest = emitter.shouldPassChildrenThroughRest({
        includeChildren,
        includeRest: true,
        restId,
        destructureProps: destructurePropsForPattern,
        defaultAttrs,
        dynamicAttrs,
        staticAttrs: staticAttrsForJsx,
      });
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
          ...(destructureClassName ? [patternProp("className", classNameId)] : []),
          ...(includeChildren && !passChildrenThroughRest
            ? [patternProp("children", childrenId)]
            : []),
          ...(destructureStyle ? [patternProp("style", styleId)] : []),
          ...(destructureSx ? [patternProp("sx", sxId)] : []),
          ...(shouldLowerForwardedAs ? [patternProp("forwardedAs", forwardedAsId)] : []),
        ],
        destructureProps: destructurePropsForPattern,
        propDefaults,
        includeRest: true,
        restId,
      });
      const usePropsDirectlyForRest =
        patternProps.length === 1 && patternProps[0]?.type === "RestElement";
      if (usePropsDirectlyForRest) {
        restId = propsId;
      }

      const declStmt = usePropsDirectlyForRest
        ? null
        : j.variableDeclaration("const", [
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
        allowSxProp: exposeSxProp,
        inlineStyleProps: (d.inlineStyleProps ?? []) as InlineStyleProp[],
        staticStyleExpr: attrsStaticStyleExpr,
        staticClassNameExpr,
        isIntrinsicElement: false,
        wrappedAcceptsSxProp: wrappedAcceptsSx,
        keepStylePropSeparate: shouldKeepStylePropSeparate(renderedComponent),
      });

      const stmts: StatementKind[] = [];
      if (declStmt) {
        stmts.push(declStmt);
      }
      if (needsUseTheme) {
        stmts.push(buildUseThemeDeclaration(j, emitter.themeHookLocalName));
      }
      if (merging.sxDecl) {
        stmts.push(merging.sxDecl);
      }

      const openingAttrs: JsxAttr[] = [];
      const staticForwardedAsFallbackKey =
        shouldLowerForwardedAs && Object.hasOwn(staticAttrsForJsx, "as")
          ? "as"
          : shouldLowerForwardedAs && Object.hasOwn(staticAttrsForJsx, "forwardedAs")
            ? "forwardedAs"
            : null;
      const hasStaticForwardedAsFallback = staticForwardedAsFallbackKey !== null;
      const staticForwardedAsFallback = hasStaticForwardedAsFallback
        ? staticAttrsForJsx[staticForwardedAsFallbackKey]
        : undefined;
      const staticAttrsWithoutForwardedAsFallback = (() => {
        if (!hasStaticForwardedAsFallback) {
          return staticAttrsForJsx;
        }
        const { [staticForwardedAsFallbackKey]: _omitAs, ...restStaticAttrs } = staticAttrsForJsx;
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
      // NOTE: staticAttrs are added AFTER {...rest} below so they override caller props
      // (matching styled-components semantics where .attrs() values always win).
      const forwardedProps = new Set<string>();
      // Pre-populate with attr names already emitted as JSX attributes above.
      // defaultAttrs are emitted by buildDefaultAttrsFromProps (e.g., column={column ?? true}).
      for (const attr of defaultAttrs) {
        forwardedProps.add(attr.attrName);
      }
      for (const attr of dynamicAttrs) {
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
          if (wrappedAcceptsSx) {
            continue;
          }
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
          !wrapperOnlyTransientProps.includes(propName) &&
          !wrappedAcceptsSx
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
          if (
            observedExpressionConditionDropProps.has(propName) &&
            !baseExplicitProps?.has(propName)
          ) {
            continue;
          }
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
      for (const attr of dynamicAttrs) {
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
      openingAttrs.push(
        ...emitter.buildDynamicAttrsFromProps({
          dynamicAttrs,
          propExprFor: (prop) => j.identifier(prop),
        }),
      );
      // Add staticAttrs from .attrs({...}) AFTER {...rest} so attrs override caller props
      // (styled-components semantics: .attrs() values always win over incoming props).
      openingAttrs.push(
        ...emitter.buildStaticAttrsFromRecord(staticAttrsWithoutForwardedAsFallback, {
          booleanTrueAsShorthand: false,
        }),
      );
      if (shouldLowerForwardedAs) {
        let forwardedAsValueExpr: ExpressionKind = forwardedAsId;
        const staticForwardedAsFallbackExpr =
          hasStaticForwardedAsFallback &&
          (typeof staticForwardedAsFallback === "string" ||
            typeof staticForwardedAsFallback === "number" ||
            typeof staticForwardedAsFallback === "boolean" ||
            staticForwardedAsFallback === null)
            ? j.literal(staticForwardedAsFallback)
            : null;
        if (staticForwardedAsFallbackExpr) {
          forwardedAsValueExpr = j.logicalExpression(
            "??",
            forwardedAsId,
            staticForwardedAsFallbackExpr,
          );
        } else if (renderedAsProp?.propName && restId) {
          forwardedAsValueExpr = j.logicalExpression(
            "??",
            forwardedAsId,
            j.memberExpression(restId, j.identifier(renderedAsProp.propName)),
          );
        }
        openingAttrs.push(
          j.jsxAttribute(j.jsxIdentifier("as"), j.jsxExpressionContainer(forwardedAsValueExpr)),
        );
      }
      emitter.appendMergingAttrs(openingAttrs, merging);

      const jsx = emitter.buildJsxElement({
        tagName: jsxTagName,
        attrs: openingAttrs,
        includeChildren: includeChildren && !passChildrenThroughRest,
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
        ...emitter.buildDynamicAttrsFromProps({
          dynamicAttrs,
          propExprFor: (prop) => j.memberExpression(propsId, j.identifier(prop)),
        }),
      );
      openingAttrs.push(
        ...emitter.buildStaticAttrsFromRecord(staticAttrsForJsx, { booleanTrueAsShorthand: false }),
      );
      // When the wrapped component accepts a StyleX `sx` prop, emit `sx={...}`
      // instead of `{...stylex.props(...)}` so the wrapped component can merge it
      // with className/style it receives from `{...props}`. The caller's `sx` (if
      // any) is composed in by appending `props.sx` to the array — the spread
      // above would otherwise be overwritten by this `sx` attribute.
      if (wrappedAcceptsSx) {
        const composedStyleArgs: ExpressionKind[] = [
          ...styleArgs,
          j.memberExpression(propsId, j.identifier("sx")),
        ];
        const sxExpr = j.arrayExpression(composedStyleArgs);
        openingAttrs.push(j.jsxAttribute(j.jsxIdentifier("sx"), j.jsxExpressionContainer(sxExpr)));
      } else {
        openingAttrs.push(j.jsxSpreadAttribute(stylexPropsCall));
      }

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
              ...(needsUseTheme ? [buildUseThemeDeclaration(j, emitter.themeHookLocalName)] : []),
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
