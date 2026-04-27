/**
 * Small AST helpers shared by interpolation-pattern handlers.
 */
import type { StyledDecl } from "../transform-types.js";

/**
 * Locate the slot interpolation in a `${...}` value, return its arrow-function
 * expression node and the name of its first identifier parameter. Returns
 * `null` when the declaration is not interpolated, has no slot, or the
 * interpolation is not a single-param arrow function.
 *
 * Several `tryHandle*` factories share this same opening preamble; this helper
 * centralises the AST shape checks.
 */
export function findArrowSlotExpr(
  d: any,
  decl: StyledDecl,
): { expr: any; paramName: string } | null {
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
  const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
  if (!paramName) {
    return null;
  }
  return { expr, paramName };
}
