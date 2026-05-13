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
  const [namespaceName, memberName] = path;
  return (
    path.length === 2 &&
    memberName === args.localName &&
    !!namespaceName &&
    namespaceDeclaresLocal(args.root, args.j, namespaceName, args.localName)
  );
}

export function namespaceDeclaresLocal(
  root: Collection<ASTNode>,
  j: JSCodeshift,
  namespaceName: string,
  localName: string,
): boolean {
  return (
    root
      .find(j.TSModuleDeclaration)
      .filter((p) => {
        const id = p.node.id;
        return id.type === "Identifier" && id.name === namespaceName;
      })
      .filter((p) => tsModuleDeclaresLocal(p.node, localName))
      .size() > 0
  );
}

function tsModuleDeclaresLocal(node: unknown, localName: string): boolean {
  const body = (node as { body?: { type?: string; body?: unknown[] } }).body;
  if (body?.type !== "TSModuleBlock") {
    return false;
  }
  return (body.body ?? []).some((statement) => statementDeclaresLocal(statement, localName));
}

function statementDeclaresLocal(statement: unknown, localName: string): boolean {
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
    if (statementDeclaresLocal(node.declaration, localName)) {
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
        spec.local.name === localName,
    );
  }
  if (node.type === "VariableDeclaration") {
    return (node.declarations ?? []).some(
      (decl) => decl.id?.type === "Identifier" && decl.id.name === localName,
    );
  }
  return (
    (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") &&
    node.id?.type === "Identifier" &&
    node.id.name === localName
  );
}
