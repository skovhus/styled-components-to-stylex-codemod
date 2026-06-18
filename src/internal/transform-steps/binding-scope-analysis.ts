/**
 * Binding / name-scope analysis helpers extracted from analyze-before-emit.
 * These inspect the file's AST to decide whether a given name is bound, whether
 * a node is a `stylex.create(...)` call, and which type names a props type refers
 * to — all used to make safe merge-target and renaming decisions.
 */
import type { JSCodeshift } from "jscodeshift";
import { TransformContext } from "../transform-context.js";

/**
 * True if the given name is bound anywhere in the file — by a variable declarator,
 * a function declaration's own name, or a function parameter (including destructuring
 * forms). When `excludeDeclaratorNode` is provided, that specific VariableDeclarator
 * is skipped so a decl's own binding doesn't count as self-shadowing.
 */
export function isNameBoundInFile(
  ctx: TransformContext,
  name: string,
  excludeDeclaratorNode?: unknown,
): boolean {
  const { root, j } = ctx;
  let found = false;
  root.find(j.VariableDeclarator).forEach((path) => {
    if (found || path.node === excludeDeclaratorNode) {
      return;
    }
    if (patternContainsName(path.node.id, name)) {
      found = true;
    }
  });
  if (found) {
    return true;
  }
  // Function-like bindings (FunctionDeclaration, FunctionExpression,
  // ArrowFunctionExpression, ObjectMethod, ClassMethod): own name or any param.
  root.find(j.Function).forEach((path) => {
    if (found) {
      return;
    }
    const fn = path.node as { id?: { name?: string } | null; params?: Array<unknown> };
    if (fn.id?.name === name) {
      found = true;
      return;
    }
    for (const param of fn.params ?? []) {
      if (paramBindsName(param, name)) {
        found = true;
        return;
      }
    }
  });
  return found;
}

/**
 * True if the file would collide on `name` if we used it for the stylex binding.
 * Skipped styled decls keep their own binding (e.g. `const styles = styled.div\`...\``),
 * which is fine as long as no OTHER scope also binds the same name — the regular
 * isNameBoundInFile check handles that.
 */
export function fileHasLocalName(
  ctx: TransformContext,
  name: string,
  styledDeclNames: Set<string>,
): boolean {
  if (styledDeclNames.has(name)) {
    return false;
  }
  return isNameBoundInFile(ctx, name);
}

/** True if `node` is `stylex.create(...)`. */
export function isStylexCreateCall(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const call = node as {
    type?: string;
    callee?: {
      type?: string;
      object?: { type?: string; name?: string };
      property?: { type?: string; name?: string };
    };
  };
  if (call.type !== "CallExpression") {
    return false;
  }
  const callee = call.callee;
  if (callee?.type !== "MemberExpression") {
    return false;
  }
  return (
    callee.object?.type === "Identifier" &&
    callee.object.name === "stylex" &&
    callee.property?.type === "Identifier" &&
    callee.property.name === "create"
  );
}

export function isObjectExpression(node: unknown): boolean {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "ObjectExpression"
  );
}

/**
 * Collect the literal property keys from an ObjectExpression. Returns `undefined`
 * if the object contains spread elements, computed keys, or non-identifier/string
 * keys we can't reason about safely.
 */
export function collectObjectPropertyKeys(objectExpression: unknown): Set<string> | undefined {
  const obj = objectExpression as { properties?: Array<unknown> };
  const keys = new Set<string>();
  for (const p of obj.properties ?? []) {
    const prop = p as {
      type?: string;
      computed?: boolean;
      key?: { type?: string; name?: string; value?: unknown };
    };
    if (prop.type !== "Property" && prop.type !== "ObjectProperty") {
      return undefined;
    }
    if (prop.computed) {
      return undefined;
    }
    const key = prop.key;
    if (key?.type === "Identifier" && typeof key.name === "string") {
      keys.add(key.name);
      continue;
    }
    if (
      (key?.type === "Literal" || key?.type === "StringLiteral") &&
      typeof key.value === "string"
    ) {
      keys.add(key.value);
      continue;
    }
    return undefined;
  }
  return keys;
}

/**
 * Check if a name refers to a locally-defined function component (FunctionDeclaration,
 * arrow function, or function expression), as opposed to a variable assigned from an
 * opaque call expression or import.
 */
export function isLocalFunctionComponent(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  name: string,
): boolean {
  // Check FunctionDeclaration: function Foo(...) {}
  if (root.find(j.FunctionDeclaration, { id: { type: "Identifier", name } } as any).size() > 0) {
    return true;
  }
  // Check VariableDeclarator with arrow/function expression: const Foo = (...) => ...
  return (
    root
      .find(j.VariableDeclarator, { id: { type: "Identifier", name } } as any)
      .filter((p) => {
        const init = p.node.init as { type?: string } | null;
        return init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression";
      })
      .size() > 0
  );
}

/**
 * Collects all referenced type names from a propsType AST node,
 * including those inside intersection types.
 */
export function collectReferencedTypeNames(propsType: unknown): string[] {
  const names: string[] = [];
  const name = extractReferencedTypeName(propsType);
  if (name) {
    names.push(name);
  }
  const node = propsType as { type?: string; types?: unknown[] } | undefined;
  if (node?.type === "TSIntersectionType" && Array.isArray(node.types)) {
    for (const t of node.types) {
      names.push(...collectReferencedTypeNames(t));
    }
  }
  return names;
}

/**
 * Returns true when a type name is defined locally (as an interface or type alias),
 * as opposed to being imported from another module.
 */
export function isTypeLocallyDefined(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  typeName: string,
): boolean {
  return (
    root
      .find(j.TSInterfaceDeclaration)
      .filter((p: unknown) => {
        const node = p as { node?: { id?: { name?: string } } };
        return node.node?.id?.name === typeName;
      })
      .size() > 0 ||
    root
      .find(j.TSTypeAliasDeclaration)
      .filter((p: unknown) => {
        const node = p as { node?: { id?: { name?: string } } };
        return node.node?.id?.name === typeName;
      })
      .size() > 0
  );
}

/**
 * Returns true when a name is bound at module scope (import specifier, top-level
 * variable, etc.) other than the given owner's declaration.
 */
export function isModuleScopeBinding(
  root: ReturnType<JSCodeshift>,
  j: JSCodeshift,
  name: string,
  ownerLocalName: string,
): boolean {
  // Check import specifiers (named, default, and namespace)
  const hasImport =
    root
      .find(j.ImportSpecifier)
      .filter((p) => {
        const local = p.node.local?.name ?? p.node.imported?.name;
        return local === name;
      })
      .size() > 0 ||
    root
      .find(j.ImportDefaultSpecifier)
      .filter((p) => p.node.local?.name === name)
      .size() > 0 ||
    root
      .find(j.ImportNamespaceSpecifier)
      .filter((p) => p.node.local?.name === name)
      .size() > 0;
  if (hasImport) {
    return true;
  }
  // Check top-level declarations: variables, functions, classes (excluding the owner).
  // Walk up the path chain to determine if a binding is at module scope — handles
  // both `const $x = ...` and `export const $x = ...` parent structures.
  const isTopLevel = (p: { parentPath?: { node?: { type?: string }; parentPath?: unknown } }) => {
    let cur = p.parentPath;
    while (cur) {
      const t = (cur as { node?: { type?: string } }).node?.type;
      if (t === "Program") {
        return true;
      }
      if (t && t !== "VariableDeclaration" && t !== "ExportNamedDeclaration") {
        return false;
      }
      cur = (cur as { parentPath?: unknown }).parentPath as typeof cur;
    }
    return false;
  };
  const hasVariable =
    root
      .find(j.VariableDeclarator)
      .filter((p) => {
        const id = p.node.id;
        return id.type === "Identifier" && id.name === name && id.name !== ownerLocalName;
      })
      .filter((p) => isTopLevel(p))
      .size() > 0;
  if (hasVariable) {
    return true;
  }
  const hasFunction =
    root
      .find(j.FunctionDeclaration)
      .filter((p) => p.node.id?.name === name && p.node.id?.name !== ownerLocalName)
      .size() > 0;
  if (hasFunction) {
    return true;
  }
  return (
    root
      .find(j.ClassDeclaration)
      .filter((p) => {
        const id = p.node.id;
        return id?.type === "Identifier" && id.name === name && id.name !== ownerLocalName;
      })
      .size() > 0
  );
}

/** Recursively check if a pattern (Identifier, ArrayPattern, ObjectPattern, etc.) contains a binding with the given name. */
export function patternContainsName(
  node: { type?: string } | null | undefined,
  name: string,
): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (node.type === "Identifier") {
    return (node as { name: string }).name === name;
  }
  if (node.type === "ArrayPattern") {
    return ((node as any).elements ?? []).some(
      (el: { type?: string } | null) => el && patternContainsName(el, name),
    );
  }
  if (node.type === "ObjectPattern") {
    return ((node as any).properties ?? []).some((prop: any) => {
      if (prop.type === "RestElement" || prop.type === "RestProperty") {
        return patternContainsName(prop.argument, name);
      }
      return patternContainsName(prop.value, name);
    });
  }
  if (node.type === "RestElement" || node.type === "RestProperty") {
    return patternContainsName((node as any).argument, name);
  }
  if (node.type === "AssignmentPattern") {
    return patternContainsName((node as any).left, name);
  }
  return false;
}

/**
 * True if a function-parameter pattern binds the given name. Covers the full set of
 * destructuring and defaulting forms: `Identifier`, `AssignmentPattern`, `RestElement`,
 * `ObjectPattern` (nested), and `ArrayPattern` (nested).
 */
function paramBindsName(param: unknown, name: string): boolean {
  if (!param || typeof param !== "object") {
    return false;
  }
  const p = param as {
    type?: string;
    name?: string;
    left?: unknown;
    argument?: unknown;
    properties?: Array<{
      type?: string;
      value?: unknown;
      argument?: unknown;
      key?: { name?: string };
    }>;
    elements?: Array<unknown>;
  };
  if (p.type === "Identifier") {
    return p.name === name;
  }
  if (p.type === "AssignmentPattern") {
    return paramBindsName(p.left, name);
  }
  if (p.type === "RestElement") {
    return paramBindsName(p.argument, name);
  }
  if (p.type === "ObjectPattern") {
    for (const prop of p.properties ?? []) {
      if (prop.type === "RestElement") {
        if (paramBindsName(prop.argument, name)) {
          return true;
        }
        continue;
      }
      if (paramBindsName(prop.value, name)) {
        return true;
      }
    }
    return false;
  }
  if (p.type === "ArrayPattern") {
    for (const el of p.elements ?? []) {
      if (el && paramBindsName(el, name)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/**
 * Extracts the top-level type name from a propsType AST node.
 * Returns the identifier name for TSTypeReference, null otherwise.
 */
function extractReferencedTypeName(propsType: unknown): string | null {
  const node = propsType as
    | { type?: string; typeName?: { type?: string; name?: string } }
    | undefined;
  if (node?.type === "TSTypeReference" && node.typeName?.type === "Identifier") {
    return node.typeName.name ?? null;
  }
  return null;
}
