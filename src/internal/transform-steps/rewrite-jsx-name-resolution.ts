/**
 * Resolution helpers for the rewrite-jsx step: determines whether a JSX element
 * name (identifier, alias, or member expression) refers to a given styled
 * component local, accounting for namespace bindings and scope shadowing.
 */
import { TransformContext } from "../transform-context.js";
import { jsxNamePath, namespaceMemberTargetsLocal } from "../utilities/jsx-name-utils.js";

export function jsxNameReferencesStyledLocal(
  name: unknown,
  localName: string,
  root: TransformContext["root"],
  j: TransformContext["j"]["jscodeshift"],
  jsxPath?: { parentPath?: unknown } | null,
): boolean {
  const path = jsxNamePath(name);
  if (path.length === 0) {
    return false;
  }
  if (path.length === 1) {
    const identifier = path[0]!;
    return (
      identifier === localName || identifierAliasReferencesLocal(identifier, localName, root, j)
    );
  }
  return memberPathReferencesLocal(path, localName, root, j, jsxPath);
}

function identifierAliasReferencesLocal(
  identifier: string,
  localName: string,
  root: TransformContext["root"],
  j: TransformContext["j"]["jscodeshift"],
): boolean {
  let references = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: identifier } } as any)
    .forEach((p: any) => {
      if (expressionReferencesLocal(p.node.init, localName)) {
        references = true;
      }
    });
  return references;
}

function memberPathReferencesLocal(
  path: string[],
  localName: string,
  root: TransformContext["root"],
  j: TransformContext["j"]["jscodeshift"],
  jsxPath?: { parentPath?: unknown } | null,
): boolean {
  const [rootName, ...properties] = path;
  if (!rootName || properties.length === 0) {
    return false;
  }

  let references = false;
  root
    .find(j.VariableDeclarator, { id: { type: "Identifier", name: rootName } } as any)
    .forEach((p: any) => {
      const value = objectPathValue(p.node.init, properties);
      if (expressionReferencesLocal(value, localName)) {
        references = true;
      }
    });
  if (references) {
    return true;
  }
  const memberName = properties[properties.length - 1];
  const namespacePath = [rootName, ...properties.slice(0, -1)];
  if (!namespaceMemberTargetsLocal(root, j, namespacePath, memberName ?? "", localName)) {
    return false;
  }
  // Refuse the namespace fallback when a nested scope shadows the namespace name
  // (e.g. `function X() { const WidgetSet = Other; return <WidgetSet.Grid />; }`)
  // because the JSX root resolves to the local binding, not the namespace.
  return !rootNameIsShadowedAtJsxPath(jsxPath, rootName);
}

function rootNameIsShadowedAtJsxPath(
  jsxPath: { parentPath?: unknown } | null | undefined,
  rootName: string,
): boolean {
  let cur: { node?: unknown; parentPath?: unknown } | null | undefined = jsxPath;
  while (cur) {
    const node = cur.node as { type?: string; body?: unknown; params?: unknown[] } | undefined;
    if (
      node?.type === "FunctionDeclaration" ||
      node?.type === "FunctionExpression" ||
      node?.type === "ArrowFunctionExpression" ||
      node?.type === "BlockStatement" ||
      node?.type === "Program" ||
      node?.type === "TSModuleBlock"
    ) {
      if (scopeBindingShadowsName(node, rootName)) {
        return true;
      }
    }
    cur = cur.parentPath as { node?: unknown; parentPath?: unknown } | null | undefined;
  }
  return false;
}

function scopeBindingShadowsName(
  node: { type?: string; body?: unknown; params?: unknown[] } | undefined,
  rootName: string,
): boolean {
  if (!node) {
    return false;
  }
  if (Array.isArray(node.params)) {
    for (const param of node.params) {
      if (paramIntroducesName(param, rootName)) {
        return true;
      }
    }
  }
  const body = (node as { body?: { type?: string; body?: unknown[] } | unknown[] }).body;
  const statements = Array.isArray(body)
    ? body
    : Array.isArray((body as { body?: unknown[] })?.body)
      ? ((body as { body?: unknown[] }).body as unknown[])
      : [];
  for (const stmt of statements) {
    if (statementIntroducesName(stmt, rootName)) {
      return true;
    }
  }
  return false;
}

function paramIntroducesName(param: unknown, rootName: string): boolean {
  return bindingPatternIntroducesName(param, rootName);
}

function statementIntroducesName(stmt: unknown, rootName: string): boolean {
  const node = stmt as {
    type?: string;
    declarations?: Array<{ id?: unknown }>;
    id?: { type?: string; name?: string };
  };
  if (node?.type === "VariableDeclaration") {
    return (node.declarations ?? []).some((d) => bindingPatternIntroducesName(d.id, rootName));
  }
  if (node?.type === "FunctionDeclaration" || node?.type === "ClassDeclaration") {
    return node.id?.type === "Identifier" && node.id.name === rootName;
  }
  return false;
}

/**
 * Walks a binding pattern (Identifier, ObjectPattern, ArrayPattern, AssignmentPattern,
 * RestElement) to check whether it introduces `rootName` as a local binding. Needed
 * so destructured bindings like `const { WidgetSet } = props` and renames like
 * `const { Foo: WidgetSet } = props` are recognized as shadowing the namespace.
 */
function bindingPatternIntroducesName(pattern: unknown, rootName: string): boolean {
  if (!pattern || typeof pattern !== "object") {
    return false;
  }
  const node = pattern as {
    type?: string;
    name?: string;
    properties?: unknown[];
    elements?: unknown[];
    left?: unknown;
    argument?: unknown;
    key?: { type?: string; name?: string; value?: string };
    value?: unknown;
    shorthand?: boolean;
  };
  if (node.type === "Identifier") {
    return node.name === rootName;
  }
  if (node.type === "ObjectPattern") {
    return (node.properties ?? []).some((prop) =>
      objectPatternPropertyIntroducesName(prop, rootName),
    );
  }
  if (node.type === "ArrayPattern") {
    return (node.elements ?? []).some((el) => bindingPatternIntroducesName(el, rootName));
  }
  if (node.type === "AssignmentPattern") {
    return bindingPatternIntroducesName(node.left, rootName);
  }
  if (node.type === "RestElement") {
    return bindingPatternIntroducesName(node.argument, rootName);
  }
  return false;
}

function objectPatternPropertyIntroducesName(prop: unknown, rootName: string): boolean {
  if (!prop || typeof prop !== "object") {
    return false;
  }
  const node = prop as {
    type?: string;
    key?: { type?: string; name?: string; value?: string };
    value?: unknown;
    argument?: unknown;
    shorthand?: boolean;
  };
  if (node.type === "RestElement") {
    return bindingPatternIntroducesName(node.argument, rootName);
  }
  if (node.type === "Property" || node.type === "ObjectProperty") {
    // Shorthand (`{ WidgetSet }`) and renamed (`{ Foo: WidgetSet }`) both bind the
    // *value* side of the property — that's where the local name is introduced.
    return bindingPatternIntroducesName(node.value, rootName);
  }
  return false;
}

function objectPathValue(expr: unknown, path: readonly string[]): unknown {
  let current = expr;
  for (const part of path) {
    const obj = current as { type?: string; properties?: unknown[] };
    if (obj?.type !== "ObjectExpression") {
      return null;
    }
    const prop = (obj.properties ?? []).find((entry) => {
      const p = entry as { type?: string; key?: { type?: string; name?: string; value?: string } };
      if (p?.type !== "ObjectProperty" && p?.type !== "Property") {
        return false;
      }
      return p.key?.type === "Identifier" ? p.key.name === part : p.key?.value === part;
    }) as { value?: unknown } | undefined;
    current = prop?.value;
  }
  return current;
}

function expressionReferencesLocal(expr: unknown, localName: string): boolean {
  const node = expr as {
    type?: string;
    name?: string;
    consequent?: unknown;
    alternate?: unknown;
    left?: unknown;
    right?: unknown;
  };
  if (!node) {
    return false;
  }
  if (node.type === "Identifier") {
    return node.name === localName;
  }
  if (node.type === "ConditionalExpression") {
    return (
      expressionReferencesLocal(node.consequent, localName) ||
      expressionReferencesLocal(node.alternate, localName)
    );
  }
  if (node.type === "LogicalExpression") {
    return (
      expressionReferencesLocal(node.left, localName) ||
      expressionReferencesLocal(node.right, localName)
    );
  }
  return false;
}
