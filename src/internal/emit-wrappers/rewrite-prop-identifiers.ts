import type { ASTNode, JSCodeshift } from "jscodeshift";

type MutableNode = { type?: string; name?: string; [key: string]: unknown };

export function rewriteBarePropIdentifiersToPropsAccess(args: {
  j: JSCodeshift;
  node: unknown;
  propNames: ReadonlySet<string>;
  propsIdentifier?: string;
}): void {
  const { j, node, propNames, propsIdentifier = "props" } = args;
  rewriteNode(j, node, propNames, propsIdentifier, new Set());
}

function rewriteNode(
  j: JSCodeshift,
  node: unknown,
  propNames: ReadonlySet<string>,
  propsIdentifier: string,
  shadowedNames: ReadonlySet<string>,
): void {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      rewriteNode(j, item, propNames, propsIdentifier, shadowedNames);
    }
    return;
  }

  const n = node as MutableNode;
  if (
    n.type === "Identifier" &&
    typeof n.name === "string" &&
    propNames.has(n.name) &&
    !shadowedNames.has(n.name)
  ) {
    replaceNode(n, j.memberExpression(j.identifier(propsIdentifier), j.identifier(n.name)));
    return;
  }

  if (isFunctionLike(n)) {
    if (functionBindsName(n, propsIdentifier)) {
      const replacementName = uniqueIdentifierName(n, `${propsIdentifier}Arg`);
      for (const param of readArray(n.params)) {
        renameBindingName(param, propsIdentifier, replacementName);
      }
      renameIdentifierReferences(n.body, propsIdentifier, replacementName);
    }
    const nextShadowedNames = new Set(shadowedNames);
    for (const param of readArray(n.params)) {
      collectBindingNames(param, nextShadowedNames);
    }
    rewriteNode(j, n.body, propNames, propsIdentifier, nextShadowedNames);
    return;
  }

  if (n.type === "MemberExpression") {
    rewriteNode(j, n.object, propNames, propsIdentifier, shadowedNames);
    if (n.computed) {
      rewriteNode(j, n.property, propNames, propsIdentifier, shadowedNames);
    }
    return;
  }

  if (n.type === "Property" || n.type === "ObjectProperty") {
    if (n.computed) {
      rewriteNode(j, n.key, propNames, propsIdentifier, shadowedNames);
    }
    rewriteNode(j, n.value, propNames, propsIdentifier, shadowedNames);
    if (n.shorthand === true) {
      n.shorthand = false;
    }
    return;
  }

  if (n.type === "VariableDeclarator") {
    rewriteNode(j, n.init, propNames, propsIdentifier, shadowedNames);
    return;
  }

  for (const key of Object.keys(n)) {
    if (IGNORED_KEYS.has(key)) {
      continue;
    }
    rewriteNode(j, n[key], propNames, propsIdentifier, shadowedNames);
  }
}

function isFunctionLike(node: MutableNode): boolean {
  return (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  );
}

function functionBindsName(node: MutableNode, name: string): boolean {
  const bindingNames = new Set<string>();
  for (const param of readArray(node.params)) {
    collectBindingNames(param, bindingNames);
  }
  return bindingNames.has(name);
}

function collectBindingNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as MutableNode;
  if (n.type === "Identifier" && typeof n.name === "string") {
    names.add(n.name);
    return;
  }
  if (n.type === "RestElement") {
    collectBindingNames(n.argument, names);
    return;
  }
  if (n.type === "AssignmentPattern") {
    collectBindingNames(n.left, names);
    return;
  }
  if (n.type === "ObjectPattern") {
    for (const property of readArray(n.properties)) {
      const typedProperty = property as MutableNode;
      collectBindingNames(
        typedProperty.type === "Property" || typedProperty.type === "ObjectProperty"
          ? typedProperty.value
          : property,
        names,
      );
    }
    return;
  }
  if (n.type === "ArrayPattern") {
    for (const element of readArray(n.elements)) {
      collectBindingNames(element, names);
    }
  }
}

function renameBindingName(node: unknown, fromName: string, toName: string): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as MutableNode;
  if (n.type === "Identifier" && n.name === fromName) {
    n.name = toName;
    return;
  }
  if (n.type === "RestElement") {
    renameBindingName(n.argument, fromName, toName);
    return;
  }
  if (n.type === "AssignmentPattern") {
    renameBindingName(n.left, fromName, toName);
    renameIdentifierReferences(n.right, fromName, toName);
    return;
  }
  if (n.type === "ObjectPattern") {
    for (const property of readArray(n.properties)) {
      const typedProperty = property as MutableNode;
      renameBindingName(
        typedProperty.type === "Property" || typedProperty.type === "ObjectProperty"
          ? typedProperty.value
          : property,
        fromName,
        toName,
      );
    }
    return;
  }
  if (n.type === "ArrayPattern") {
    for (const element of readArray(n.elements)) {
      renameBindingName(element, fromName, toName);
    }
  }
}

function renameIdentifierReferences(node: unknown, fromName: string, toName: string): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      renameIdentifierReferences(item, fromName, toName);
    }
    return;
  }

  const n = node as MutableNode;
  if (n.type === "Identifier" && n.name === fromName) {
    n.name = toName;
    return;
  }
  if (isFunctionLike(n) && functionBindsName(n, fromName)) {
    return;
  }
  if (n.type === "MemberExpression") {
    renameIdentifierReferences(n.object, fromName, toName);
    if (n.computed) {
      renameIdentifierReferences(n.property, fromName, toName);
    }
    return;
  }
  if (n.type === "Property" || n.type === "ObjectProperty") {
    if (n.computed) {
      renameIdentifierReferences(n.key, fromName, toName);
    }
    renameIdentifierReferences(n.value, fromName, toName);
    return;
  }
  if (n.type === "VariableDeclarator") {
    const bindingNames = new Set<string>();
    collectBindingNames(n.id, bindingNames);
    if (!bindingNames.has(fromName)) {
      renameIdentifierReferences(n.init, fromName, toName);
    }
    return;
  }
  for (const key of Object.keys(n)) {
    if (IGNORED_KEYS.has(key)) {
      continue;
    }
    renameIdentifierReferences(n[key], fromName, toName);
  }
}

function uniqueIdentifierName(node: unknown, baseName: string): string {
  const names = new Set<string>();
  collectIdentifierNames(node, names);
  if (!names.has(baseName)) {
    return baseName;
  }
  let index = 1;
  while (names.has(`${baseName}${index}`)) {
    index++;
  }
  return `${baseName}${index}`;
}

function collectIdentifierNames(node: unknown, names: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectIdentifierNames(item, names);
    }
    return;
  }
  const n = node as MutableNode;
  if (n.type === "Identifier" && typeof n.name === "string") {
    names.add(n.name);
  }
  for (const key of Object.keys(n)) {
    if (IGNORED_KEYS.has(key)) {
      continue;
    }
    collectIdentifierNames(n[key], names);
  }
}

function replaceNode(target: MutableNode, replacement: ASTNode): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, replacement);
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

const IGNORED_KEYS = new Set([
  "comments",
  "id",
  "leadingComments",
  "loc",
  "returnType",
  "type",
  "typeAnnotation",
  "typeParameters",
]);
