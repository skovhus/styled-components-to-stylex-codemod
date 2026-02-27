/**
 * Shared JSX literal extraction helpers for transform steps.
 * Core concept: safely reading static literal attribute values from AST nodes.
 */

type StaticJsxLiteral = string | number | boolean;

export function readStaticJsxLiteral(attr: unknown): StaticJsxLiteral | undefined {
  if (!isObjectRecord(attr) || attr.type !== "JSXAttribute") {
    return undefined;
  }
  if (!("value" in attr) || attr.value == null) {
    // <Comp prop />
    return true;
  }

  const directLiteral = readLiteralNodeValue(attr.value);
  if (directLiteral !== undefined) {
    return directLiteral;
  }

  if (!isObjectRecord(attr.value) || attr.value.type !== "JSXExpressionContainer") {
    return undefined;
  }
  return readLiteralNodeValue(attr.value.expression);
}

function readLiteralNodeValue(node: unknown): StaticJsxLiteral | undefined {
  if (!isObjectRecord(node)) {
    return undefined;
  }

  if (
    node.type === "StringLiteral" ||
    node.type === "NumericLiteral" ||
    node.type === "BooleanLiteral"
  ) {
    return isStaticLiteral(node.value) ? node.value : undefined;
  }

  if (node.type === "Literal") {
    return isStaticLiteral(node.value) ? node.value : undefined;
  }

  return undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStaticLiteral(value: unknown): value is StaticJsxLiteral {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
