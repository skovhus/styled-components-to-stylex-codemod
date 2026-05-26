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
  fromPath?: { parentPath?: unknown };
}): boolean {
  const path = jsxNamePath(args.name);
  if (path.length === 1) {
    return (
      path[0] === args.localName ||
      (!!path[0] &&
        localAliasTargetsLocal(args.root, args.j, path[0], args.localName, {
          fromPath: args.fromPath,
        }))
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
  options: { fromPath?: { parentPath?: unknown }; seen?: Set<string> } = {},
): boolean {
  const seen = options.seen ?? new Set<string>();
  if (aliasName === localName) {
    return true;
  }
  if (seen.has(aliasName)) {
    return false;
  }
  seen.add(aliasName);
  let matched = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: aliasName } } as any)
    .filter((path) =>
      options.fromPath
        ? variableDeclaratorIsVisibleFrom(path, options.fromPath)
        : isModuleScopeVariableDeclarator(path),
    )
    .forEach((path) => {
      if (matched) {
        return;
      }
      const init = path.node.init as { type?: string; name?: string } | null | undefined;
      if (
        init?.type === "Identifier" &&
        init.name === localName &&
        localNameIsShadowedForAlias(path, localName)
      ) {
        return;
      }
      matched =
        init?.type === "Identifier" &&
        localAliasTargetsLocal(root, j, init.name ?? "", localName, {
          ...options,
          seen,
        });
    });
  return matched;
}

function localNameIsShadowedForAlias(path: { parentPath?: unknown }, localName: string): boolean {
  if (isModuleScopeVariableDeclarator(path)) {
    return false;
  }
  let current = path.parentPath as
    | { node?: { type?: string; params?: unknown[]; body?: unknown[] }; parentPath?: unknown }
    | undefined;
  while (current?.node) {
    if (current.node.type === "Program" || current.node.type === "ExportNamedDeclaration") {
      return false;
    }
    if (
      functionParamsContainName(current.node, localName) ||
      blockStatementsDeclareName(current.node, localName)
    ) {
      return true;
    }
    current = current.parentPath as typeof current;
  }
  return false;
}

function functionParamsContainName(
  node: { type?: string; params?: unknown[] } | undefined,
  name: string,
): boolean {
  if (
    node?.type !== "FunctionDeclaration" &&
    node?.type !== "FunctionExpression" &&
    node?.type !== "ArrowFunctionExpression"
  ) {
    return false;
  }
  return (node.params ?? []).some((param) => patternContainsName(param, name));
}

function blockStatementsDeclareName(
  node: { type?: string; body?: unknown[] } | undefined,
  name: string,
): boolean {
  if (node?.type !== "BlockStatement") {
    return false;
  }
  return (node.body ?? []).some((statement) => {
    const stmt = statement as { type?: string; declarations?: unknown[] } | null;
    return (
      stmt?.type === "VariableDeclaration" &&
      (stmt.declarations ?? []).some((decl) =>
        patternContainsName((decl as { id?: unknown }).id, name),
      )
    );
  });
}

function patternContainsName(pattern: unknown, name: string): boolean {
  const node = pattern as {
    type?: string;
    name?: string;
    properties?: unknown[];
    elements?: unknown[];
    argument?: unknown;
    left?: unknown;
  } | null;
  if (!node) {
    return false;
  }
  if (node.type === "Identifier") {
    return node.name === name;
  }
  if (node.type === "ObjectPattern") {
    return (node.properties ?? []).some((prop) =>
      patternContainsName(
        (prop as { value?: unknown; argument?: unknown }).value ??
          (prop as { argument?: unknown }).argument,
        name,
      ),
    );
  }
  if (node.type === "ArrayPattern") {
    return (node.elements ?? []).some((element) => patternContainsName(element, name));
  }
  if (node.type === "RestElement") {
    return patternContainsName(node.argument, name);
  }
  if (node.type === "AssignmentPattern") {
    return patternContainsName(node.left, name);
  }
  return false;
}

function variableDeclaratorIsVisibleFrom(
  declaratorPath: { parentPath?: unknown },
  fromPath: { parentPath?: unknown },
): boolean {
  if (isModuleScopeVariableDeclarator(declaratorPath)) {
    return true;
  }
  const declaratorScope = nearestFunctionOrBlockScope(declaratorPath);
  return !!declaratorScope && scopeContainsPath(declaratorScope, fromPath);
}

function nearestFunctionOrBlockScope(path: { parentPath?: unknown }): unknown {
  let current = path.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
  while (current?.node) {
    if (
      current.node.type === "BlockStatement" ||
      current.node.type === "FunctionDeclaration" ||
      current.node.type === "FunctionExpression" ||
      current.node.type === "ArrowFunctionExpression"
    ) {
      return current;
    }
    current = current.parentPath as typeof current;
  }
  return null;
}

function scopeContainsPath(scopePath: unknown, path: { parentPath?: unknown }): boolean {
  let current: unknown = path;
  while (current) {
    if (current === scopePath) {
      return true;
    }
    current = (current as { parentPath?: unknown }).parentPath;
  }
  return false;
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
    .filter(isModuleScopeVariableDeclarator)
    .forEach((path) => {
      if (matched) {
        return;
      }
      matched = objectExpressionPathTargetsLocal(
        root,
        j,
        path.node.init,
        [...remainingPath, exportedName],
        localName,
      );
    });
  return matched;
}

function isModuleScopeVariableDeclarator(path: { parentPath?: unknown }): boolean {
  let current = path.parentPath as { node?: { type?: string }; parentPath?: unknown } | undefined;
  while (current?.node) {
    const type = current.node.type;
    if (type === "Program" || type === "ExportNamedDeclaration") {
      return true;
    }
    if (
      type === "BlockStatement" ||
      type === "ForInStatement" ||
      type === "ForOfStatement" ||
      type === "ForStatement" ||
      type === "FunctionDeclaration" ||
      type === "FunctionExpression" ||
      type === "ArrowFunctionExpression"
    ) {
      return false;
    }
    current = current.parentPath as typeof current;
  }
  return false;
}

function objectExpressionPathTargetsLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  node: unknown,
  path: string[],
  localName: string,
  seen: Set<string> = new Set<string>(),
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
      const value = property.value as { type?: string; name?: string } | null | undefined;
      if (value?.type === "Identifier" && value.name) {
        return objectIdentifierPathTargetsLocal(
          root,
          j,
          value.name,
          remainingPath,
          localName,
          seen,
        );
      }
      return objectExpressionPathTargetsLocal(
        root,
        j,
        property.value,
        remainingPath,
        localName,
        seen,
      );
    }
    const value = property.value as { type?: string; name?: string } | null | undefined;
    return value?.type === "Identifier" && value.name === localName;
  }
  return false;
}

function objectIdentifierPathTargetsLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  objectName: string,
  path: string[],
  localName: string,
  seen: Set<string>,
): boolean {
  if (seen.has(objectName)) {
    return false;
  }
  seen.add(objectName);
  let matched = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: objectName } } as any)
    .filter(isModuleScopeVariableDeclarator)
    .forEach((declPath) => {
      if (matched) {
        return;
      }
      matched = objectExpressionPathTargetsLocal(
        root,
        j,
        declPath.node.init,
        path,
        localName,
        seen,
      );
    });
  return matched;
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
