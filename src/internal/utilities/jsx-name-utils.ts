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
    return path[0] === args.localName;
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
  return (
    root
      .find(j.TSModuleDeclaration)
      .filter((p) => {
        const id = p.node.id;
        return id.type === "Identifier" && id.name === rootNamespace;
      })
      .filter((p) => tsModulePathTargetsLocal(p.node, nestedNamespaces, exportedName, localName))
      .size() > 0
  );
}

function tsModulePathTargetsLocal(
  node: unknown,
  nestedNamespaces: string[],
  exportedName: string,
  localName: string,
): boolean {
  const body = (node as { body?: { type?: string; body?: unknown[] } }).body;
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
    moduleDecl.id?.type === "Identifier" &&
    moduleDecl.id.name === namespaceName &&
    tsModulePathTargetsLocal(moduleDecl, remainingNamespaces, exportedName, localName)
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
    declarations?: Array<{ id?: { type?: string; name?: string } }>;
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
        (decl) => decl.id?.type === "Identifier" && decl.id.name === localName,
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
