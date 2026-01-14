import type { StyledDecl } from "../transform-types.js";

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

export function literalToStaticValue(node: any): string | number | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  if (node.type === "StringLiteral") {
    return node.value;
  }
  if (node.type === "NumericLiteral") {
    return node.value;
  }
  // Support recast "Literal" nodes when parser produces them.
  if (
    node.type === "Literal" &&
    (typeof node.value === "string" || typeof node.value === "number")
  ) {
    return node.value;
  }
  return null;
}

export function createTypeInferenceHelpers(args: { root: any; j: any; decl: StyledDecl }): {
  findJsxPropTsType: (jsxProp: string) => unknown;
  annotateParamFromJsxProp: (paramId: any, jsxProp: string) => void;
} {
  const { root, j, decl } = args;

  // Best-effort inference for prop types from TS type annotations, supporting:
  //   1. Inline type literals: styled.div<{ $width: number; color?: string }>
  //   2. Type references: styled.span<TextColorProps> (looks up the interface)
  // We only need enough to choose a better param type for emitted style functions.
  const findJsxPropTsType = (jsxProp: string): unknown => {
    const pt: any = (decl as any).propsType;
    if (!pt) {
      return null;
    }

    // Helper to find prop type in a type literal (interface body)
    const findInTypeLiteral = (typeLiteral: any): unknown => {
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
        if (name !== jsxProp) {
          continue;
        }
        return m.typeAnnotation?.typeAnnotation ?? null;
      }
      return null;
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
        // Find the interface with this name
        const interfaces = root.find(j.TSInterfaceDeclaration, {
          id: { type: "Identifier", name: typeName },
        } as any);
        if (interfaces.size() > 0) {
          const iface = interfaces.get(0).node;
          return findInTypeLiteral(iface.body);
        }
      }
    }

    return null;
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

  return { findJsxPropTsType, annotateParamFromJsxProp };
}
