/**
 * Utilities for reasoning about JSX identifier and member-expression names.
 * Core concepts: JSX member paths and TypeScript namespace bindings.
 */
import type { ASTNode, Collection, JSCodeshift } from "jscodeshift";

export function jsxNamePath(name: unknown): string[] {
  const node = name as { type?: string; name?: string; object?: unknown; property?: unknown };
  if (!node) {
    return [];
  }
  if (node.type === "JSXIdentifier") {
    return node.name ? [node.name] : [];
  }
  if (node.type === "JSXMemberExpression") {
    return [...jsxNamePath(node.object), ...jsxNamePath(node.property)];
  }
  return [];
}

export function jsxNameTargetsLocalBinding(args: {
  root: Collection<ASTNode>;
  j: JSCodeshift;
  name: unknown;
  localName: string;
}): boolean {
  const path = jsxNamePath(args.name);
  if (path.length === 1) {
    return (
      path[0] === args.localName ||
      (!!path[0] && localAliasTargetsLocal(args.root, args.j, path[0], args.localName))
    );
  }
  const memberName = path[path.length - 1];
  const namespacePath = path.slice(0, -1);
  return namespaceMemberTargetsLocal(
    args.root,
    args.j,
    namespacePath,
    memberName ?? "",
    args.localName,
  );
}

function localAliasTargetsLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  aliasName: string,
  localName: string,
): boolean {
  let matched = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: aliasName } } as any)
    .forEach((path) => {
      if (matched) {
        return;
      }
      const init = path.node.init as { type?: string; name?: string } | null | undefined;
      matched = init?.type === "Identifier" && init.name === localName;
    });
  return matched;
}

export function namespaceMemberTargetsLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  namespacePath: string[],
  exportedName: string,
  localName: string,
): boolean {
  if (namespacePath.length === 0 || !exportedName || !localName) {
    return false;
  }
  const [rootNamespace, ...nestedNamespaces] = namespacePath;
  if (!rootNamespace) {
    return false;
  }
  const targetsTsNamespace =
    root
      .find(j.TSModuleDeclaration)
      .filter((p) => {
        const id = p.node.id;
        return id.type === "Identifier" && id.name === rootNamespace;
      })
      .filter((p) => tsModulePathTargetsLocal(p.node, nestedNamespaces, exportedName, localName))
      .size() > 0;
  if (targetsTsNamespace) {
    return true;
  }
  return namespaceObjectMemberTargetsLocal(root, j, namespacePath, exportedName, localName);
}

function namespaceObjectMemberTargetsLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  namespacePath: string[],
  exportedName: string,
  localName: string,
): boolean {
  const [rootName, ...remainingPath] = namespacePath;
  if (!rootName) {
    return false;
  }
  let matched = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: rootName } } as any)
    .forEach((path) => {
      if (matched) {
        return;
      }
      matched = objectExpressionPathTargetsLocal(
        path.node.init,
        [...remainingPath, exportedName],
        localName,
      );
    });
  return matched;
}

function objectExpressionPathTargetsLocal(
  node: unknown,
  path: string[],
  localName: string,
): boolean {
  const objectNode = node as
    | { type?: string; properties?: Array<{ type?: string; key?: unknown; value?: unknown }> }
    | null
    | undefined;
  if (objectNode?.type !== "ObjectExpression") {
    return false;
  }
  const [nextKey, ...remainingPath] = path;
  if (!nextKey) {
    return false;
  }
  for (const property of objectNode.properties ?? []) {
    if (property?.type !== "Property" && property?.type !== "ObjectProperty") {
      continue;
    }
    if (staticPropertyKeyName(property.key) !== nextKey) {
      continue;
    }
    if (remainingPath.length > 0) {
      return objectExpressionPathTargetsLocal(property.value, remainingPath, localName);
    }
    const value = property.value as { type?: string; name?: string } | null | undefined;
    return value?.type === "Identifier" && value.name === localName;
  }
  return false;
}

function staticPropertyKeyName(key: unknown): string | null {
  const keyNode = key as { type?: string; name?: string; value?: unknown } | null | undefined;
  if (keyNode?.type === "Identifier") {
    return keyNode.name ?? null;
  }
  if (
    (keyNode?.type === "StringLiteral" || keyNode?.type === "Literal") &&
    typeof keyNode.value === "string"
  ) {
    return keyNode.value;
  }
  return null;
}

function tsModulePathTargetsLocal(
  node: unknown,
  nestedNamespaces: string[],
  exportedName: string,
  localName: string,
): boolean {
  const body = (node as { body?: { type?: string; body?: unknown[]; id?: unknown } }).body;
  if (body?.type === "TSModuleDeclaration") {
    const nestedModuleDecl = body as { id?: { type?: string; name?: string } };
    const [nextNamespace, ...remaining] = nestedNamespaces;
    if (!moduleDeclarationNameMatches(nestedModuleDecl, nextNamespace ?? "")) {
      return false;
    }
    return tsModulePathTargetsLocal(nestedModuleDecl, remaining, exportedName, localName);
  }
  if (body?.type !== "TSModuleBlock") {
    return false;
  }
  if (nestedNamespaces.length === 0) {
    return (body.body ?? []).some((statement) =>
      statementTargetsLocal(statement, exportedName, localName),
    );
  }
  const [nextNamespace, ...remaining] = nestedNamespaces;
  return (body.body ?? []).some((statement) =>
    statementDeclaresNamespacePath(
      statement,
      nextNamespace ?? "",
      remaining,
      exportedName,
      localName,
    ),
  );
}

function statementDeclaresNamespacePath(
  statement: unknown,
  namespaceName: string,
  remainingNamespaces: string[],
  exportedName: string,
  localName: string,
): boolean {
  const moduleDecl = unwrapExportedDeclaration(statement) as {
    type?: string;
    id?: { type?: string; name?: string };
  };
  return (
    moduleDecl?.type === "TSModuleDeclaration" &&
    moduleDeclarationNameMatches(moduleDecl, namespaceName) &&
    tsModulePathTargetsLocal(moduleDecl, remainingNamespaces, exportedName, localName)
  );
}

function moduleDeclarationNameMatches(
  moduleDecl: { id?: { type?: string; name?: string } },
  namespaceName: string,
): boolean {
  return (
    !!namespaceName && moduleDecl.id?.type === "Identifier" && moduleDecl.id.name === namespaceName
  );
}

function unwrapExportedDeclaration(statement: unknown): unknown {
  const node = statement as { type?: string; declaration?: unknown };
  return node?.type === "ExportNamedDeclaration" ? node.declaration : statement;
}

function statementTargetsLocal(
  statement: unknown,
  exportedName: string,
  localName: string,
): boolean {
  if (!statement || typeof statement !== "object") {
    return false;
  }
  const node = statement as {
    type?: string;
    declaration?: unknown;
    declarations?: Array<{ id?: { type?: string; name?: string }; init?: unknown }>;
    id?: { type?: string; name?: string };
    specifiers?: Array<{
      type?: string;
      local?: { type?: string; name?: string };
      exported?: { type?: string; name?: string };
    }>;
  };
  if (node.type === "ExportNamedDeclaration") {
    if (
      exportedName === localName &&
      statementTargetsLocal(node.declaration, localName, localName)
    ) {
      return true;
    }
    // Only match by the specifier's LOCAL binding. For `export { Other as Grid }`
    // the namespace re-exports `Other`, not `Grid`, so `<Namespace.Grid>` resolves
    // to `Other`. Matching by the exported alias would wrongly attribute the JSX
    // member to an unrelated styled local named `Grid`.
    return (node.specifiers ?? []).some(
      (spec) =>
        spec.type === "ExportSpecifier" &&
        spec.local?.type === "Identifier" &&
        spec.local.name === localName &&
        specifierExportedName(spec) === exportedName,
    );
  }
  if (node.type === "VariableDeclaration") {
    return (
      exportedName === localName &&
      (node.declarations ?? []).some(
        (decl) =>
          decl.id?.type === "Identifier" &&
          decl.id.name === localName &&
          initializerLooksLikeStyledComponent(decl.init),
      )
    );
  }
  return (
    exportedName === localName &&
    (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
    node.id?.type === "Identifier" &&
    node.id.name === localName
  );
}

function initializerLooksLikeStyledComponent(init: unknown): boolean {
  const node = init as { type?: string; tag?: unknown } | null | undefined;
  if (!node) {
    return false;
  }
  if (node.type === "TaggedTemplateExpression") {
    return tagLooksLikeStyledComponent(node.tag);
  }
  return false;
}

function tagLooksLikeStyledComponent(tag: unknown): boolean {
  const node = tag as {
    type?: string;
    name?: string;
    object?: unknown;
    callee?: unknown;
  };
  if (!node) {
    return false;
  }
  if (node.type === "Identifier") {
    return node.name === "styled";
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    return tagLooksLikeStyledComponent(node.object);
  }
  if (node.type === "CallExpression") {
    return tagLooksLikeStyledComponent(node.callee);
  }
  return false;
}

function specifierExportedName(spec: {
  local?: { type?: string; name?: string };
  exported?: { type?: string; name?: string; value?: unknown };
}): string | null {
  const exported = spec.exported;
  if (!exported) {
    return spec.local?.type === "Identifier" ? (spec.local.name ?? null) : null;
  }
  if (exported.type === "Identifier") {
    return exported.name ?? null;
  }
  if (
    (exported.type === "StringLiteral" || exported.type === "Literal") &&
    typeof exported.value === "string"
  ) {
    return exported.value;
  }
  return null;
}
