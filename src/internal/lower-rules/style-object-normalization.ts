import { expandBorderRadiusShorthandValue } from "../css-border-radius.js";

export function expandStyleObjectShorthands(
  styleObj: Record<string, unknown>,
): Record<string, unknown> {
  const borderRadius = staticStringValue(styleObj.borderRadius);
  if (borderRadius === null) {
    return styleObj;
  }
  const expanded = expandBorderRadiusShorthandValue(borderRadius);
  if (!expanded) {
    return styleObj;
  }
  const next = { ...styleObj };
  delete next.borderRadius;
  next.borderTopLeftRadius = expanded.topLeft;
  next.borderTopRightRadius = expanded.topRight;
  next.borderBottomRightRadius = expanded.bottomRight;
  next.borderBottomLeftRadius = expanded.bottomLeft;
  return next;
}

function staticStringValue(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const node = value as {
    type?: string;
    value?: unknown;
    quasis?: Array<{ value?: { cooked?: string | null; raw?: string } }>;
    expressions?: unknown[];
  };
  if (
    (node.type === "Literal" || node.type === "StringLiteral") &&
    typeof node.value === "string"
  ) {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions?.length === 0) {
    const quasi = node.quasis?.[0];
    return quasi?.value?.cooked ?? quasi?.value?.raw ?? null;
  }
  return null;
}
