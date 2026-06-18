/**
 * Resolves the explicit prop names declared by a component's props type.
 *
 * Extracted from {@link WrapperEmitter} as a free function: it depends only on
 * the AST root and the jscodeshift API, not on emitter instance state.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";

type AstNodeOrNull = ASTNode | null | undefined;
type ResolvedTypeKeyNames = Set<string> | null;

export function getExplicitPropNames(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  propsType: AstNodeOrNull,
  options?: { lookThroughPropsWithChildren?: boolean },
): Set<string> {
  const typeParamsFor = (type: AstNodeOrNull): AstNodeOrNull[] => {
    const params = (type as any)?.typeParameters?.params ?? (type as any)?.typeArguments?.params;
    return (params ?? []) as AstNodeOrNull[];
  };

  const typeReferenceName = (type: AstNodeOrNull): string | null => {
    if (!type || type.type !== "TSTypeReference") {
      return null;
    }
    const stringifyName = (nameNode: AstNodeOrNull): string | null => {
      if (!nameNode) {
        return null;
      }
      if (nameNode.type === "Identifier") {
        return nameNode.name;
      }
      if (nameNode.type === "TSQualifiedName") {
        const left = stringifyName((nameNode as any).left);
        const right = stringifyName((nameNode as any).right);
        return left && right ? `${left}.${right}` : null;
      }
      return null;
    };
    return stringifyName((type as any).typeName);
  };

  const typeAliasInfoFor = (
    typeName: string,
    visitedTypeNames: ReadonlySet<string>,
  ): { typeAnnotation: AstNodeOrNull; typeParamNames: string[] } | null => {
    if (visitedTypeNames.has(typeName)) {
      return null;
    }
    const typeAlias = root
      .find(j.TSTypeAliasDeclaration)
      .filter((p) => (p.node as any).id?.name === typeName);
    if (typeAlias.size() === 0) {
      return null;
    }
    const node = typeAlias.get().node as {
      typeAnnotation: AstNodeOrNull;
      typeParameters?: { params?: Array<{ name?: string }> };
    };
    const typeParamNames = (node.typeParameters?.params ?? [])
      .map((param) => param.name)
      .filter((name): name is string => typeof name === "string");
    return { typeAnnotation: node.typeAnnotation, typeParamNames };
  };

  const bindTypeParams = (
    typeParamNames: readonly string[],
    typeArgs: readonly AstNodeOrNull[],
    parentBindings: ReadonlyMap<string, AstNodeOrNull>,
  ): Map<string, AstNodeOrNull> => {
    const bindings = new Map(parentBindings);
    for (let i = 0; i < typeParamNames.length; i++) {
      const typeArg = typeArgs[i];
      if (typeArg) {
        bindings.set(typeParamNames[i]!, typeArg);
      }
    }
    return bindings;
  };

  const resolveBoundTypeParam = (
    type: AstNodeOrNull,
    typeParamBindings: ReadonlyMap<string, AstNodeOrNull>,
  ): AstNodeOrNull => {
    const typeName = typeReferenceName(type);
    if (!typeName || typeName.includes(".")) {
      return type;
    }
    return typeParamBindings.get(typeName) ?? type;
  };

  const literalStringNames = (
    type: AstNodeOrNull,
    visitedTypeNames = new Set<string>(),
    typeParamBindings = new Map<string, AstNodeOrNull>(),
  ): ResolvedTypeKeyNames => {
    const names = new Set<string>();
    const collect = (node: AstNodeOrNull): boolean => {
      if (!node) {
        return false;
      }
      if (node.type === "TSUnionType") {
        for (const part of (node as any).types ?? []) {
          if (!collect(part)) {
            return false;
          }
        }
        return true;
      }
      if (node.type === "TSParenthesizedType") {
        return collect((node as any).typeAnnotation);
      }
      if (node.type === "TSTypeOperator" && (node as any).operator === "keyof") {
        const targetType = resolveBoundTypeParam((node as any).typeAnnotation, typeParamBindings);
        const targetNames = extractFromType(targetType, visitedTypeNames, typeParamBindings);
        if (targetNames.size === 0) {
          return false;
        }
        for (const name of targetNames) {
          names.add(name);
        }
        return true;
      }
      const boundTypeParam = resolveBoundTypeParam(node, typeParamBindings);
      if (boundTypeParam !== node) {
        return collect(boundTypeParam);
      }
      const referencedTypeName = typeReferenceName(node);
      if (referencedTypeName && !referencedTypeName.includes(".")) {
        const aliasInfo = typeAliasInfoFor(referencedTypeName, visitedTypeNames);
        if (!aliasInfo) {
          return false;
        }
        const nextVisitedTypeNames = new Set(visitedTypeNames);
        nextVisitedTypeNames.add(referencedTypeName);
        const aliasBindings = bindTypeParams(
          aliasInfo.typeParamNames,
          typeParamsFor(node),
          typeParamBindings,
        );
        const aliasNames = literalStringNames(
          aliasInfo.typeAnnotation,
          nextVisitedTypeNames,
          aliasBindings,
        );
        if (!aliasNames) {
          return false;
        }
        for (const name of aliasNames) {
          names.add(name);
        }
        return true;
      }
      if (node.type !== "TSLiteralType") {
        return false;
      }
      const literal = (node as any).literal;
      const value =
        literal?.type === "StringLiteral" || literal?.type === "Literal"
          ? literal.value
          : undefined;
      if (typeof value !== "string") {
        return false;
      }
      names.add(value);
      return true;
    };
    return collect(type) ? names : null;
  };

  const extractFromLiteral = (literal: AstNodeOrNull): Set<string> => {
    const names = new Set<string>();
    if (!literal || literal.type !== "TSTypeLiteral") {
      return names;
    }
    for (const member of (literal as any).members ?? []) {
      if (member?.type !== "TSPropertySignature") {
        continue;
      }
      const key = member.key;
      const name =
        key?.type === "Identifier"
          ? key.name
          : key?.type === "StringLiteral"
            ? key.value
            : key?.type === "Literal" && typeof key.value === "string"
              ? key.value
              : null;
      if (name) {
        names.add(name);
      }
    }
    return names;
  };

  const extractFromType = (
    type: AstNodeOrNull,
    visitedTypeNames = new Set<string>(),
    typeParamBindings = new Map<string, AstNodeOrNull>(),
  ): Set<string> => {
    const names = new Set<string>();
    const merge = (next: Set<string>): void => {
      for (const name of next) {
        names.add(name);
      }
    };
    type = resolveBoundTypeParam(type, typeParamBindings);
    if (!type) {
      return names;
    }
    if (type.type === "TSTypeLiteral") {
      return extractFromLiteral(type);
    }
    if (type.type === "TSIntersectionType") {
      for (const t of (type as any).types ?? []) {
        merge(extractFromType(t, new Set(visitedTypeNames), typeParamBindings));
      }
      return names;
    }
    if (type.type === "TSUnionType") {
      let sharedNames: Set<string> | null = null;
      for (const t of (type as any).types ?? []) {
        const branchNames = extractFromType(t, new Set(visitedTypeNames), typeParamBindings);
        if (sharedNames === null) {
          sharedNames = new Set(branchNames);
        } else {
          for (const name of sharedNames) {
            if (!branchNames.has(name)) {
              sharedNames.delete(name);
            }
          }
        }
      }
      return sharedNames ?? names;
    }
    if (type.type === "TSParenthesizedType") {
      return extractFromType((type as any).typeAnnotation, visitedTypeNames, typeParamBindings);
    }
    if (type.type !== "TSTypeReference") {
      return names;
    }

    const typeName = typeReferenceName(type);
    const params = typeParamsFor(type);
    if (!typeName) {
      return names;
    }

    if (typeName === "Omit" && params[0]) {
      merge(extractFromType(params[0], new Set(visitedTypeNames), typeParamBindings));
      const omitted = literalStringNames(params[1], new Set(visitedTypeNames), typeParamBindings);
      if (!omitted) {
        return new Set<string>();
      }
      for (const name of omitted) {
        names.delete(name);
      }
      return names;
    }
    if (typeName === "Pick" && params[1]) {
      return (
        literalStringNames(params[1], new Set(visitedTypeNames), typeParamBindings) ??
        new Set<string>()
      );
    }

    if (
      typeName === "React.PropsWithChildren" ||
      typeName === "PropsWithChildren" ||
      typeName === "Partial" ||
      typeName === "Required" ||
      typeName === "Readonly"
    ) {
      if (
        params[0] &&
        (typeName !== "React.PropsWithChildren" && typeName !== "PropsWithChildren"
          ? true
          : options?.lookThroughPropsWithChildren === true)
      ) {
        merge(extractFromType(params[0], new Set(visitedTypeNames), typeParamBindings));
      }
      if (typeName === "React.PropsWithChildren" || typeName === "PropsWithChildren") {
        names.add("children");
      }
      return names;
    }

    if (!typeName.includes(".")) {
      if (visitedTypeNames.has(typeName)) {
        return names;
      }
      const nextVisitedTypeNames = new Set(visitedTypeNames);
      nextVisitedTypeNames.add(typeName);
      const interfaceDecl = root
        .find(j.TSInterfaceDeclaration)
        .filter((p) => (p.node as any).id?.name === typeName);
      if (interfaceDecl.size() > 0) {
        const body = interfaceDecl.get().node.body?.body ?? [];
        for (const member of body) {
          if (member?.type !== "TSPropertySignature") {
            continue;
          }
          const key = member.key;
          const name = key?.type === "Identifier" ? key.name : null;
          if (name) {
            names.add(name);
          }
        }
      }
      const typeAliasInfo = typeAliasInfoFor(typeName, visitedTypeNames);
      if (typeAliasInfo) {
        const aliasBindings = bindTypeParams(
          typeAliasInfo.typeParamNames,
          params,
          typeParamBindings,
        );
        merge(extractFromType(typeAliasInfo.typeAnnotation, nextVisitedTypeNames, aliasBindings));
      }
      return names;
    }

    for (const param of params) {
      merge(extractFromType(param, new Set(visitedTypeNames), typeParamBindings));
    }
    return names;
  };

  return extractFromType(propsType);
}
