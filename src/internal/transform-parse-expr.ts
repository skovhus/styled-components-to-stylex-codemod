/**
 * Parses expression strings into AST nodes with TSX support.
 * Core concepts: safe parsing and parenthesis normalization.
 */
import type { API, JSCodeshift } from "jscodeshift";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export function parseExpr(api: API, exprSource: string): ExpressionKind | null {
  try {
    // Always parse expressions with TSX enabled so we can safely emit TS-only constructs
    // like `x as SomeType` inside generated outputs.
    const jParse = api.jscodeshift.withParser("tsx");
    const program = jParse(`(${exprSource});`);
    const stmt = program.find(jParse.ExpressionStatement).nodes()[0];
    let expr = stmt?.expression ?? null;
    // Unwrap ParenthesizedExpression to avoid extra parentheses in output
    while (expr?.type === "ParenthesizedExpression") {
      expr = expr.expression;
    }
    // Remove extra.parenthesized flag that causes recast to add parentheses
    const exprWithExtra = expr as ExpressionKind & {
      extra?: { parenthesized?: boolean; parenStart?: number };
    };
    if (exprWithExtra?.extra?.parenthesized) {
      delete exprWithExtra.extra.parenthesized;
      delete exprWithExtra.extra.parenStart;
    }
    return expr;
  } catch {
    return null;
  }
}
