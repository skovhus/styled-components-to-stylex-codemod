/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import type { CssDeclarationIR } from "../css-ir.js";
import type { StyledDecl } from "../transform-types.js";
import { cloneAstNode, extractRootAndPath } from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { inlineArrowFunctionBody } from "./inline-styles.js";
import { literalToStaticValue } from "./types.js";
import { isMemberExpression } from "./utils.js";
import type { JSCodeshift } from "jscodeshift";

export function buildFullInterpolatedDeclarationValueExpr(
  j: JSCodeshift,
  decl: StyledDecl,
  d: CssDeclarationIR,
): ExpressionKind | null {
  if (d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts ?? [];
  const slotCount = parts.filter((p) => p.kind === "slot").length;
  if (slotCount <= 1) {
    return null;
  }

  const quasis: any[] = [];
  const expressions: any[] = [];
  let raw = "";

  for (const part of parts) {
    if (part.kind === "static") {
      raw += String(part.value ?? "");
      continue;
    }
    if (part.kind !== "slot") {
      continue;
    }

    const expr = decl.templateExpressions[part.slotId] as any;
    if (!expr) {
      return null;
    }
    const valueExpr =
      expr.type === "ArrowFunctionExpression" || expr.type === "FunctionExpression"
        ? inlineArrowFunctionBody(j, expr)
        : cloneAstNode(expr);
    if (!valueExpr) {
      return null;
    }

    quasis.push(j.templateElement({ raw, cooked: raw }, false));
    expressions.push(valueExpr);
    raw = "";
  }

  quasis.push(j.templateElement({ raw, cooked: raw }, true));
  return j.templateLiteral(quasis, expressions);
}

export function isCssCalcOperator(operator: string | undefined): boolean {
  return operator === "+" || operator === "-" || operator === "*" || operator === "/";
}

export function buildCssCalcTemplateExpression(args: {
  j: JSCodeshift;
  operator: string;
  unit?: string;
  negate?: boolean;
  staticIdentifierValues?: ReadonlyMap<string, string | number | boolean>;
  left: { node: unknown; allowExpression: boolean };
  right: { node: unknown; allowExpression: boolean };
}): ExpressionKind | null {
  const expressions: ExpressionKind[] = [];
  const quasis: string[] = [];
  let currentQuasi = "calc(";

  const appendOperand = (
    operand: { node: unknown; allowExpression: boolean },
    options: { negate?: boolean } = {},
  ): boolean => {
    const staticText = expressionToCalcStaticText(
      operand.node,
      args.unit,
      args.staticIdentifierValues,
    );
    if (staticText !== null) {
      currentQuasi += options.negate ? negateCalcStaticText(staticText) : staticText;
      return true;
    }
    if (!operand.allowExpression || !isStylexCalcExpression(operand.node)) {
      return false;
    }
    if (options.negate) {
      currentQuasi += "-1 * ";
    }
    quasis.push(currentQuasi);
    currentQuasi = "";
    expressions.push(operand.node as ExpressionKind);
    return true;
  };

  if (!appendOperand(args.left, { negate: args.negate })) {
    return null;
  }
  const operator = args.negate ? negateCssCalcOperator(args.operator) : args.operator;
  currentQuasi += ` ${operator} `;
  if (!appendOperand(args.right)) {
    return null;
  }
  currentQuasi += ")";

  if (expressions.length === 0) {
    return args.j.literal(currentQuasi);
  }
  quasis.push(currentQuasi);
  if (quasis.length !== expressions.length + 1) {
    return null;
  }

  return args.j.templateLiteral(
    quasis.map((raw, index) =>
      args.j.templateElement({ raw, cooked: raw }, index === quasis.length - 1),
    ),
    expressions,
  ) as ExpressionKind;
}

export function buildNegatedCssTokenTemplate(
  j: JSCodeshift,
  expression: ExpressionKind,
): ExpressionKind {
  return j.templateLiteral(
    [
      j.templateElement({ raw: "calc(-1 * ", cooked: "calc(-1 * " }, false),
      j.templateElement({ raw: ")", cooked: ")" }, true),
    ],
    [expression],
  ) as ExpressionKind;
}

function negateCssCalcOperator(operator: string): string {
  return operator === "+" ? "-" : operator === "-" ? "+" : operator;
}

function negateCalcStaticText(value: string): string {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

function expressionToCalcStaticText(
  node: unknown,
  unit = "",
  staticIdentifierValues?: ReadonlyMap<string, string | number | boolean>,
): string | null {
  const staticValue = literalToStaticValue(node);
  if (typeof staticValue === "number") {
    return `${staticValue}${unit}`;
  }
  const identifierName =
    node && typeof node === "object" && (node as { type?: string }).type === "Identifier"
      ? (node as { name?: string }).name
      : undefined;
  const identifierValue = identifierName ? staticIdentifierValues?.get(identifierName) : undefined;
  if (typeof identifierValue === "number") {
    return `${identifierValue}${unit}`;
  }
  return null;
}

export function hasAdjacentTemplateUnit(
  quasis: Array<{ value?: { raw?: string; cooked?: string } }>,
  expressionIndex: number,
): boolean {
  const before =
    quasis[expressionIndex]?.value?.raw ?? quasis[expressionIndex]?.value?.cooked ?? "";
  const after =
    quasis[expressionIndex + 1]?.value?.raw ?? quasis[expressionIndex + 1]?.value?.cooked ?? "";
  return /[a-zA-Z%]$/.test(before) || /^[a-zA-Z%]/.test(after);
}

export function hasAdjacentUnitInInterpolatedParts(
  parts: Array<{ kind?: string; value?: string }>,
  slotIndex: number,
): boolean {
  const before = parts[slotIndex - 1]?.kind === "static" ? (parts[slotIndex - 1]?.value ?? "") : "";
  const after = parts[slotIndex + 1]?.kind === "static" ? (parts[slotIndex + 1]?.value ?? "") : "";
  return /[a-zA-Z%]$/.test(before) || /^[a-zA-Z%]/.test(after);
}

function isStylexCalcExpression(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as { type?: string; object?: unknown; property?: unknown; computed?: boolean };
  if (n.type !== "MemberExpression" || n.computed) {
    return false;
  }
  const objectInfo = extractRootAndPath(n.object);
  return objectInfo !== null && isMemberExpression(n);
}
