/**
 * Generic depth-first AST traversal shared across transform layers.
 *
 * Skips `loc`/`comments` metadata keys so visitors only see real AST nodes.
 */

type AnyAstNode = Record<string, unknown>;

const SKIPPED_KEYS = new Set(["loc", "comments", "leadingComments", "trailingComments"]);

export function walkAst(root: unknown, visitor: (node: AnyAstNode) => void): void {
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    const n = node as AnyAstNode;
    visitor(n);
    for (const key of Object.keys(n)) {
      if (SKIPPED_KEYS.has(key)) {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(root);
}
