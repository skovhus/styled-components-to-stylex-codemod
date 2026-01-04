import type {
  ArrowFunctionExpression,
  Expression,
  Identifier,
  MemberExpression,
  Node,
} from "jscodeshift";

function isIdentifier(node: unknown, name?: string): node is Identifier {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Identifier" &&
    (name ? (node as Identifier).name === name : true)
  );
}

function isMemberExpression(node: unknown): node is MemberExpression {
  return (
    !!node && typeof node === "object" && (node as { type?: string }).type === "MemberExpression"
  );
}

export function isArrowFunctionExpression(node: unknown): node is ArrowFunctionExpression {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "ArrowFunctionExpression"
  );
}

/**
 * If `expr` is a simple member chain off an identifier, returns the path segments.
 * Example: `props.theme.colors.primary` -> ["theme","colors","primary"] (when rootIdentName="props")
 */
export function getMemberPathFromIdentifier(
  expr: Expression,
  rootIdentName: string,
): string[] | null {
  const parts: string[] = [];
  let cur: unknown = expr;

  while (isMemberExpression(cur)) {
    if (cur.computed) return null;
    const prop = cur.property;
    if (!isIdentifier(prop)) return null;
    parts.unshift(prop.name);
    cur = cur.object;
  }

  if (!isIdentifier(cur, rootIdentName)) return null;
  return parts;
}

export function getArrowFnSingleParamName(fn: ArrowFunctionExpression): string | null {
  if (fn.params.length !== 1) return null;
  const p = fn.params[0];
  return isIdentifier(p) ? p.name : null;
}

export function getNodeLocStart(
  node: Node | null | undefined,
): { line: number; column: number } | null {
  const loc = node?.loc?.start;
  if (!loc) return null;
  return { line: loc.line, column: loc.column };
}
