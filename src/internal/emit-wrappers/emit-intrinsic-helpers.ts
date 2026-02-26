/**
 * Shared helper utilities and context types for emitting intrinsic wrappers.
 *
 * Intrinsic wrappers are wrappers around intrinsic elements (e.g. div, a, input)
 * generated from styled-components usage. Emission builds AST nodes for these
 * wrappers and their props types.
 */
import type { ASTNode, Collection, Identifier, JSCodeshift, Property } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { ExpressionKind } from "./types.js";
import { SX_PROP_TYPE_TEXT, type WrapperEmitter } from "./wrapper-emitter.js";

export type EmitIntrinsicHelpers = {
  hasForwardedAsUsage: (d: StyledDecl) => boolean;
  withForwardedAsType: (typeText: string, includeForwardedAs: boolean) => string;
  splitForwardedAsStaticAttrs: (args: {
    attrsInfo: StyledDecl["attrsInfo"];
    includeForwardedAs: boolean;
  }) => {
    attrsInfo: StyledDecl["attrsInfo"];
    forwardedAsStaticFallback?: unknown;
  };
  buildForwardedAsValueExpr: (
    forwardedAsId: Identifier,
    forwardedAsStaticFallback?: unknown,
  ) => ExpressionKind;
  emitNamedPropsType: (localName: string, typeExprText: string, genericParams?: string) => boolean;
  emitPropsType: (args: {
    localName: string;
    tagName: string;
    typeText: string;
    allowAsProp: boolean;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    /** When true, there are no custom user-defined props. Skip generating a named type for polymorphic wrappers. */
    hasNoCustomProps?: boolean;
  }) => boolean;
  emitSimplePropsType: (localName: string, typeText: string, allowAsProp: boolean) => boolean;
  canUseSimplePropsType: (args: {
    isExported: boolean;
    usedAttrs: Set<string>;
    isVoidTag?: boolean;
  }) => boolean;
  shouldIncludeRestForProps: (args: {
    usedAsValue: boolean;
    hasLocalUsage: boolean;
    usedAttrs: Set<string>;
    destructureProps: string[];
    hasExplicitPropsToPassThrough?: boolean;
    ignoreTransientAttrs?: boolean;
  }) => boolean;
  buildCompoundVariantExpressions: (
    compoundVariants: NonNullable<StyledDecl["compoundVariants"]>,
    styleArgs: ExpressionKind[],
    destructureProps?: string[],
  ) => void;
  hasElementPropsInDefaultAttrs: (d: StyledDecl) => boolean;
  withSimpleAsPropType: (typeText: string, allowAsProp: boolean, allowSxProp?: boolean) => string;
  polymorphicIntrinsicPropsTypeText: (args: {
    tagName: string;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    includeForwardedAs?: boolean;
    extra?: string | null;
  }) => { typeExprText: string; genericParams: string };
  propsTypeHasExistingPolymorphicAs: (d: StyledDecl) => boolean;
  shouldAllowAsProp: (d: StyledDecl, tagName: string) => boolean;
  asDestructureProp: (tagName: string) => Property;
  emitMinimalWrapper: (args: Parameters<WrapperEmitter["emitMinimalWrapper"]>[0]) => ASTNode[];
};

type EmitIntrinsicHelpersEnv = {
  emitter: WrapperEmitter;
  root: Collection<ASTNode>;
  j: JSCodeshift;
  stylesIdentifier: string;
  emitNamedPropsType: (localName: string, typeExprText: string, genericParams?: string) => boolean;
  markNeedsReactTypeImport: () => void;
};

export type EmitIntrinsicContext = {
  emitter: WrapperEmitter;
  j: JSCodeshift;
  emitTypes: boolean;
  wrapperDecls: StyledDecl[];
  wrapperNames: Set<string>;
  stylesIdentifier: string;
  patternProp: WrapperEmitter["patternProp"];
  emitted: ASTNode[];
  markNeedsReactTypeImport: () => void;
  markNeedsUseThemeImport: () => void;
  helpers: EmitIntrinsicHelpers;
};

export function createEmitIntrinsicHelpers(env: EmitIntrinsicHelpersEnv): EmitIntrinsicHelpers {
  const { emitter, root, j, stylesIdentifier, emitNamedPropsType, markNeedsReactTypeImport } = env;

  const FORWARDED_AS_TYPE = "{ forwardedAs?: React.ElementType }";

  const hasForwardedAsUsage = (d: StyledDecl): boolean => emitter.hasForwardedAsUsage(d.localName);

  const withForwardedAsType = (typeText: string, includeForwardedAs: boolean): string =>
    includeForwardedAs ? emitter.joinIntersection(typeText, FORWARDED_AS_TYPE) : typeText;

  const splitForwardedAsStaticAttrs = (args: {
    attrsInfo: StyledDecl["attrsInfo"];
    includeForwardedAs: boolean;
  }): {
    attrsInfo: StyledDecl["attrsInfo"];
    forwardedAsStaticFallback?: unknown;
  } => {
    const { attrsInfo, includeForwardedAs } = args;
    if (!attrsInfo || !includeForwardedAs) {
      return { attrsInfo, forwardedAsStaticFallback: undefined };
    }
    const staticAttrs = attrsInfo.staticAttrs ?? {};
    if (!Object.hasOwn(staticAttrs, "as")) {
      return { attrsInfo, forwardedAsStaticFallback: undefined };
    }
    const { as, ...restStaticAttrs } = staticAttrs;
    return {
      attrsInfo: {
        ...attrsInfo,
        staticAttrs: restStaticAttrs,
      },
      forwardedAsStaticFallback: as,
    };
  };

  const buildForwardedAsValueExpr = (
    forwardedAsId: Identifier,
    forwardedAsStaticFallback?: unknown,
  ): ExpressionKind => {
    if (forwardedAsStaticFallback === undefined) {
      return forwardedAsId;
    }
    if (
      typeof forwardedAsStaticFallback !== "string" &&
      typeof forwardedAsStaticFallback !== "number" &&
      typeof forwardedAsStaticFallback !== "boolean" &&
      forwardedAsStaticFallback !== null
    ) {
      return forwardedAsId;
    }
    const fallbackExpr = j.literal(forwardedAsStaticFallback);
    return j.logicalExpression("??", forwardedAsId, fallbackExpr);
  };

  /**
   * Check if a component can use simpler PropsWithChildren type instead of
   * verbose intersection type with element props. This is true when:
   * - Component is not exported
   * - Only uses transient props ($-prefixed) and children
   */
  const canUseSimplePropsType = (args: {
    isExported: boolean;
    usedAttrs: Set<string>;
    isVoidTag?: boolean;
  }): boolean => {
    const { isExported, usedAttrs, isVoidTag = false } = args;
    if (isExported || isVoidTag) {
      return false;
    }
    const hasOnlyTransientCustomProps =
      !usedAttrs.has("*") && [...usedAttrs].every((n) => n === "children" || n.startsWith("$"));
    return hasOnlyTransientCustomProps;
  };

  const shouldIncludeRestForProps = (args: {
    usedAsValue: boolean;
    hasLocalUsage: boolean;
    usedAttrs: Set<string>;
    destructureProps: string[];
    hasExplicitPropsToPassThrough?: boolean;
    ignoreTransientAttrs?: boolean;
  }): boolean => {
    const {
      usedAsValue,
      hasLocalUsage,
      usedAttrs,
      destructureProps,
      hasExplicitPropsToPassThrough,
      ignoreTransientAttrs = false,
    } = args;
    let shouldIncludeRest =
      usedAsValue ||
      Boolean(hasExplicitPropsToPassThrough) ||
      (hasLocalUsage && usedAttrs.has("*")) ||
      (hasLocalUsage &&
        [...usedAttrs].some((n) => {
          if (
            n === "children" ||
            n === "className" ||
            n === "style" ||
            n === "as" ||
            n === "forwardedAs" ||
            (ignoreTransientAttrs && n.startsWith("$"))
          ) {
            return false;
          }
          return !destructureProps.includes(n);
        }));
    const hasOnlyTransientAttrs =
      !usedAttrs.has("*") && usedAttrs.size > 0 && [...usedAttrs].every((n) => n.startsWith("$"));
    if (!usedAsValue && hasOnlyTransientAttrs) {
      shouldIncludeRest = false;
    }
    return shouldIncludeRest;
  };

  /**
   * Build compound variant expressions for multi-prop nested ternaries.
   * Generates: outerProp ? styles.outerKey : innerProp ? styles.innerTrueKey : styles.innerFalseKey
   *
   * @param compoundVariants - Array of compound variant configurations
   * @param styleArgs - Array to push generated expressions into
   * @param destructureProps - Optional array to track props that need destructuring
   */
  const buildCompoundVariantExpressions = (
    compoundVariants: NonNullable<StyledDecl["compoundVariants"]>,
    styleArgs: ExpressionKind[],
    destructureProps?: string[],
  ): void => {
    for (const cv of compoundVariants) {
      // Add props to destructure list
      if (destructureProps) {
        if (!destructureProps.includes(cv.outerProp)) {
          destructureProps.push(cv.outerProp);
        }
        if (!destructureProps.includes(cv.innerProp)) {
          destructureProps.push(cv.innerProp);
        }
      }

      // Build: outerProp ? styles.outerKey : innerProp ? styles.innerTrueKey : styles.innerFalseKey
      const outerPropId = j.identifier(cv.outerProp);
      const innerPropId = j.identifier(cv.innerProp);
      const outerStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.outerTruthyKey),
      );
      const innerTrueStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.innerTruthyKey),
      );
      const innerFalseStyle = j.memberExpression(
        j.identifier(stylesIdentifier),
        j.identifier(cv.innerFalsyKey),
      );

      // Build inner ternary: innerProp ? innerTrueStyle : innerFalseStyle
      const innerTernary = j.conditionalExpression(innerPropId, innerTrueStyle, innerFalseStyle);

      // Build outer ternary: outerProp ? outerStyle : innerTernary
      const outerTernary = j.conditionalExpression(outerPropId, outerStyle, innerTernary);

      styleArgs.push(outerTernary);
    }
  };

  /**
   * Check if defaultAttrs references element props (non-$-prefixed props).
   * When attrs like `tabIndex: props.tabIndex ?? 0` are used, the jsxProp is "tabIndex"
   * which is an element prop that needs to be included in the type.
   */
  const hasElementPropsInDefaultAttrs = (d: StyledDecl): boolean => {
    const defaultAttrs = d.attrsInfo?.defaultAttrs ?? [];
    return defaultAttrs.some((a) => a.jsxProp && !a.jsxProp.startsWith("$"));
  };

  // Builds a combined `{ sx?: ...; as?: C }` literal for the extra props that
  // the wrapper adds beyond what the base element/component type provides.
  const buildExtraPropLiteral = (allowAsProp: boolean, allowSxProp?: boolean): string | null => {
    const parts: string[] = [];
    if (allowSxProp) {
      parts.push(SX_PROP_TYPE_TEXT);
    }
    if (allowAsProp) {
      parts.push("as?: C");
    }
    return parts.length > 0 ? `{ ${parts.join("; ")} }` : null;
  };

  // Adds `as?: C` (and optionally `sx`) to a props type.
  // Used for non-exported components and simple wrappers with polymorphic as support.
  const mergeAsIntoPropsWithChildren = (typeText: string, extraProps: string): string | null => {
    const prefix = "React.PropsWithChildren<";
    if (!typeText.trim().startsWith(prefix) || !typeText.trim().endsWith(">")) {
      return null;
    }
    const inner = typeText.trim().slice(prefix.length, -1).trim();
    // Extract content from { ... } to merge
    const extraInner = extraProps.trim();
    const extraBody =
      extraInner.startsWith("{") && extraInner.endsWith("}")
        ? extraInner.slice(1, -1).trim().replace(/;$/, "").trim()
        : null;
    if (!extraBody) {
      return null;
    }
    if (inner === "{}") {
      return `${prefix}{ ${extraBody} }>`;
    }
    if (inner.startsWith("{") && inner.endsWith("}")) {
      let body = inner.slice(1, -1).trim();
      if (body.endsWith(";")) {
        body = body.slice(0, -1).trim();
      }
      const merged = body.length > 0 ? `${body}; ${extraBody}` : extraBody;
      return `${prefix}{ ${merged} }>`;
    }
    return null;
  };

  const withSimpleAsPropType = (
    typeText: string,
    allowAsProp: boolean,
    allowSxProp?: boolean,
  ): string => {
    const extraLiteral = buildExtraPropLiteral(allowAsProp, allowSxProp);
    if (!extraLiteral) {
      return typeText;
    }
    const merged = mergeAsIntoPropsWithChildren(typeText, extraLiteral);
    if (merged) {
      return merged;
    }
    return emitter.joinIntersection(typeText, extraLiteral);
  };

  const polymorphicIntrinsicPropsTypeText = (args: {
    tagName: string;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    includeForwardedAs?: boolean;
    extra?: string | null;
  }): { typeExprText: string; genericParams: string } => {
    const { tagName, allowClassNameProp, allowStyleProp, allowSxProp, includeForwardedAs, extra } =
      args;
    const genericParams = `C extends React.ElementType = "${tagName}"`;

    // Simple polymorphic pattern:
    // React.ComponentPropsWithRef<C> & { customProps; as?: C }
    // Note: Custom props come AFTER base to ensure they override any conflicting types
    // Omit className/style when not allowed
    const omitted: string[] = [];
    if (!allowClassNameProp) {
      omitted.push('"className"');
    }
    if (!allowStyleProp) {
      omitted.push('"style"');
    }
    const base =
      omitted.length > 0
        ? `Omit<React.ComponentPropsWithRef<C>, ${omitted.join(" | ")}>`
        : "React.ComponentPropsWithRef<C>";
    const forwardedAsPart = includeForwardedAs ? ` & ${FORWARDED_AS_TYPE}` : "";
    const sxPropPart = allowSxProp ? `${SX_PROP_TYPE_TEXT}; ` : "";
    if (extra) {
      // Omit as from extra since we're adding our own as?: C
      const extraWithoutAs = `Omit<${extra}, "as">`;
      // Combine: base props, then custom props (overriding), then polymorphic as + sx
      const typeExprText = `${base} & ${extraWithoutAs} & { ${sxPropPart}as?: C }${forwardedAsPart}`;
      return { typeExprText, genericParams };
    }
    // Just element props with as?: C (and optional sx)
    const typeExprText = `${base} & { ${sxPropPart}as?: C }${forwardedAsPart}`;
    return { typeExprText, genericParams };
  };

  // Helper to check if a props type already has `as?: React.ElementType` which means
  // it was designed for polymorphism and shouldn't be upgraded to our generic pattern
  // (doing so can cause TypeScript inference issues with custom props)
  const propsTypeHasExistingPolymorphicAs = (d: StyledDecl): boolean => {
    if (!d.propsType) {
      return false;
    }
    const typeName = emitter.propsTypeNameFor(d.localName);
    // Check type aliases in the file
    let hasExistingAs = false;
    root
      .find(j.TSTypeAliasDeclaration, { id: { type: "Identifier", name: typeName } } as any)
      .forEach((p: any) => {
        const alias = p.node as any;
        const existingText = alias.typeAnnotation ? j(alias.typeAnnotation).toSource() : "";
        // Look for `as?:` or `as:` pattern in the type text
        if (/\bas\s*[?:]/.test(existingText)) {
          hasExistingAs = true;
        }
      });
    return hasExistingAs;
  };

  const shouldAllowAsProp = (d: StyledDecl, tagName: string): boolean => {
    // Don't make polymorphic if the props type already has its own `as?: React.ElementType`
    // because upgrading to our generic pattern can cause TypeScript inference issues
    if (propsTypeHasExistingPolymorphicAs(d)) {
      return false;
    }
    return emitter.shouldAllowAsPropForIntrinsic(d, tagName);
  };

  const asDestructureProp = (tagName: string) =>
    j.property.from({
      kind: "init",
      key: j.identifier("as"),
      value: j.assignmentPattern(j.identifier("Component"), j.literal(tagName)),
      shorthand: false,
    });

  const emitPropsType = (args: {
    localName: string;
    tagName: string;
    typeText: string;
    allowAsProp: boolean;
    allowClassNameProp: boolean;
    allowStyleProp: boolean;
    allowSxProp?: boolean;
    /** When true, there are no custom user-defined props. Skip generating a named type for polymorphic wrappers. */
    hasNoCustomProps?: boolean;
  }): boolean => {
    const {
      localName,
      tagName,
      typeText,
      allowAsProp,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      hasNoCustomProps,
    } = args;
    if (!allowAsProp) {
      const typeAliasEmitted = emitNamedPropsType(localName, typeText);
      markNeedsReactTypeImport();
      return typeAliasEmitted;
    }

    // When there are no custom props, skip generating a named type.
    // The function parameter will use inline `React.ComponentPropsWithRef<C> & { as?: C }`.
    if (hasNoCustomProps) {
      markNeedsReactTypeImport();
      return false; // No type alias emitted - caller should use inline type
    }

    const poly = polymorphicIntrinsicPropsTypeText({
      tagName,
      allowClassNameProp,
      allowStyleProp,
      allowSxProp,
      extra: typeText,
    });
    // Try to emit a named props type. If it already exists (user-defined), the inline
    // function parameter will use the intersection pattern instead.
    const typeAliasEmitted = emitNamedPropsType(localName, poly.typeExprText, poly.genericParams);
    markNeedsReactTypeImport();
    return typeAliasEmitted;
  };

  // Simple (non-polymorphic) props type emission - adds `as?: React.ElementType` without generics.
  // Used for non-exported wrappers that support `as` but don't need the full polymorphic pattern.
  // Note: We do NOT modify existing user-defined types to add `as`. The `as` prop should only
  // be part of the inline function parameter type, not the original type definition.
  const emitSimplePropsType = (
    localName: string,
    typeText: string,
    allowAsProp: boolean,
  ): boolean => {
    const finalTypeText = withSimpleAsPropType(typeText, allowAsProp);
    const typeAliasEmitted = emitNamedPropsType(localName, finalTypeText);
    markNeedsReactTypeImport();
    return typeAliasEmitted;
  };

  const emitMinimalWrapper = (
    args: Parameters<WrapperEmitter["emitMinimalWrapper"]>[0],
  ): ASTNode[] => emitter.emitMinimalWrapper(args);

  return {
    hasForwardedAsUsage,
    withForwardedAsType,
    splitForwardedAsStaticAttrs,
    buildForwardedAsValueExpr,
    emitNamedPropsType,
    emitPropsType,
    emitSimplePropsType,
    canUseSimplePropsType,
    shouldIncludeRestForProps,
    buildCompoundVariantExpressions,
    hasElementPropsInDefaultAttrs,
    withSimpleAsPropType,
    polymorphicIntrinsicPropsTypeText,
    propsTypeHasExistingPolymorphicAs,
    shouldAllowAsProp,
    asDestructureProp,
    emitMinimalWrapper,
  };
}
