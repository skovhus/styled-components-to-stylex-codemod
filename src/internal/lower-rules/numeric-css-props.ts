/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import { expandBorderRadiusShorthandValue } from "../css-border-radius.js";
import type { CssDeclarationIR } from "../css-ir.js";
import { isCssShorthandProperty } from "../css-prop-mapping.js";
import type { StyledDecl } from "../transform-types.js";
import { cloneAstNode, extractRootAndPath } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import {
  buildStylexValueWithStaticParts,
  canOmitPxUnitForStylexNumber,
  isNumericStylexExpression,
} from "./inline-styles.js";
import { extractStaticPartsForDecl } from "./interpolations.js";
import { isMemberExpression, mapAst } from "./utils.js";
import type { JSCodeshift } from "jscodeshift";

export function isImportedShorthandUnitValue(
  d: CssDeclarationIR,
  decl: StyledDecl,
  importMap: ReadonlyMap<string, unknown>,
  numericIdentifiers: ReadonlySet<string>,
): boolean {
  if (!d.property || !isCssShorthandProperty(d.property)) {
    return false;
  }
  const staticParts = getSingleSlotStaticParts(d, decl);
  if (!staticParts || !/^[a-zA-Z%]/.test(staticParts.suffix)) {
    return false;
  }
  const slotPart =
    d.value.kind === "interpolated" ? d.value.parts.find((part) => part.kind === "slot") : null;
  const expr =
    slotPart && slotPart.kind === "slot"
      ? (decl.templateExpressions[slotPart.slotId] as ExpressionKind | undefined)
      : undefined;
  const info = extractRootAndPath(expr);
  if (!info || !importMap.has(info.rootName)) {
    return false;
  }
  // `margin`/`padding` whose whole value is a single proven-numeric token (e.g.
  // `margin: ${NumericConsts.x}px`) are valid in StyleX as-is: the value cannot
  // expand to multiple tokens and StyleX's compiler expands the shorthand
  // internally, so the interpolated-string handler can emit it directly. The
  // `scroll-margin`/`scroll-padding` shorthands are excluded because StyleX does
  // not accept them — they must be written as physical longhands.
  if (
    (d.property === "margin" || d.property === "padding") &&
    staticParts.prefix.trim() === "" &&
    /^[a-zA-Z%]+$/.test(staticParts.suffix.trim()) &&
    numericIdentifiers.has(info.rootName)
  ) {
    return false;
  }
  return true;
}

export function isEntireInterpolatedValueSingleSlot(
  d: CssDeclarationIR,
  decl: StyledDecl,
): boolean {
  return getSingleSlotStaticParts(d, decl) !== null;
}

type StaticParts = { prefix: string; suffix: string };

export function getSingleSlotStaticParts(
  d: CssDeclarationIR,
  decl: StyledDecl,
): StaticParts | null {
  if (d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts ?? [];
  const slotParts = parts.filter((part) => part.kind === "slot");
  if (slotParts.length !== 1) {
    return null;
  }
  const slot = slotParts[0]!;
  if (decl.templateExpressions[slot.slotId] === undefined) {
    return null;
  }
  return extractStaticPartsForDecl(d);
}

type NumericCssEmissionMode = "stylexNumber" | "cssText";

export function getNumericCssEmissionMode(stylexProp: string): NumericCssEmissionMode {
  if (stylexProp.startsWith("--")) {
    return "cssText";
  }
  return UNITLESS_NUMERIC_STYLEX_PROPS.has(stylexProp) ? "stylexNumber" : "cssText";
}

export function emitStaticObservedValue(
  value: string | number,
  stylexProp: string,
  isObservedNumeric: boolean,
  staticParts: StaticParts,
): string | number {
  if (typeof value !== "number" || !isObservedNumeric) {
    return value;
  }
  if (canOmitPxUnitForStylexNumber(stylexProp, staticParts.prefix, staticParts.suffix)) {
    return staticParts.prefix === "-" ? -value : value;
  }
  if (staticParts.prefix || staticParts.suffix) {
    return `${staticParts.prefix}${value}${staticParts.suffix}`;
  }
  return getNumericCssEmissionMode(stylexProp) === "stylexNumber" ? value : String(value);
}

export function staticVariantStyleObject(
  stylexProp: string,
  value: string | number,
): Record<string, string | number> {
  if (stylexProp !== "borderRadius" || typeof value !== "string") {
    return { [stylexProp]: value };
  }
  const expanded = expandBorderRadiusShorthandValue(value);
  if (!expanded) {
    return { [stylexProp]: value };
  }
  return {
    borderTopLeftRadius: expanded.topLeft,
    borderTopRightRadius: expanded.topRight,
    borderBottomRightRadius: expanded.bottomRight,
    borderBottomLeftRadius: expanded.bottomLeft,
  };
}

export function buildRuntimeObservedValueExpr(
  j: JSCodeshift,
  stylexProp: string,
  valueExpr: ExpressionKind,
  staticParts: StaticParts,
  numericIdentifiers: ReadonlySet<string> = new Set(),
): ExpressionKind {
  if (
    canOmitPxUnitForStylexNumber(stylexProp, staticParts.prefix, staticParts.suffix) &&
    isNumericStylexExpression(valueExpr, { numericIdentifiers })
  ) {
    return staticParts.prefix === "-"
      ? (j.unaryExpression("-", valueExpr, true) as ExpressionKind)
      : valueExpr;
  }
  if (!staticParts.prefix && !staticParts.suffix) {
    if (getNumericCssEmissionMode(stylexProp) === "stylexNumber") {
      return valueExpr;
    }
  }
  return j.templateLiteral(
    [
      j.templateElement({ raw: staticParts.prefix, cooked: staticParts.prefix }, false),
      j.templateElement({ raw: staticParts.suffix, cooked: staticParts.suffix }, true),
    ],
    [valueExpr],
  ) as ExpressionKind;
}

export function buildObservedExpressionFallbackValueExpr(args: {
  j: JSCodeshift;
  expression: ExpressionKind;
  jsxProp: string;
  stylexProp: string;
  paramName: string;
  param: ExpressionKind;
  prefix: string;
  suffix: string;
}): ExpressionKind | null {
  const { j, expression, jsxProp, stylexProp, paramName, param, prefix, suffix } = args;
  const propNames = new Set([jsxProp, jsxProp.startsWith("$") ? jsxProp.slice(1) : jsxProp]);
  let replaced = false;
  const rewritten = mapAst(cloneAstNode(expression), (node) => {
    if (isMemberExpression(node)) {
      const memberPath = extractRootAndPath(node);
      const propName = memberPath?.path[0];
      if (
        memberPath?.rootName === paramName &&
        memberPath.path.length === 1 &&
        propName &&
        propNames.has(propName)
      ) {
        replaced = true;
        return cloneAstNode(param);
      }
      return undefined;
    }
    if (node.type === "Identifier" && propNames.has(node.name as string)) {
      replaced = true;
      return cloneAstNode(param);
    }
    return undefined;
  }) as ExpressionKind;
  if (!replaced) {
    return null;
  }
  return prefix || suffix
    ? buildStylexValueWithStaticParts(j, rewritten, prefix, suffix, stylexProp)
    : rewritten;
}

const UNITLESS_NUMERIC_STYLEX_PROPS = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "fontWeight",
  "gridArea",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowStart",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
]);
