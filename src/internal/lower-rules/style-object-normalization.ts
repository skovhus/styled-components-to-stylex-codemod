import {
  BORDER_RADIUS_LONGHAND_PROPS,
  expandBorderRadiusInStyleObject,
  expandBorderRadiusShorthandValue,
} from "../css-border-radius.js";
import { propagatePropComments } from "./comments.js";

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
  const normalized = expandBorderRadiusInStyleObject(styleObj, expanded);
  propagatePropComments(normalized, "borderRadius", BORDER_RADIUS_LONGHAND_PROPS);
  return normalized;
}

/**
 * Resolves a style value to a static string when possible: plain strings,
 * string-literal AST nodes, and expression-free template literals.
 */
export function staticStringValue(value: unknown): string | null {
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
