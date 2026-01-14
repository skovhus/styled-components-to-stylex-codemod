import type { API } from "jscodeshift";

export function parseExpr(api: API, exprSource: string): any {
  try {
    // Always parse expressions with TSX enabled so we can safely emit TS-only constructs
    // like `x as SomeType` inside generated outputs.
    const jParse = api.jscodeshift.withParser("tsx");
    const program = jParse(`(${exprSource});`);
    const stmt = program.find(jParse.ExpressionStatement).nodes()[0];
    let expr = (stmt as any)?.expression ?? null;
    // Unwrap ParenthesizedExpression to avoid extra parentheses in output
    while (expr?.type === "ParenthesizedExpression") {
      expr = expr.expression;
    }
    // Remove extra.parenthesized flag that causes recast to add parentheses
    if (expr?.extra?.parenthesized) {
      delete expr.extra.parenthesized;
      delete expr.extra.parenStart;
    }
    return expr;
  } catch {
    return null;
  }
}
