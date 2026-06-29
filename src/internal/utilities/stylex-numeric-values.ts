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
  // A literal CSS unit suffix (e.g. the `px` in `${cond ? calc(...) : 40}px`)
  // must not be appended to a branch that is a CSS math/var function such as
  // `calc(...)`, or the result is invalid CSS (`calc(40px + 8px)px`). When a
  // conditional mixes such a function branch with a bare-numeric branch,
  // distribute the suffix into each branch so only the numeric branch receives
  // the unit. Triggering only on math/var functions keeps this away from
  // identifier-valued properties (e.g. `animation-name: ${...}in`), where the
  // trailing token is part of the value rather than a unit, and needs no
  // per-property length classification. Custom properties (`--*`) are excluded:
  // their value is an opaque token stream where a trailing token (even after a
  // `var()`) may be intentional (e.g. `var(--prefix)in`).
  if (prefix === "" && !stylexProp.startsWith("--") && isRecognizedCssUnitSuffix(suffix)) {
    if (expr.type === "ConditionalExpression" && conditionalHasCssMathFunctionBranch(expr)) {
      return {
        ...expr,
        consequent: buildStylexValueWithStaticParts(
          j,
          expr.consequent as ExpressionKind,
          prefix,
          suffix,
          stylexProp,
          buildTemplate,
          important,
          options,
        ),
        alternate: buildStylexValueWithStaticParts(
          j,
          expr.alternate as ExpressionKind,
          prefix,
          suffix,
          stylexProp,
          buildTemplate,
          important,
          options,
        ),
      } as ExpressionKind;
    }
    if (isCssMathFunctionExpression(expr)) {
      return expr;
    }
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

// The trailing static text after an interpolation is treated as a CSS unit only
// when it is a recognized unit token (`px`, `rem`, `%`, …). Arbitrary trailing
// text (e.g. `!important` modifiers or identifier fragments) must never trigger
// suffix splitting.
function isRecognizedCssUnitSuffix(suffix: string): boolean {
  return suffix === "%" || (/^[a-zA-Z]+$/.test(suffix) && CSS_UNITS.has(suffix.toLowerCase()));
}

// A CSS math or variable function such as `calc(...)`, `min(...)`, `clamp(...)`,
// or `var(...)`. Such a value is already a complete length, so appending a unit
// suffix to it yields invalid CSS (`calc(40px + 8px)px`). It also never appears
// inside identifier-valued properties (e.g. `animation-name`), which makes it an
// unambiguous, property-agnostic trigger for distributing/dropping the suffix.
function isCssMathFunctionExpression(node: ExpressionKind): boolean {
  if (
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "ParenthesizedExpression"
  ) {
    return isCssMathFunctionExpression(node.expression as ExpressionKind);
  }
  if (
    node.type === "StringLiteral" ||
    (node.type === "Literal" && typeof node.value === "string")
  ) {
    return startsWithCssValueFunction(String(node.value));
  }
  if (node.type === "TemplateLiteral") {
    const head = node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? "";
    return startsWithCssValueFunction(head);
  }
  return false;
}

function startsWithCssValueFunction(text: string): boolean {
  return /^\s*(?:calc|min|max|clamp|minmax|var|env)\s*\(/i.test(text);
}

function conditionalHasCssMathFunctionBranch(node: ExpressionKind): boolean {
  if (node.type !== "ConditionalExpression") {
    return isCssMathFunctionExpression(node);
  }
  return (
    conditionalHasCssMathFunctionBranch(node.consequent as ExpressionKind) ||
    conditionalHasCssMathFunctionBranch(node.alternate as ExpressionKind)
  );
}

// Recognized CSS unit tokens (length, time, angle, frequency, resolution, and
// flexible-length). Used to decide whether a trailing suffix is an authored CSS
// unit at all.
const CSS_UNITS = new Set([
  "px",
  "rem",
  "em",
  "ex",
  "ch",
  "cap",
  "ic",
  "lh",
  "rlh",
  "vw",
  "vh",
  "vi",
  "vb",
  "vmin",
  "vmax",
  "svw",
  "svh",
  "lvw",
  "lvh",
  "dvw",
  "dvh",
  "cqw",
  "cqh",
  "cqi",
  "cqb",
  "cqmin",
  "cqmax",
  "cm",
  "mm",
  "q",
  "in",
  "pt",
  "pc",
  "fr",
  "s",
  "ms",
  "deg",
  "grad",
  "rad",
  "turn",
  "hz",
  "khz",
  "dpi",
  "dpcm",
  "dppx",
]);

function memberExpressionRootIdentifier(value: ExpressionKind): string | null {
  if (value.type === "Identifier") {
    return value.name;
  }
  if (value.type !== "MemberExpression") {
    return null;
  }
  return memberExpressionRootIdentifier(value.object as ExpressionKind);
}
