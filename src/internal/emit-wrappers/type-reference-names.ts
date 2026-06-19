/**
 * Low-level helpers for inspecting TypeScript type-reference AST nodes.
 * These primitives resolve type-reference names, walk type AST nodes, and
 * detect React utility/props types without depending on the wrapper emitter.
 */
import type { ASTNode } from "jscodeshift";
import jscodeshift from "jscodeshift";
import { isReactComponentPropsUtilityName } from "../utilities/jscodeshift-utils.js";

export type TypeReferenceName =
  | { kind: "identifier"; name: string }
  | { kind: "qualified"; namespace: string; name: string };

export function isPropsWithChildrenType(type: ASTNode): boolean {
  if (type.type !== "TSTypeReference") {
    return false;
  }
  const typeName = (type as { typeName?: AstNodeOrQualifiedName }).typeName;
  if (typeName?.type === "Identifier") {
    return typeName.name === "PropsWithChildren";
  }
  return (
    typeName?.type === "TSQualifiedName" &&
    typeName.left.type === "Identifier" &&
    typeName.left.name === "React" &&
    typeName.right.type === "Identifier" &&
    typeName.right.name === "PropsWithChildren"
  );
}

export function getTypeReferenceParams(type: ASTNode): ASTNode[] {
  const typed = type as {
    typeParameters?: { params?: ASTNode[] };
    typeArguments?: { params?: ASTNode[] };
  };
  return typed.typeParameters?.params ?? typed.typeArguments?.params ?? [];
}

export function getUtilitySourceTypeParams(type: ASTNode): ASTNode[] | null {
  if (!isUtilityTypeReference(resolveTypeReferenceName(type))) {
    return null;
  }
  const sourceType = getTypeReferenceParams(type)[0];
  return sourceType ? [sourceType] : [];
}

export function typeKeyName(key: unknown): string | undefined {
  const keyNode = key as { type?: string; name?: string; value?: unknown } | undefined;
  return keyNode?.type === "Identifier"
    ? keyNode.name
    : typeof keyNode?.value === "string"
      ? keyNode.value
      : undefined;
}

export function resolveTypeIdentifierName(type: ASTNode | null): string | null {
  if (type?.type !== "TSTypeReference") {
    return null;
  }
  const typeName = (type as { typeName?: { type?: string; name?: string } }).typeName;
  return typeName?.type === "Identifier" ? (typeName.name ?? null) : null;
}

export function resolveTypeReferenceName(type: ASTNode | null): TypeReferenceName | null {
  if (type?.type !== "TSTypeReference") {
    return null;
  }
  const typeName = (type as { typeName?: TypeReferenceNameNode }).typeName;
  return getTypeReferenceName(typeName);
}

export function typeReferenceIsComponentPropsOfWrapped(
  type: ASTNode,
  wrappedComponent: string,
): boolean {
  if (type.type !== "TSTypeReference") {
    return false;
  }
  const node = type as {
    typeName?: TypeReferenceNameNode;
    typeParameters?: { params?: ASTNode[] };
  };
  const typeName = getTypeReferenceName(node.typeName);
  if (!typeName) {
    return false;
  }
  const isComponentProps =
    (typeName.kind === "identifier" && isReactComponentPropsUtilityName(typeName.name)) ||
    (typeName.kind === "qualified" &&
      typeName.namespace === "React" &&
      isReactComponentPropsUtilityName(typeName.name));
  if (!isComponentProps) {
    return false;
  }
  return (node.typeParameters?.params ?? []).some((param) => {
    const query = param as { type?: string; exprName?: unknown };
    return (
      query.type === "TSTypeQuery" &&
      getTypeQueryExpressionName(query.exprName) === wrappedComponent
    );
  });
}

export function propsTypeOmitsProp(propsType: ASTNode | undefined, propName: string): boolean {
  if (!propsType) {
    return false;
  }
  let found = false;
  visitAst(propsType, (node) => {
    if (found || node.type !== "TSTypeReference") {
      return;
    }
    const typeReference = node as {
      typeName?: TypeReferenceNameNode;
      typeParameters?: { params?: ASTNode[] };
    };
    const typeName = getTypeReferenceName(typeReference.typeName);
    if (typeName?.kind !== "identifier" || typeName.name !== "Omit") {
      return;
    }
    if (
      (typeReference.typeParameters?.params ?? []).some((param) =>
        typeNodeContainsStringLiteral(param, propName),
      )
    ) {
      found = true;
    }
  });
  return found;
}

export function createTypeReferenceFromName(
  j: typeof jscodeshift,
  typeName: TypeReferenceName,
): ASTNode {
  if (typeName.kind === "identifier") {
    return j.tsTypeReference(j.identifier(typeName.name)) as ASTNode;
  }
  return j.tsTypeReference(
    j.tsQualifiedName(j.identifier(typeName.namespace), j.identifier(typeName.name)),
  ) as ASTNode;
}

export function typeReferenceNameKey(typeName: TypeReferenceName): string {
  return typeName.kind === "identifier" ? typeName.name : `${typeName.namespace}.${typeName.name}`;
}

export function getModuleName(node: unknown): string | null {
  const typed = node as { type?: string; name?: string; value?: unknown } | null | undefined;
  if (!typed) {
    return null;
  }
  if (typed.type === "Identifier" && typed.name) {
    return typed.name;
  }
  return typeof typed.value === "string" ? typed.value : null;
}

export function membersExposeProp(members: unknown[] | undefined, propName: string): boolean {
  return (members ?? []).some((member) => {
    const typed = member as {
      type?: string;
      key?: { type?: string; name?: string; value?: unknown };
    };
    if (typed.type !== "TSPropertySignature") {
      return false;
    }
    if (typed.key?.type === "Identifier") {
      return typed.key.name === propName;
    }
    return typeof typed.key?.value === "string" && typed.key.value === propName;
  });
}

export function getHeritageTypeReferenceName(heritage: unknown): TypeReferenceName | null {
  if (!heritage || typeof heritage !== "object") {
    return null;
  }
  const node = heritage as {
    expression?: TypeReferenceNameNode;
    typeName?: TypeReferenceNameNode;
  };
  return getTypeReferenceName(node.expression) ?? getTypeReferenceName(node.typeName);
}

function isUtilityTypeReference(typeName: TypeReferenceName | null): boolean {
  if (!typeName) {
    return false;
  }
  if (typeName.kind === "qualified") {
    return typeName.namespace === "React" && typeName.name === "PropsWithChildren";
  }
  return ["PropsWithChildren", "Partial", "Required", "Readonly", "Omit", "Pick"].includes(
    typeName.name,
  );
}

function getTypeQueryExpressionName(exprName: unknown): string | null {
  const node = exprName as
    | {
        type?: string;
        name?: string;
        left?: unknown;
        right?: unknown;
      }
    | null
    | undefined;
  if (!node) {
    return null;
  }
  if (node.type === "Identifier" && node.name) {
    return node.name;
  }
  if (node.type !== "TSQualifiedName") {
    return null;
  }
  const left = getTypeQueryExpressionName(node.left);
  const right = getTypeQueryExpressionName(node.right);
  return left && right ? `${left}.${right}` : null;
}

function typeNodeContainsStringLiteral(node: unknown, value: string): boolean {
  let found = false;
  visitAst(node, (child) => {
    if (found) {
      return;
    }
    const typed = child as { type?: string; value?: unknown };
    found =
      (typed.type === "TSLiteralType" &&
        (typed as { literal?: { value?: unknown } }).literal?.value === value) ||
      ((typed.type === "StringLiteral" || typed.type === "Literal") && typed.value === value);
  });
  return found;
}

function visitAst(node: unknown, visitor: (node: { type?: string }) => void): void {
  if (!node || typeof node !== "object") {
    return;
  }
  visitor(node as { type?: string });
  for (const [key, child] of Object.entries(node)) {
    if (key === "loc" || key === "comments" || key === "parentPath") {
      continue;
    }
    if (Array.isArray(child)) {
      for (const item of child) {
        visitAst(item, visitor);
      }
    } else if (child && typeof child === "object") {
      visitAst(child, visitor);
    }
  }
}

function getTypeReferenceName(
  typeName: TypeReferenceNameNode | undefined,
): TypeReferenceName | null {
  if (typeName?.type === "Identifier" && typeName.name) {
    return { kind: "identifier", name: typeName.name };
  }
  if (
    typeName?.type === "TSQualifiedName" &&
    typeName.left?.type === "Identifier" &&
    typeName.left.name &&
    typeName.right?.type === "Identifier" &&
    typeName.right.name
  ) {
    return { kind: "qualified", namespace: typeName.left.name, name: typeName.right.name };
  }
  return null;
}

type TypeReferenceNameNode =
  | { type?: "Identifier"; name?: string }
  | {
      type?: "TSQualifiedName";
      left?: TypeReferenceNameNode;
      right?: TypeReferenceNameNode;
    };

type AstNodeOrQualifiedName =
  | (ASTNode & { type: "Identifier"; name?: string })
  | {
      type: "TSQualifiedName";
      left: AstNodeOrQualifiedName;
      right: AstNodeOrQualifiedName;
    };
