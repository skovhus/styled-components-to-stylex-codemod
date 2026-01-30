import type { ArrowFunctionExpression, ASTNode, Expression, Identifier } from "jscodeshift";

/**
 * AST type definitions for common node patterns.
 */
export type IdentifierNode = {
  type: "Identifier";
  name: string;
};

export type CallExpressionNode = {
  type: "CallExpression";
  callee: unknown;
  arguments?: unknown[];
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
};

export type AstPath = {
  node: ASTNode;
  parentPath?: AstPath | null;
};

/**
 * Result of extracting root identifier and member path from an expression.
 */
export type RootIdentifierInfo = {
  rootName: string;
  rootNode: Identifier;
  path: string[];
};

/**
 * Extracts the root identifier and member path from an expression.
 *
 * Examples:
 *   `zIndex`                  → { rootName: "zIndex", rootNode: <ident>, path: [] }
 *   `zIndex.modal`            → { rootName: "zIndex", rootNode: <ident>, path: ["modal"] }
 *   `config.ui.spacing.small` → { rootName: "config", rootNode: <ident>, path: ["ui", "spacing", "small"] }
 *
 * Returns null for computed properties, non-identifier roots, or invalid expressions.
 */
export function extractRootAndPath(node: unknown): RootIdentifierInfo | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const typed = node as { type?: string };

  // Simple identifier case
  if (typed.type === "Identifier") {
    const ident = node as Identifier;
    return { rootName: ident.name, rootNode: ident, path: [] };
  }

  // Not a member expression
  if (typed.type !== "MemberExpression" && typed.type !== "OptionalMemberExpression") {
    return null;
  }

  // Walk the member expression chain
  const parts: string[] = [];
  let cur: unknown = node;

  while (cur && typeof cur === "object") {
    const curTyped = cur as {
      type?: string;
      computed?: boolean;
      property?: unknown;
      object?: unknown;
    };
    if (curTyped.type !== "MemberExpression" && curTyped.type !== "OptionalMemberExpression") {
      break;
    }
    // Computed properties (bracket notation with non-literal) are not supported
    if (curTyped.computed) {
      return null;
    }
    const prop = curTyped.property as { type?: string; name?: string } | undefined;
    if (!prop || prop.type !== "Identifier" || typeof prop.name !== "string") {
      return null;
    }
    parts.unshift(prop.name);
    cur = curTyped.object;
  }

  // Verify root is an identifier
  if (!cur || typeof cur !== "object") {
    return null;
  }
  const rootTyped = cur as { type?: string; name?: string };
  if (rootTyped.type !== "Identifier" || typeof rootTyped.name !== "string") {
    return null;
  }

  return { rootName: rootTyped.name, rootNode: cur as Identifier, path: parts };
}

/**
 * Extracts the member path from an expression, validating that the root is a specific identifier.
 *
 * Examples (with rootIdentName="props"):
 *   `props.theme.color.primary` → ["theme", "color", "primary"]
 *   `props.className`           → ["className"]
 *   `other.theme`               → null (root doesn't match)
 *
 * Returns null if:
 *   - The expression contains computed properties
 *   - The root identifier doesn't match rootIdentName
 *   - The expression is not a valid member chain
 */
export function getMemberPathFromIdentifier(
  expr: Expression,
  rootIdentName: string,
): string[] | null {
  const info = extractRootAndPath(expr);
  if (!info || info.rootName !== rootIdentName) {
    return null;
  }
  return info.path;
}

/**
 * Type guard for IdentifierNode (minimal type with just type and name).
 */
export function isIdentifierNode(node: unknown): node is IdentifierNode {
  if (!node || typeof node !== "object") {
    return false;
  }
  const typed = node as { type?: unknown; name?: unknown };
  return typed.type === "Identifier" && typeof typed.name === "string";
}

/**
 * Type guard for CallExpression nodes.
 */
export function isCallExpressionNode(node: unknown): node is CallExpressionNode {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "CallExpression"
  );
}

/**
 * Type guard for AstPath objects (jscodeshift path wrappers).
 */
export function isAstPath(value: unknown): value is AstPath {
  return !!value && typeof value === "object" && "node" in value;
}

/**
 * Type guard for AST nodes (objects with a string `type` property).
 * Returns false for arrays and non-objects.
 */
export function isAstNode(v: unknown): v is { type: string } {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as { type?: unknown }).type === "string"
  );
}

/**
 * Type guard for function-like nodes (FunctionDeclaration, FunctionExpression, ArrowFunctionExpression).
 */
export function isFunctionNode(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const type = (node as { type?: string }).type;
  return (
    type === "FunctionDeclaration" ||
    type === "FunctionExpression" ||
    type === "ArrowFunctionExpression"
  );
}

/**
 * Type guard for ArrowFunctionExpression nodes.
 */
export function isArrowFunctionExpression(node: unknown): node is ArrowFunctionExpression {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "ArrowFunctionExpression"
  );
}

/**
 * Extracts the id from a VariableDeclarator node.
 */
export function getDeclaratorId(decl: unknown): unknown {
  if (!decl || typeof decl !== "object") {
    return null;
  }
  if (!("id" in decl)) {
    return null;
  }
  return (decl as { id?: unknown }).id ?? null;
}

export function getArrowFnSingleParamName(fn: ArrowFunctionExpression): string | null {
  if (fn.params.length !== 1) {
    return null;
  }
  const p = fn.params[0];
  return isIdentifier(p) ? p.name : null;
}

/**
 * Information about arrow function parameter bindings.
 *
 * For simple params like `(props) => ...`:
 *   { kind: "simple", paramName: "props" }
 *
 * For destructured params like `({ color, size: size_ }) => ...`:
 *   { kind: "destructured", bindings: Map { "color" -> "color", "size_" -> "size" } }
 *   where the map is: localName -> originalPropName
 */
export type ArrowFnParamBindings =
  | { kind: "simple"; paramName: string }
  | { kind: "destructured"; bindings: Map<string, string> };

/**
 * Extracts parameter binding information from an arrow function.
 *
 * Supports:
 * - Simple identifier params: `(props) => ...`
 * - Destructured params: `({ color }) => ...`
 * - Renamed destructured params: `({ color: color_ }) => ...`
 * - Default values: `({ color = "red" }) => ...`
 * - Renamed with defaults: `({ color: color_ = "red" }) => ...`
 *
 * Returns null for:
 * - Functions with != 1 parameter
 * - Rest elements in destructuring (not supported)
 * - Computed property keys
 */
export function getArrowFnParamBindings(fn: ArrowFunctionExpression): ArrowFnParamBindings | null {
  if (fn.params.length !== 1) {
    return null;
  }
  const p = fn.params[0];

  // Simple identifier: (props) => ...
  if (isIdentifier(p)) {
    return { kind: "simple", paramName: p.name };
  }

  // Object pattern: ({ color, size: size_ }) => ...
  if (p?.type === "ObjectPattern" && Array.isArray((p as { properties?: unknown[] }).properties)) {
    const bindings = new Map<string, string>();
    const props = (p as { properties: Array<{ type?: string; key?: unknown; value?: unknown }> })
      .properties;
    for (const prop of props) {
      // Rest elements not supported: ({ ...rest }) => ...
      if (prop.type === "RestElement") {
        return null;
      }
      if (prop.type !== "Property" && prop.type !== "ObjectProperty") {
        continue;
      }
      // Computed keys not supported: { [expr]: value }
      // Must bail completely to avoid mis-resolving when computed key shadows a static identifier
      const propTyped = prop as { computed?: boolean; key?: unknown };
      if (propTyped.computed === true) {
        return null;
      }
      const key = prop.key as { type?: string; name?: string } | undefined;
      if (!key || key.type !== "Identifier") {
        return null;
      }
      const propName = key.name;
      if (!propName) {
        continue;
      }

      const value = prop.value as { type?: string; name?: string; left?: unknown } | undefined;
      // Shorthand: { color } -> color maps to color
      if (value?.type === "Identifier" && typeof value.name === "string") {
        bindings.set(value.name, propName);
      }
      // Default value: { color = "red" } or { color: color_ = "red" }
      else if (value?.type === "AssignmentPattern") {
        const left = value.left as { type?: string; name?: string } | undefined;
        if (left?.type === "Identifier" && typeof left.name === "string") {
          bindings.set(left.name, propName);
        }
      }
    }
    if (bindings.size === 0) {
      return null;
    }
    return { kind: "destructured", bindings };
  }

  return null;
}

/**
 * Given an identifier node and param bindings, resolves the original prop name.
 *
 * For destructured params like `({ color: color_ }) => color_`:
 *   resolveIdentifierToPropName(color_Node, bindings) -> "color"
 *
 * Returns null if the identifier doesn't correspond to a destructured prop.
 */
export function resolveIdentifierToPropName(
  node: unknown,
  bindings: ArrowFnParamBindings,
): string | null {
  if (!node || typeof node !== "object") {
    return null;
  }

  const typed = node as { type?: string; name?: string };
  if (typed.type !== "Identifier" || typeof typed.name !== "string") {
    return null;
  }

  if (bindings.kind === "simple") {
    // For simple params, the identifier itself is the param name, not a prop reference
    // The caller should use getMemberPathFromIdentifier for member expressions
    return null;
  }

  // For destructured params, look up the local name in the bindings
  return bindings.bindings.get(typed.name) ?? null;
}

export function getNodeLocStart(node: unknown): { line: number; column: number } | null {
  const n = node as { loc?: { start?: { line: number; column: number } } } | null | undefined;
  const loc = n?.loc?.start;
  if (!loc) {
    return null;
  }
  return { line: loc.line, column: loc.column };
}

/**
 * Extracts the expression from an arrow/function expression body.
 * - For expression bodies: returns the expression directly
 * - For block bodies: returns the argument of the return statement,
 *   but ONLY if the block contains exactly one statement (a ReturnStatement).
 *   This ensures we don't support arrow functions with complex logic in the body.
 */
export function getFunctionBodyExpr(fn: { body?: unknown }): unknown {
  const body = fn.body;
  if (!body || typeof body !== "object") {
    return undefined;
  }
  if ((body as { type?: string }).type === "BlockStatement") {
    const block = body as { body?: Array<{ type?: string; argument?: unknown }> };
    const statements = block.body;
    // Only accept block bodies with exactly one ReturnStatement (no other logic)
    if (statements?.length !== 1 || statements[0]?.type !== "ReturnStatement") {
      return undefined;
    }
    return statements[0].argument;
  }
  return body;
}

/**
 * Recursively collects all Identifier names from an AST node into a Set.
 * Skips 'loc' and 'comments' properties to avoid traversing metadata.
 *
 * @param node - The AST node to traverse
 * @param out - The Set to collect identifier names into
 */
export function collectIdentifiers(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectIdentifiers(child, out);
    }
    return;
  }
  const typed = node as { type?: string; name?: string };
  if (typed.type === "Identifier" && typed.name) {
    out.add(typed.name);
  }
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    collectIdentifiers((node as Record<string, unknown>)[key], out);
  }
}

/**
 * Converts an AST literal node to its static JavaScript value.
 *
 * Supports:
 * - StringLiteral, NumericLiteral, BooleanLiteral (Babel AST)
 * - Literal (ESTree/recast AST)
 * - TemplateLiteral without expressions (static template strings)
 * - TaggedTemplateExpression with css tag (styled-components css helper)
 *
 * Returns null for non-literal or dynamic nodes.
 */
export function literalToStaticValue(node: unknown): string | number | boolean | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const type = (node as { type?: string }).type;
  if (type === "StringLiteral") {
    return (node as { value: string }).value;
  }
  if (type === "BooleanLiteral") {
    return (node as { value: boolean }).value;
  }
  // Some parsers (or mixed ASTs) use estree-style `Literal`.
  if (type === "Literal") {
    const v = (node as { value?: unknown }).value;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      return v;
    }
  }
  if (type === "NumericLiteral") {
    return (node as { value: number }).value;
  }
  // Handle TemplateLiteral without expressions (static template string)
  if (type === "TemplateLiteral") {
    const n = node as { expressions?: unknown[]; quasis?: Array<{ value?: { raw?: string } }> };
    if (!n.expressions || n.expressions.length === 0) {
      const quasis = n.quasis ?? [];
      return quasis.map((q) => q.value?.raw ?? "").join("");
    }
  }
  // Handle css`` tagged template literal (styled-components css helper)
  if (type === "TaggedTemplateExpression") {
    const n = node as { tag?: { type?: string; name?: string }; quasi?: unknown };
    if (n.tag?.type === "Identifier" && n.tag.name === "css") {
      return literalToStaticValue(n.quasi);
    }
  }
  return null;
}

/**
 * Converts an AST literal node to a string value.
 * Returns null if the node is not a string literal.
 */
export function literalToString(node: unknown): string | null {
  const v = literalToStaticValue(node);
  return typeof v === "string" ? v : null;
}

/**
 * Set of AST metadata keys that should typically be skipped during traversal or cloning.
 * These keys contain position/source information and are not part of the logical AST structure.
 */
const AST_METADATA_KEYS = new Set(["loc", "start", "end", "range", "comments", "tokens"]);

/**
 * Deep clones an AST node, stripping metadata properties (loc, comments, tokens, etc.).
 * Useful for creating modified copies of AST nodes without mutating the original.
 *
 * @param node - The AST node to clone
 * @returns A deep clone with metadata properties removed
 */
export function cloneAstNode<T>(node: T): T {
  if (!node || typeof node !== "object") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(cloneAstNode) as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (AST_METADATA_KEYS.has(key)) {
      continue;
    }
    out[key] = cloneAstNode((node as Record<string, unknown>)[key]);
  }
  return out as T;
}

/**
 * Type guard for LogicalExpression nodes.
 */
export function isLogicalExpressionNode(
  node: unknown,
): node is { type: "LogicalExpression"; operator: string; left: Expression; right: Expression } {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "LogicalExpression"
  );
}

/**
 * Type guard for ConditionalExpression nodes.
 */
export function isConditionalExpressionNode(node: unknown): node is {
  type: "ConditionalExpression";
  test: Expression;
  consequent: Expression;
  alternate: Expression;
} {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "ConditionalExpression"
  );
}

// Internal helper - not exported
function isIdentifier(node: unknown, name?: string): node is Identifier {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Identifier" &&
    (name ? (node as Identifier).name === name : true)
  );
}
