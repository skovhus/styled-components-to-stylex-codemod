/**
 * Helpers for emitting numeric StyleX values when CSS px units are implicit.
 */
import type { JSCodeshift } from "jscodeshift";

import { isStylexStringOnlyCssProp } from "../css-prop-mapping.js";

export type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

type NumericPxOptions = {
  numericIdentifiers?: ReadonlySet<string>;
};

const STYLEX_PX_IMPLICIT_PROPS = new Set([
  "blockSize",
  "borderBlockEndWidth",
  "borderBlockStartWidth",
  "borderBlockWidth",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "borderBottomWidth",
  "borderEndEndRadius",
  "borderEndStartRadius",
  "borderInlineEndWidth",
  "borderInlineStartWidth",
  "borderInlineWidth",
  "borderLeftWidth",
  "borderRadius",
  "borderRightWidth",
  "borderStartEndRadius",
  "borderStartStartRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "columnGap",
  "fontSize",
  "gap",
  "height",
  "inlineSize",
  "inset",
  "insetBlock",
  "insetBlockEnd",
  "insetBlockStart",
  "insetInline",
  "insetInlineEnd",
  "insetInlineStart",
  "left",
  "letterSpacing",
  "margin",
  "marginBlock",
  "marginBlockEnd",
  "marginBlockStart",
  "marginBottom",
  "marginInline",
  "marginInlineEnd",
  "marginInlineStart",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxBlockSize",
  "maxHeight",
  "maxInlineSize",
  "maxWidth",
  "minBlockSize",
  "minHeight",
  "minInlineSize",
  "minWidth",
  "padding",
  "paddingBlock",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingBottom",
  "paddingInline",
  "paddingInlineEnd",
  "paddingInlineStart",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "perspective",
  "right",
  "rowGap",
  "scrollMargin",
  "scrollMarginBlock",
  "scrollMarginBlockEnd",
  "scrollMarginBlockStart",
  "scrollMarginBottom",
  "scrollMarginInline",
  "scrollMarginInlineEnd",
  "scrollMarginInlineStart",
  "scrollMarginLeft",
  "scrollMarginRight",
  "scrollMarginTop",
  "scrollPadding",
  "scrollPaddingBlock",
  "scrollPaddingBlockEnd",
  "scrollPaddingBlockStart",
  "scrollPaddingBottom",
  "scrollPaddingInline",
  "scrollPaddingInlineEnd",
  "scrollPaddingInlineStart",
  "scrollPaddingLeft",
  "scrollPaddingRight",
  "scrollPaddingTop",
  "top",
  "translate",
  "width",
]);

export function canOmitPxUnitForStylexNumber(
  stylexProp: string,
  prefix: string,
  suffix: string,
  important = false,
): boolean {
  return (
    !important &&
    STYLEX_PX_IMPLICIT_PROPS.has(stylexProp) &&
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
  options: NumericPxOptions = {},
): ExpressionKind {
  if (
    canOmitPxUnitForStylexNumber(stylexProp, prefix, suffix, important) &&
    isNumericStylexExpression(expr, options)
  ) {
    return prefix === "-" ? (j.unaryExpression("-", expr, true) as ExpressionKind) : expr;
  }
  return buildTemplate(expr, prefix, suffix);
}

export function maybeOmitPxUnitFromStylexValue(
  j: JSCodeshift,
  value: ExpressionKind,
  stylexProp: string,
  important = false,
  options: NumericPxOptions = {},
): ExpressionKind {
  if (value.type === "ConditionalExpression") {
    return {
      ...value,
      consequent: maybeOmitPxUnitFromStylexValue(
        j,
        value.consequent as ExpressionKind,
        stylexProp,
        important,
        options,
      ),
      alternate: maybeOmitPxUnitFromStylexValue(
        j,
        value.alternate as ExpressionKind,
        stylexProp,
        important,
        options,
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
        options,
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
  if (
    !canOmitPxUnitForStylexNumber(stylexProp, prefix, suffix, important) ||
    !isNumericStylexExpression(value.expressions[0] as ExpressionKind, options)
  ) {
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
  options: NumericPxOptions = {},
): unknown {
  if (typeof value === "string") {
    const pxMatch = /^(-?\d*\.?\d+)px$/.exec(value);
    if (pxMatch && canOmitPxUnitForStylexNumber(stylexProp, "", "px", important)) {
      return Number(pxMatch[1]);
    }
  }
  if (isExpressionNode(value)) {
    return maybeOmitPxUnitFromStylexValue(j, value, stylexProp, important, options);
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
                options,
              ),
            }
          : entry,
      );
      continue;
    }
    next[key] = maybeOmitPxUnitFromStylexStyleValue(j, entryValue, stylexProp, important, options);
  }
  return next;
}

export function isNumericStylexExpression(
  value: ExpressionKind | undefined,
  options: NumericPxOptions = {},
): boolean {
  if (!value) {
    return false;
  }
  if (
    value.type === "NumericLiteral" ||
    (value.type === "Literal" && typeof value.value === "number")
  ) {
    return true;
  }
  if (value.type === "Identifier") {
    return options.numericIdentifiers?.has(value.name) ?? false;
  }
  if (value.type === "MemberExpression") {
    const rootName = memberExpressionRootIdentifier(value);
    return rootName ? (options.numericIdentifiers?.has(rootName) ?? false) : false;
  }
  if (value.type === "UnaryExpression") {
    return (
      (value.operator === "-" || value.operator === "+") &&
      isNumericStylexExpression(value.argument as ExpressionKind, options)
    );
  }
  if (value.type === "BinaryExpression") {
    return (
      ["+", "-", "*", "/", "%", "**"].includes(value.operator) &&
      isNumericStylexExpression(value.left as ExpressionKind, options) &&
      isNumericStylexExpression(value.right as ExpressionKind, options)
    );
  }
  if (value.type === "LogicalExpression") {
    return (
      value.operator === "??" &&
      isNumericStylexExpression(value.left as ExpressionKind, options) &&
      isNumericStylexExpression(value.right as ExpressionKind, options)
    );
  }
  if (value.type === "ConditionalExpression") {
    return (
      isNumericStylexExpression(value.consequent as ExpressionKind, options) &&
      isNumericStylexExpression(value.alternate as ExpressionKind, options)
    );
  }
  if (
    value.type === "TSAsExpression" ||
    value.type === "TSSatisfiesExpression" ||
    value.type === "TSNonNullExpression" ||
    value.type === "ParenthesizedExpression"
  ) {
    return isNumericStylexExpression(value.expression as ExpressionKind, options);
  }
  return false;
}

function isExpressionNode(value: unknown): value is ExpressionKind {
  return Boolean(
    value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string",
  );
}

function memberExpressionRootIdentifier(value: ExpressionKind): string | null {
  if (value.type === "Identifier") {
    return value.name;
  }
  if (value.type !== "MemberExpression") {
    return null;
  }
  return memberExpressionRootIdentifier(value.object as ExpressionKind);
}
