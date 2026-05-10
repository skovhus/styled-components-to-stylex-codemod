/**
 * Utilities for inspecting JSX child arrays.
 * Core concepts: parent lookup and JSX child node guards.
 */

type JsxChildrenOwner = {
  type?: string;
  children?: unknown[];
  openingElement?: { name?: unknown };
};

export type JsxPath = { node: unknown; parentPath?: unknown };

type JsxParentPath = { node?: JsxChildrenOwner; parentPath?: unknown };

export function findContainingJsxChildrenOwner(path: JsxPath): JsxChildrenOwner | undefined {
  const currentNode = path.node;
  let cursor = path.parentPath as JsxParentPath | undefined;

  while (cursor) {
    const candidate = cursor.node;
    if (
      candidate &&
      (candidate.type === "JSXElement" || candidate.type === "JSXFragment") &&
      Array.isArray(candidate.children) &&
      candidate.children.includes(currentNode)
    ) {
      return candidate;
    }
    cursor = cursor.parentPath as JsxParentPath | undefined;
  }

  return undefined;
}

export function isJsxTextChild(child: unknown): child is { type: "JSXText"; value: string } {
  return (
    typeof child === "object" &&
    child !== null &&
    (child as { type?: unknown }).type === "JSXText" &&
    typeof (child as { value?: unknown }).value === "string"
  );
}

export function isJsxEmptyExpressionContainer(child: unknown): boolean {
  if (typeof child !== "object" || child === null) {
    return false;
  }
  const maybeExpression = child as {
    type?: unknown;
    expression?: { type?: unknown };
  };
  return (
    maybeExpression.type === "JSXExpressionContainer" &&
    maybeExpression.expression?.type === "JSXEmptyExpression"
  );
}
