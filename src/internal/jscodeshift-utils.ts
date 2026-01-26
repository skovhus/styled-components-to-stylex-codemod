import type { ArrowFunctionExpression, ASTNode, Expression, Identifier, Node } from "jscodeshift";

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

export function getNodeLocStart(
  node: Node | null | undefined,
): { line: number; column: number } | null {
  const loc = node?.loc?.start;
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

// Internal helper - not exported
function isIdentifier(node: unknown, name?: string): node is Identifier {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Identifier" &&
    (name ? (node as Identifier).name === name : true)
  );
}
