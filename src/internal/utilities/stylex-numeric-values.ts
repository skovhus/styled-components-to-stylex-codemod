/**
 * Helpers for emitting numeric StyleX values when CSS px units are implicit.
 */
import type { JSCodeshift } from "jscodeshift";

import { isStylexStringOnlyCssProp } from "../css-prop-mapping.js";

export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function canOmitPxUnitForStylexNumber(
  stylexProp: string,
  prefix: string,
  suffix: string,
  important = false,
): boolean {
  return (
    !important &&
    (prefix === "" || prefix === "-") &&
    suffix === "px" &&
    stylexProp !== "lineHeight" &&
    !stylexProp.startsWith("--") &&
    !isStylexStringOnlyCssProp(stylexProp)
  );
}

export function buildStylexValueWithStaticParts(
  j: JSCodeshift,
  expr: ExpressionKind,
  prefix: string,
  suffix: string,
  stylexProp: string,
  buildTemplate: (expr: ExpressionKind, prefix: string, suffix: string) => ExpressionKind,
  important = false,
): ExpressionKind {
  if (canOmitPxUnitForStylexNumber(stylexProp, prefix, suffix, important)) {
    return prefix === "-" ? (j.unaryExpression("-", expr, true) as ExpressionKind) : expr;
  }
  return buildTemplate(expr, prefix, suffix);
}

export function maybeOmitPxUnitFromStylexValue(
  j: JSCodeshift,
  value: ExpressionKind,
  stylexProp: string,
  important = false,
): ExpressionKind {
  if (value.type === "ConditionalExpression") {
    return {
      ...value,
      consequent: maybeOmitPxUnitFromStylexValue(
        j,
        value.consequent as ExpressionKind,
        stylexProp,
        important,
      ),
      alternate: maybeOmitPxUnitFromStylexValue(
        j,
        value.alternate as ExpressionKind,
        stylexProp,
        important,
      ),
    } as ExpressionKind;
  }
  if (value.type === "LogicalExpression") {
    return {
      ...value,
      right: maybeOmitPxUnitFromStylexValue(
        j,
        value.right as ExpressionKind,
        stylexProp,
        important,
      ),
    } as ExpressionKind;
  }
  const literalValue =
    value.type === "StringLiteral" || value.type === "Literal" ? value.value : null;
  if (typeof literalValue === "string") {
    const pxMatch = /^(-?\d*\.?\d+)px$/.exec(literalValue);
    if (pxMatch && canOmitPxUnitForStylexNumber(stylexProp, "", "px", important)) {
      return j.literal(Number(pxMatch[1])) as ExpressionKind;
    }
  }
  if (value.type !== "TemplateLiteral" || value.expressions.length !== 1) {
    return value;
  }
  const prefix = value.quasis[0]?.value.raw ?? "";
  const suffix = value.quasis[1]?.value.raw ?? "";
  if (!canOmitPxUnitForStylexNumber(stylexProp, prefix, suffix, important)) {
    return value;
  }
  const expr = value.expressions[0] as ExpressionKind;
  return prefix === "-" ? (j.unaryExpression("-", expr, true) as ExpressionKind) : expr;
}

export function maybeOmitPxUnitFromStylexStyleValue(
  j: JSCodeshift,
  value: unknown,
  stylexProp: string,
  important = false,
): unknown {
  if (typeof value === "string") {
    const pxMatch = /^(-?\d*\.?\d+)px$/.exec(value);
    if (pxMatch && canOmitPxUnitForStylexNumber(stylexProp, "", "px", important)) {
      return Number(pxMatch[1]);
    }
  }
  if (isExpressionNode(value)) {
    return maybeOmitPxUnitFromStylexValue(j, value, stylexProp, important);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(record)) {
    if (key === "__computedKeys" && Array.isArray(entryValue)) {
      next[key] = entryValue.map((entry) =>
        entry && typeof entry === "object" && !Array.isArray(entry)
          ? {
              ...(entry as Record<string, unknown>),
              value: maybeOmitPxUnitFromStylexStyleValue(
                j,
                (entry as { value?: unknown }).value,
                stylexProp,
                important,
              ),
            }
          : entry,
      );
      continue;
    }
    next[key] = maybeOmitPxUnitFromStylexStyleValue(j, entryValue, stylexProp, important);
  }
  return next;
}

function isExpressionNode(value: unknown): value is ExpressionKind {
  return Boolean(
    value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string",
  );
}
