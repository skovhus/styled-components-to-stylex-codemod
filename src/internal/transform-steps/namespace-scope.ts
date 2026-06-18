/**
 * Namespace scope resolution helpers extracted from analyze-before-emit.
 * Mirror TypeScript name resolution by walking the TSModuleDeclaration chain
 * around a path so type references resolve to the closest enclosing declaration.
 */
import type { JSCodeshift } from "jscodeshift";

export function getDeclNamespaceName(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  localName: string,
): string | null {
  let namespaceName: string | null = null;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      if (namespaceName) {
        return;
      }
      namespaceName = nearestNamespacePath(path);
    });
  return namespaceName;
}

/**
 * Builds the chain of namespaces visible to a styled decl by TypeScript name
 * resolution, ordered innermost-first and terminated with `null` (top-level).
 * For `namespace A { namespace B { const Grid = styled.div ... } }`, returns
 * `["A.B", "A", null]`. Used so type references resolve to the closest enclosing
 * declaration, matching how TS would resolve them at runtime.
 */
export function getDeclAncestorNamespaceChain(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  localName: string,
): Array<string | null> {
  let declaratorPath: { parentPath?: unknown } | null = null;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: localName } } as any)
    .forEach((path: any) => {
      if (declaratorPath) {
        return;
      }
      declaratorPath = path;
    });
  if (!declaratorPath) {
    return [null];
  }
  const namespacePath = namespacePathForPath(declaratorPath);
  const chain: Array<string | null> = [];
  for (let end = namespacePath.length; end > 0; end--) {
    chain.push(namespacePath.slice(0, end).join("."));
  }
  chain.push(null);
  return chain;
}

export function nearestNamespacePath(path: { parentPath?: unknown }): string | null {
  const namespacePath = namespacePathForPath(path);
  return namespacePath.length > 0 ? namespacePath.join(".") : null;
}

function namespacePathForPath(path: { parentPath?: unknown }): string[] {
  const names: string[] = [];
  let current = path.parentPath as { node?: { type?: string; id?: unknown }; parentPath?: unknown };
  while (current) {
    const node = current.node;
    if (node?.type === "TSModuleDeclaration") {
      const id = node.id as { type?: string; name?: string };
      if (id.type === "Identifier" && id.name) {
        names.push(id.name);
      }
    }
    current = current.parentPath as typeof current;
  }
  return names.reverse();
}

/**
 * Returns true when `path` lives inside `namespaceName` or any namespace nested
 * within it. `namespaceName === null` represents top-level scope, which all
 * references reach via TypeScript name resolution.
 *
 * Used for the cross-namespace ownership/usage checks: a type declared in
 * namespace `A` is reachable from `A.Sub.Inner` because TS resolves names
 * outward through enclosing namespaces.
 */
export function pathReachesNamespace(
  path: { parentPath?: unknown },
  namespaceName: string | null,
): boolean {
  if (namespaceName === null) {
    return true;
  }
  const target = namespaceName.split(".");
  const current = namespacePathForPath(path);
  return target.every((part, index) => current[index] === part);
}
