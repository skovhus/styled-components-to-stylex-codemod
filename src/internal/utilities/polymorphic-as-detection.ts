/**
 * Utilities for detecting polymorphic `as` prop patterns.
 * Core concepts: destructured defaults and React.ElementType checks.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";

/**
 * Extract the default tag name from a function's destructuring pattern.
 * Looks for: `const { as: Component = "tag", ... } = props;`
 *
 * @param fn - A function AST node (FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)
 * @returns The default tag name string, or null if not found
 */
export const extractDefaultAsTagFromDestructure = (fn: any): string | null => {
  const bodyStmts: any[] = fn?.body?.body ?? [];
  for (const stmt of bodyStmts) {
    if (stmt?.type !== "VariableDeclaration") {
      continue;
    }
    for (const dcl of stmt.declarations ?? []) {
      const id = dcl?.id;
      if (id?.type !== "ObjectPattern") {
        continue;
      }
      for (const prop of id.properties ?? []) {
        if (prop?.type !== "Property" && prop?.type !== "ObjectProperty") {
          continue;
        }
        const key = prop.key;
        if (key?.type !== "Identifier" || key.name !== "as") {
          continue;
        }
        const value = prop.value;
        // { as: Component = "span" }
        if (
          value?.type === "AssignmentPattern" &&
          value.left?.type === "Identifier" &&
          value.left.name === "Component" &&
          value.right?.type === "Literal" &&
          typeof value.right.value === "string"
        ) {
          return value.right.value;
        }
        if (value?.type === "AssignmentPattern" && value.right?.type === "StringLiteral") {
          return value.right.value;
        }
      }
    }
  }
  return null;
};

/**
 * Check if a type node is a reference to React.ElementType or ElementType.
 */
export const isReactElementTypeRef = (typeNode: any): boolean => {
  if (!typeNode || typeNode.type !== "TSTypeReference") {
    return false;
  }
  const typeName = typeNode.typeName;
  // React.ElementType
  if (
    typeName?.type === "TSQualifiedName" &&
    typeName.left?.name === "React" &&
    typeName.right?.name === "ElementType"
  ) {
    return true;
  }
  // ElementType (without React. prefix)
  if (typeName?.type === "Identifier" && typeName.name === "ElementType") {
    return true;
  }
  return false;
};

const collectElementTypeTypeParams = (typeParamsDecl: any): Set<string> => {
  const names = new Set<string>();
  const params: any[] = typeParamsDecl?.params ?? [];
  for (const p of params) {
    const name = p?.name?.type === "Identifier" ? p.name.name : null;
    const constraint = p?.constraint;
    if (name && isReactElementTypeRef(constraint)) {
      names.add(name);
    }
  }
  return names;
};

const isAsPolymorphicMember = (member: any, elementTypeTypeParams: Set<string>): boolean => {
  if (
    member?.type !== "TSPropertySignature" ||
    member.key?.type !== "Identifier" ||
    member.key.name !== "as"
  ) {
    return false;
  }
  const memberType = member.typeAnnotation?.typeAnnotation;
  // as?: React.ElementType
  if (isReactElementTypeRef(memberType)) {
    return true;
  }
  // as?: C where C extends React.ElementType
  if (memberType?.type === "TSTypeReference" && memberType.typeName?.type === "Identifier") {
    return elementTypeTypeParams.has(memberType.typeName.name);
  }
  return false;
};

/**
 * Detect whether a type contains a polymorphic `as` property.
 *
 * Matches:
 * - `as?: React.ElementType` (and `as?: ElementType`)
 * - `as?: C` where `C extends React.ElementType` is declared as a type parameter
 *
 * This is used during analysis to decide whether wrapper generation needs to
 * support polymorphic `as`.
 */
export function typeContainsPolymorphicAs(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  typeNode: any;
}): boolean {
  const { root, j } = args;
  const visit = (
    typeNode: any,
    elementTypeTypeParams: Set<string> = new Set<string>(),
  ): boolean => {
    if (!typeNode) {
      return false;
    }
    if (typeNode.type === "TSIntersectionType") {
      return (typeNode.types ?? []).some((t: any) => visit(t, elementTypeTypeParams));
    }
    if (typeNode.type === "TSParenthesizedType") {
      return visit(typeNode.typeAnnotation, elementTypeTypeParams);
    }
    if (typeNode.type === "TSTypeLiteral") {
      for (const member of typeNode.members ?? []) {
        if (isAsPolymorphicMember(member, elementTypeTypeParams)) {
          return true;
        }
      }
      return false;
    }
    if (typeNode.type === "TSTypeReference") {
      const typeParams = typeNode.typeParameters?.params ?? [];
      for (const tp of typeParams) {
        if (visit(tp, elementTypeTypeParams)) {
          return true;
        }
      }
      if (typeNode.typeName?.type === "Identifier") {
        const typeName = typeNode.typeName.name;
        const typeAlias = root
          .find(j.TSTypeAliasDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (typeAlias.size() > 0) {
          const aliasNode: any = typeAlias.get().node;
          const aliasParams = collectElementTypeTypeParams(aliasNode.typeParameters);
          const merged = new Set<string>([...elementTypeTypeParams, ...aliasParams]);
          return visit(aliasNode.typeAnnotation, merged);
        }
        const iface = root
          .find(j.TSInterfaceDeclaration)
          .filter((p) => (p.node as any).id?.name === typeName);
        if (iface.size() > 0) {
          const ifaceNode: any = iface.get().node;
          const ifaceParams = collectElementTypeTypeParams(ifaceNode.typeParameters);
          const merged = new Set<string>([...elementTypeTypeParams, ...ifaceParams]);
          const body = ifaceNode.body?.body ?? [];
          for (const member of body) {
            if (isAsPolymorphicMember(member, merged)) {
              return true;
            }
          }
        }
      }
    }
    return false;
  };

  return visit(args.typeNode);
}
