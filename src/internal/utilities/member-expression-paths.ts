/**
 * Utilities for collecting qualified member-expression paths.
 * Core concepts: AST traversal and object-member helper references.
 */
import { collectIdentifiers } from "./jscodeshift-utils.js";

export function expressionsReferenceAnyPath(
  expressions: readonly unknown[] | undefined,
  targetPaths: ReadonlySet<string>,
): boolean {
  if (targetPaths.size === 0) {
    return false;
  }
  for (const expression of expressions ?? []) {
    if (nodeReferencesAnyPath(expression, targetPaths)) {
      return true;
    }
  }
  return false;
}

export function collectMemberExpressionPaths(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectMemberExpressionPaths(child, out);
    }
    return;
  }
  const typed = node as {
    type?: string;
    object?: unknown;
    property?: { type?: string; name?: string; value?: unknown };
    computed?: boolean;
  };
  if (typed.type === "MemberExpression") {
    const propertyName = memberPropertyName(typed.property, typed.computed === true);
    const objectPath = memberExpressionPath(typed.object);
    if (objectPath && propertyName) {
      out.add(`${objectPath}.${propertyName}`);
    }
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    collectMemberExpressionPaths((node as Record<string, unknown>)[key], out);
  }
}

function nodeReferencesAnyPath(node: unknown, targetPaths: ReadonlySet<string>): boolean {
  const paths = new Set<string>();
  collectReferencePaths(node, paths);
  for (const path of paths) {
    if (targetPaths.has(path)) {
      return true;
    }
  }
  return false;
}

function collectReferencePaths(node: unknown, out: Set<string>): void {
  collectIdentifiers(node, out);
  collectMemberExpressionPaths(node, out);
}

function memberExpressionPath(node: unknown): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const typed = node as {
    type?: string;
    name?: string;
    object?: unknown;
    property?: { type?: string; name?: string; value?: unknown };
    computed?: boolean;
  };
  if (typed.type === "Identifier" && typed.name) {
    return typed.name;
  }
  if (typed.type !== "MemberExpression") {
    return null;
  }
  const propertyName = memberPropertyName(typed.property, typed.computed === true);
  if (!propertyName) {
    return null;
  }
  const inner = memberExpressionPath(typed.object);
  return inner ? `${inner}.${propertyName}` : null;
}

function memberPropertyName(
  property: { type?: string; name?: string; value?: unknown } | undefined,
  computed: boolean,
): string | null {
  if (!computed && property?.type === "Identifier" && property.name) {
    return property.name;
  }
  if (
    computed &&
    (property?.type === "StringLiteral" || property?.type === "Literal") &&
    typeof property.value === "string"
  ) {
    return property.value;
  }
  return null;
}
