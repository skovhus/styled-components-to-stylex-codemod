/**
 * Small AST helpers shared by interpolation-pattern handlers.
 */
import type { StyledDecl } from "../transform-types.js";

/**
 * Locate the slot interpolation in a `${...}` value and return its
 * arrow-function expression node. Returns `null` when the declaration is not
 * interpolated, has no slot, or the interpolation is not an
 * ArrowFunctionExpression.
 *
 * Several `tryHandle*` factories share this same opening preamble; this helper
 * centralises the AST shape checks. Callers that need a simple identifier
 * parameter should use `findArrowSlotExprWithIdentParam` instead, which
 * additionally requires `(name) => ...`. Callers that support destructured
 * parameters (e.g. `({ $flag }) => ...`) should use `findArrowSlotExpr` and
 * resolve their own parameter bindings via `getArrowFnParamBindings`.
 */
export function findArrowSlotExpr(d: any, decl: StyledDecl): { expr: any } | null {
  if (d?.value?.kind !== "interpolated") {
    return null;
  }
  const slot = (d.value.parts ?? []).find((p: any) => p?.kind === "slot");
  if (!slot) {
    return null;
  }
  const expr = decl.templateExpressions[slot.slotId] as any;
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  return { expr };
}

/**
 * Like `findArrowSlotExpr`, but requires the value to be a *single* slot part —
 * the whole `${...}` value with no surrounding static text. Returns the
 * arrow-function expression node, or `null`.
 */
export function findSingleSlotArrowExpr(d: any, decl: StyledDecl): any {
  if (d?.value?.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts ?? [];
  if (parts.length !== 1 || parts[0]?.kind !== "slot") {
    return null;
  }
  const expr = decl.templateExpressions[parts[0].slotId] as any;
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  return expr;
}

/**
 * Like `findArrowSlotExpr`, but additionally requires the arrow function's
 * first parameter to be a plain Identifier (e.g. `(props) => ...`). Returns
 * the parameter's name alongside the expression.
 */
export function findArrowSlotExprWithIdentParam(
  d: any,
  decl: StyledDecl,
): { expr: any; paramName: string } | null {
  const found = findArrowSlotExpr(d, decl);
  if (!found) {
    return null;
  }
  const params = (found.expr as { params?: Array<{ type?: string; name?: string }> }).params ?? [];
  const first = params[0];
  if (first?.type !== "Identifier" || typeof first.name !== "string") {
    return null;
  }
  return { expr: found.expr, paramName: first.name };
}
