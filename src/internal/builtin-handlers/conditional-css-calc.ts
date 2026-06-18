/**
 * Helpers for emitting `calc(...)` expressions from conditional branches.
 * Used when a ternary's operands form a CSS arithmetic expression.
 */
import type { ImportSpec } from "../../adapter.js";

export function isCssCalcOperator(operator: string | undefined): operator is "+" | "-" | "*" | "/" {
  return operator === "+" || operator === "-" || operator === "*" || operator === "/";
}

export function isCssCalcSafeOperand(branch: { expr: string; imports: ImportSpec[] }): boolean {
  return branch.imports.length > 0 || isNumericExpressionSource(branch.expr);
}

export function buildCssCalcExprSource(
  left: { expr: string; imports: ImportSpec[] },
  operator: string,
  right: { expr: string; imports: ImportSpec[] },
): string {
  return `\`calc(${cssCalcOperandSource(left)} ${operator} ${cssCalcOperandSource(right)})\``;
}

function isNumericExpressionSource(expr: string): boolean {
  return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(expr);
}

function cssCalcOperandSource(branch: { expr: string; imports: ImportSpec[] }): string {
  return branch.imports.length > 0 ? `\${${branch.expr}}` : branch.expr;
}
