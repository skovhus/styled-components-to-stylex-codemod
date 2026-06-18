/**
 * Shared low-level AST helpers used across the finalize-decl modules:
 * identifier rewriting, style-object → AST property conversion, structural
 * shape keys, and property-name collection.
 */
import { literalToAst, objectToAst } from "../transform/helpers.js";
import { isAstNode } from "../utilities/jscodeshift-utils.js";

export type ASTProperty = { key?: { name?: string; value?: string }; value?: unknown };

export function findBodyProperty(properties: ASTProperty[], key: string): ASTProperty | undefined {
  return properties.find((p) => (p.key?.name ?? p.key?.value) === key);
}

/**
 * Converts style object entries to AST property nodes for insertion into
 * a function body's ObjectExpression. Used by mergeBaseIntoSingleStyleFn
 * and mergeVariantBucketsIntoStyleFns to fold static properties into
 * dynamic style functions.
 */
export function styleObjToAstProperties(
  j: Parameters<typeof literalToAst>[0],
  obj: Record<string, unknown>,
  skip?: ReadonlySet<string>,
): unknown[] {
  const props: unknown[] = [];
  for (const [cssProp, cssValue] of Object.entries(obj)) {
    if (cssProp.startsWith("__") || skip?.has(cssProp)) {
      continue;
    }
    const valueAst =
      cssValue && typeof cssValue === "object" && !isAstNode(cssValue) && !Array.isArray(cssValue)
        ? objectToAst(j, cssValue as Record<string, unknown>)
        : literalToAst(j, cssValue);
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cssProp)
      ? j.identifier(cssProp)
      : j.literal(cssProp);
    props.push(j.property("init", key, valueAst));
  }
  return props;
}

/**
 * Recursively replaces all `Identifier` references matching `oldName` with
 * `props.oldName` (a MemberExpression). Handles shorthand properties by
 * un-shorthanding them.
 */
export function replaceIdentifierInAst(
  j: Parameters<typeof literalToAst>[0],
  node: unknown,
  oldName: string,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const n = node as Record<string, unknown>;

  if (n.type === "ObjectExpression") {
    const properties = n.properties as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(properties)) {
      return;
    }
    for (const prop of properties) {
      if (prop.type === "SpreadElement" || prop.type === "SpreadProperty") {
        if (
          (prop.argument as { type?: string; name?: string })?.type === "Identifier" &&
          (prop.argument as { name?: string }).name === oldName
        ) {
          prop.argument = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, prop.argument, oldName);
        }
        continue;
      }
      if (prop.type !== "Property") {
        continue;
      }
      // Handle shorthand: `{ color }` → `{ color: props.color }`
      if (
        prop.shorthand &&
        (prop.value as { type?: string; name?: string })?.type === "Identifier" &&
        (prop.value as { name?: string }).name === oldName
      ) {
        prop.shorthand = false;
        prop.value = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        continue;
      }
      // Recurse into value (but not key unless computed)
      if (prop.computed) {
        if (
          (prop.key as { type?: string; name?: string })?.type === "Identifier" &&
          (prop.key as { name?: string }).name === oldName
        ) {
          prop.key = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, prop.key, oldName);
        }
      }
      // Direct replacement when value is the target Identifier
      if (
        (prop.value as { type?: string; name?: string })?.type === "Identifier" &&
        (prop.value as { name?: string }).name === oldName
      ) {
        prop.value = j.memberExpression(j.identifier("props"), j.identifier(oldName));
      } else {
        replaceIdentifierInAst(j, prop.value, oldName);
      }
    }
    return;
  }

  // For all other node types, walk children and replace matching Identifiers
  for (const key of Object.keys(n)) {
    if (key === "type" || key === "loc" || key === "start" || key === "end" || key === "comments") {
      continue;
    }
    // Skip non-computed MemberExpression.property — it's a property name, not a variable reference
    if (key === "property" && n.type === "MemberExpression" && !n.computed) {
      continue;
    }
    const child = n[key];
    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (
          (child[i] as { type?: string; name?: string })?.type === "Identifier" &&
          (child[i] as { name?: string }).name === oldName
        ) {
          child[i] = j.memberExpression(j.identifier("props"), j.identifier(oldName));
        } else {
          replaceIdentifierInAst(j, child[i], oldName);
        }
      }
    } else if (
      (child as { type?: string; name?: string })?.type === "Identifier" &&
      (child as { name?: string }).name === oldName
    ) {
      n[key] = j.memberExpression(j.identifier("props"), j.identifier(oldName));
    } else if (child && typeof child === "object" && (child as { type?: string }).type) {
      replaceIdentifierInAst(j, child, oldName);
    }
  }
}

export function astShapeKey(node: unknown): string {
  if (node === undefined) {
    return "";
  }
  const seen = new WeakSet<object>();
  return JSON.stringify(node, (key, value) => {
    if (
      key === "loc" ||
      key === "tokens" ||
      key === "comments" ||
      key === "start" ||
      key === "end"
    ) {
      return undefined;
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  });
}

/** Recursively renames all Identifier nodes with `oldName` to `newName` in an AST subtree.
 *  Skips property keys (the `key` field of Property nodes) to avoid renaming CSS property names. */
export function renameIdentifierInAst(node: unknown, oldName: string, newName: string): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      renameIdentifierInAst(item, oldName, newName);
    }
    return;
  }
  const n = node as Record<string, unknown>;
  if (n.type === "Identifier" && n.name === oldName) {
    n.name = newName;
    return;
  }
  for (const key of Object.keys(n)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    // Skip property keys — only rename in values
    if (key === "key" && n.type === "Property") {
      continue;
    }
    const child = n[key];
    if (child && typeof child === "object") {
      renameIdentifierInAst(child, oldName, newName);
    }
  }
}

export function collectObjectExpressionPropertyNames(node: unknown, props: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectObjectExpressionPropertyNames(child, props);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.type === "ObjectExpression" && Array.isArray(record.properties)) {
    for (const property of record.properties) {
      const propName = readObjectPropertyName(property);
      if (propName && !propName.startsWith("__")) {
        props.add(propName);
      }
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    collectObjectExpressionPropertyNames(child, props);
  }
}

export function isStyleObjectForCssVarDrop(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && !isAstNode(value));
}

// --- Non-exported helpers ---

function readObjectPropertyName(property: unknown): string | null {
  if (!property || typeof property !== "object") {
    return null;
  }
  const record = property as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string; value?: unknown };
  };
  if (record.type !== "Property" || record.computed) {
    return null;
  }
  if (record.key?.type === "Identifier") {
    return record.key.name ?? null;
  }
  if (
    (record.key?.type === "Literal" || record.key?.type === "StringLiteral") &&
    typeof record.key.value === "string"
  ) {
    return record.key.value;
  }
  return null;
}
