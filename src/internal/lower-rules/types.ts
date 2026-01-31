import type { StyledDecl } from "../transform-types.js";

export { literalToStaticValue, staticValueToLiteral } from "../utilities/jscodeshift-utils.js";

export function ensureShouldForwardPropDrop(decl: StyledDecl, propName: string): void {
  // Ensure we generate a wrapper so we can consume the styling prop without forwarding it to DOM.
  decl.needsWrapperComponent = true;
  // This is an internally-inferred drop (not user-configured via withConfig).
  decl.shouldForwardPropFromWithConfig = false;
  const existing = decl.shouldForwardProp ?? { dropProps: [] as string[] };
  const dropProps = new Set<string>(existing.dropProps ?? []);
  dropProps.add(propName);
  decl.shouldForwardProp = { ...existing, dropProps: [...dropProps] };
}

export function createTypeInferenceHelpers(args: { root: any; j: any; decl: StyledDecl }): {
  findJsxPropTsType: (jsxProp: string) => unknown;
  findJsxPropTsTypeForVariantExtraction: (jsxProp: string) => unknown;
  annotateParamFromJsxProp: (paramId: any, jsxProp: string) => void;
  isJsxPropOptional: (jsxProp: string) => boolean;
} {
  const { root, j, decl } = args;

  // Helper to find a type declaration by name (interface or type alias)
  const findTypeDeclaration = (typeName: string): { body?: any; typeAnnotation?: any } | null => {
    // Try interface first
    const interfaces = root.find(j.TSInterfaceDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (interfaces.size() > 0) {
      return interfaces.get(0).node;
    }
    // Try type alias
    const typeAliases = root.find(j.TSTypeAliasDeclaration, {
      id: { type: "Identifier", name: typeName },
    } as any);
    if (typeAliases.size() > 0) {
      return typeAliases.get(0).node;
    }
    return null;
  };

  // Helper to find a property type in a type literal
  const findPropertyInTypeLiteral = (typeLiteral: any, propName: string): unknown => {
    for (const m of typeLiteral.members ?? typeLiteral.body ?? []) {
      if (!m || m.type !== "TSPropertySignature") {
        continue;
      }
      const k: any = m.key;
      const name =
        k?.type === "Identifier"
          ? k.name
          : k?.type === "StringLiteral"
            ? k.value
            : k?.type === "Literal" && typeof k.value === "string"
              ? k.value
              : null;
      if (name === propName) {
        return m.typeAnnotation?.typeAnnotation ?? null;
      }
    }
    return null;
  };

  // Resolve a type reference like `Appearance` to its underlying type annotation when possible.
  // This is intentionally narrow: we only unwrap locally-declared aliases/interfaces in this file.
  const resolveTypeReference = (t: any): unknown => {
    if (!t || typeof t !== "object") {
      return t;
    }
    if (t.type !== "TSTypeReference") {
      return t;
    }
    const typeName = t.typeName?.name;
    if (!typeName || typeof typeName !== "string") {
      return t;
    }
    const typeDecl = findTypeDeclaration(typeName);
    if (!typeDecl) {
      return t;
    }
    // If it's a type alias like: type Appearance = "normal" | "small" | ...
    if (typeDecl.typeAnnotation) {
      return typeDecl.typeAnnotation;
    }
    // If it's an interface, keep as-is (caller can inspect members if needed).
    return t;
  };

  // Resolve indexed access types like Props["state"] to their underlying type
  const resolveIndexedAccessType = (indexedAccess: any): unknown => {
    const objectType = indexedAccess.objectType;
    const indexType = indexedAccess.indexType;

    // We only support simple cases: TypeName["propertyName"]
    if (objectType?.type !== "TSTypeReference" || !objectType.typeName?.name) {
      return indexedAccess;
    }
    if (indexType?.type !== "TSLiteralType" || typeof indexType.literal?.value !== "string") {
      return indexedAccess;
    }

    const typeName = objectType.typeName.name;
    const propName = indexType.literal.value;

    const typeDecl = findTypeDeclaration(typeName);
    if (!typeDecl) {
      return indexedAccess;
    }

    // For interfaces, look in body; for type aliases with type literal, look in typeAnnotation
    if (typeDecl.body) {
      return findPropertyInTypeLiteral(typeDecl.body, propName) ?? indexedAccess;
    }
    const typeAnn = typeDecl.typeAnnotation;
    if (typeAnn?.type === "TSTypeLiteral") {
      return findPropertyInTypeLiteral(typeAnn, propName) ?? indexedAccess;
    }

    // Handle intersection types like `IconProps & { state: "up" | "down" | "both" }`
    if (typeAnn?.type === "TSIntersectionType" && Array.isArray(typeAnn.types)) {
      for (const member of typeAnn.types) {
        if (member?.type === "TSTypeLiteral") {
          const result = findPropertyInTypeLiteral(member, propName);
          if (result) {
            return result;
          }
        }
      }
    }

    return indexedAccess;
  };

  // Best-effort inference for prop types from TS type annotations, supporting:
  //   1. Inline type literals: styled.div<{ $width: number; color?: string }>
  //   2. Type references: styled.span<TextColorProps> (looks up the interface)
  //   3. Indexed access types: Props["state"] (resolved to underlying type)
  // We only need enough to choose a better param type for emitted style functions.
  const findJsxPropTsType = (jsxProp: string): unknown => {
    const pt: any = (decl as any).propsType;
    if (!pt) {
      return null;
    }

    // Helper to find prop type in a type literal (interface body)
    const findInTypeLiteral = (typeLiteral: any): unknown => {
      const propType = findPropertyInTypeLiteral(typeLiteral, jsxProp);
      if (!propType) {
        return null;
      }
      // Resolve indexed access types if present
      if ((propType as any).type === "TSIndexedAccessType") {
        return resolveIndexedAccessType(propType);
      }
      return propType;
    };

    // Case 1: Inline type literal - styled.div<{ color: string }>
    if (pt.type === "TSTypeLiteral") {
      return findInTypeLiteral(pt);
    }

    // Case 2: Type reference - styled.span<TextColorProps>
    // Look up the interface definition in the file
    if (pt.type === "TSTypeReference") {
      const typeName = pt.typeName?.name;
      if (typeName && typeof typeName === "string") {
        const typeDecl = findTypeDeclaration(typeName);
        // For interfaces, look in body
        if (typeDecl?.body) {
          return findInTypeLiteral(typeDecl.body);
        }
        // For type aliases, look in typeAnnotation
        const typeAnn = typeDecl?.typeAnnotation;
        if (typeAnn?.type === "TSTypeLiteral") {
          return findInTypeLiteral(typeAnn);
        }
        // Handle React.PropsWithChildren<{...}> and similar wrappers
        // Look for the type parameter which should be a type literal
        if (typeAnn?.type === "TSTypeReference" && typeAnn.typeParameters?.params?.length > 0) {
          const firstParam = typeAnn.typeParameters.params[0];
          if (firstParam?.type === "TSTypeLiteral") {
            return findInTypeLiteral(firstParam);
          }
        }
      }
    }

    return null;
  };

  // Variant extraction wants literal union values, so we *optionally* unwrap local type aliases here.
  // We keep `findJsxPropTsType` returning the original type reference so emitted function param types
  // remain stable (e.g. `$bg: Color` instead of `$bg: "labelBase" | "labelMuted"`).
  const findJsxPropTsTypeForVariantExtraction = (jsxProp: string): unknown => {
    const t: any = findJsxPropTsType(jsxProp);
    if (!t || typeof t !== "object") {
      return t;
    }
    if (t.type === "TSTypeReference") {
      const resolved: any = resolveTypeReference(t);
      // Only unwrap when it resolves to union/literal (so extractUnionLiteralValues can see it)
      if (resolved?.type === "TSUnionType" || resolved?.type === "TSLiteralType") {
        return resolved;
      }
    }
    return t;
  };

  const annotateParamFromJsxProp = (paramId: any, jsxProp: string): void => {
    const t = findJsxPropTsType(jsxProp);
    if (t && typeof t === "object") {
      const typeType = (t as any).type;
      // Special-case numeric props (matches the `$width: number` ask).
      if (typeType === "TSNumberKeyword") {
        (paramId as any).typeAnnotation = j.tsTypeAnnotation(j.tsNumberKeyword());
        return;
      }
      // Preserve type references (e.g., `Colors` from `color: Colors`)
      // This ensures imported types are preserved in the style function signature
      if (
        typeType === "TSTypeReference" ||
        typeType === "TSUnionType" ||
        typeType === "TSLiteralType"
      ) {
        (paramId as any).typeAnnotation = j.tsTypeAnnotation(t);
        return;
      }
    }
    (paramId as any).typeAnnotation = j.tsTypeAnnotation(j.tsStringKeyword());
  };

  // Check if a JSX prop is optional (has ? in its type annotation)
  const isJsxPropOptional = (jsxProp: string): boolean => {
    const pt: any = (decl as any).propsType;
    if (!pt) {
      return false;
    }

    // Helper to check if a property is optional in a type literal
    const checkOptionalInTypeLiteral = (typeLiteral: any): boolean | undefined => {
      for (const m of typeLiteral.members ?? typeLiteral.body ?? []) {
        if (!m || m.type !== "TSPropertySignature") {
          continue;
        }
        const k: any = m.key;
        const name =
          k?.type === "Identifier"
            ? k.name
            : k?.type === "StringLiteral"
              ? k.value
              : k?.type === "Literal" && typeof k.value === "string"
                ? k.value
                : null;
        if (name === jsxProp) {
          return m.optional === true;
        }
      }
      return undefined;
    };

    // Case 1: Inline type literal - styled.div<{ color?: string }>
    if (pt.type === "TSTypeLiteral") {
      return checkOptionalInTypeLiteral(pt) ?? false;
    }

    // Recursive helper to check optionality through type references
    const checkInTypeReference = (typeRef: any): boolean | undefined => {
      if (typeRef?.type !== "TSTypeReference") {
        return undefined;
      }

      // Handle generic wrappers like React.PropsWithChildren<{...}>
      // Check if first type argument is a type literal
      const typeParams = typeRef.typeParameters?.params ?? [];
      if (typeParams.length > 0) {
        const firstArg = typeParams[0];
        if (firstArg?.type === "TSTypeLiteral") {
          const result = checkOptionalInTypeLiteral(firstArg);
          if (result !== undefined) {
            return result;
          }
        }
      }

      // Try looking up the type by name
      const typeName = typeRef.typeName?.name;
      if (typeName && typeof typeName === "string") {
        const typeDecl = findTypeDeclaration(typeName);
        if (typeDecl?.body) {
          return checkOptionalInTypeLiteral(typeDecl.body);
        }
        const typeAnn = typeDecl?.typeAnnotation;
        if (typeAnn?.type === "TSTypeLiteral") {
          return checkOptionalInTypeLiteral(typeAnn);
        }
        // Recursively check if typeAnnotation is another type reference
        if (typeAnn?.type === "TSTypeReference") {
          return checkInTypeReference(typeAnn);
        }
      }

      return undefined;
    };

    // Case 2: Type reference - styled.span<TextColorProps>
    if (pt.type === "TSTypeReference") {
      const result = checkInTypeReference(pt);
      if (result !== undefined) {
        return result;
      }
    }

    return false;
  };

  return {
    findJsxPropTsType,
    findJsxPropTsTypeForVariantExtraction,
    annotateParamFromJsxProp,
    isJsxPropOptional,
  };
}
