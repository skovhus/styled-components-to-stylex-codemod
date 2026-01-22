import type { ASTNode, JSCodeshift } from "jscodeshift";

export type ExportInfo = { exportName: string; isDefault: boolean; isSpecifier: boolean };
export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
export type InlineStyleProp = { prop: string; expr: ExpressionKind }; /**
 * Collects $-prefixed identifier names from inline style expressions.
 * These represent transient props that need to be destructured for styling.
 */
export function collectInlineStylePropNames(inlineStyleProps: InlineStyleProp[]): string[] {
  const names = new Set<string>();
  const visit = (node: ASTNode | null | undefined, parent: ASTNode | undefined): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child, parent);
      }
      return;
    }
    if (node.type === "Identifier") {
      const isMemberProp =
        parent &&
        (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression") &&
        parent.property === node &&
        parent.computed === false;
      const isObjectKey =
        parent && parent.type === "Property" && parent.key === node && parent.shorthand !== true;
      if (!isMemberProp && !isObjectKey && node.name?.startsWith("$")) {
        names.add(node.name);
      }
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as unknown as Record<string, unknown>)[key];
      if (child && typeof child === "object") {
        visit(child as ASTNode, node);
      }
    }
  };
  for (const p of inlineStyleProps) {
    visit(p.expr, undefined);
  }
  return [...names];
}
