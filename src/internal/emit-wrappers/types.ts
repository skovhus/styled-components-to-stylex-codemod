/**
 * Wrapper emission types and inline prop utilities.
 * Core concepts: export metadata and inline style prop collection.
 */
import type { ASTNode, JSCodeshift } from "jscodeshift";
import { isMemberExpression } from "../lower-rules/utils.js";

export type ExportInfo = { exportName: string; isDefault: boolean; isSpecifier: boolean };

/**
 * Native HTML attributes that must not be used as renamed transient prop names
 * for specific intrinsic element types. Renaming `$disabled` → `disabled` on a
 * `<button>` would change behavior (the button becomes actually HTML-disabled
 * instead of just styling-disabled).
 */
export const BLOCKED_INTRINSIC_ATTR_RENAMES: Readonly<Record<string, readonly string[]>> = {
  button: ["disabled"],
  input: ["disabled"],
  select: ["disabled"],
  textarea: ["disabled"],
  fieldset: ["disabled"],
};
export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];
export type InlineStyleProp = { prop: string; expr: ExpressionKind; jsxProp?: string };
export type WrapperPropDefaultValue = string | number | boolean;
export type WrapperPropDefaults = Map<string, WrapperPropDefaultValue>;
/**
 * Collects prop identifiers referenced by inline style expressions.
 * `$`-prefixed names are transient props that must be destructured,
 * and optional `jsxProp` hints capture additional prop dependencies.
 */
export function collectInlineStylePropNames(inlineStyleProps: InlineStyleProp[]): string[] {
  const names = new Set<string>();
  for (const p of inlineStyleProps) {
    if (p.jsxProp) {
      names.add(p.jsxProp);
    }
  }
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
      const memberParent =
        parent && isMemberExpression(parent)
          ? (parent as { property: unknown; computed: boolean })
          : undefined;
      const isMemberProp =
        memberParent && memberParent.property === node && memberParent.computed === false;
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
