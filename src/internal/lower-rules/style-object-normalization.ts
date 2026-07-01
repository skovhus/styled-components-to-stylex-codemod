import {
  BORDER_RADIUS_LONGHAND_PROPS,
  expandBorderRadiusInStyleObject,
  expandBorderRadiusShorthandValue,
} from "../css-border-radius.js";
import { addPropComments, appendPropLeadingLine, type PropCommentMetadata } from "./comments.js";

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

function propagatePropComments(
  styleObj: Record<string, unknown>,
  sourceProp: string,
  targetProps: readonly string[],
): void {
  const sourceComments = propCommentsFor(styleObj, sourceProp);
  if (!sourceComments) {
    return;
  }
  for (const targetProp of targetProps) {
    if (!(targetProp in styleObj)) {
      continue;
    }
    copyPropComments(styleObj, targetProp, sourceComments);
  }
}

function copyPropComments(
  styleObj: Record<string, unknown>,
  targetProp: string,
  comments: PropCommentMetadata,
): void {
  const existing = propCommentsFor(styleObj, targetProp);
  addPropComments(styleObj, targetProp, {
    leading: existing?.leading ?? comments.leading,
    trailingLine: existing?.trailingLine ?? comments.trailingLine,
  });
  appendPropLeadingLine(styleObj, targetProp, comments.leadingLine);
}

function propCommentsFor(
  styleObj: Record<string, unknown>,
  prop: string,
): PropCommentMetadata | null {
  const propComments = styleObj.__propComments;
  if (!isRecord(propComments)) {
    return null;
  }
  const metadata = propComments[prop];
  if (!isRecord(metadata)) {
    return null;
  }
  const comments = {
    leading: stringValue(metadata.leading),
    leadingLine: stringValue(metadata.leadingLine),
    trailingLine: stringValue(metadata.trailingLine),
  };
  return comments.leading || comments.leadingLine || comments.trailingLine ? comments : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
