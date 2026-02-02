import { capitalize } from "../utilities/string-utils.js";

type ExpressionKind = Parameters<import("jscodeshift").JSCodeshift["expressionStatement"]>[0];

/**
 * Extracts a readable name from a condition expression for use in style key names.
 * Returns null for complex expressions that can't be converted to a simple name.
 *
 * @example
 * - `isMobile` → "IsMobile"
 * - `Browser.isSafari` → "BrowserIsSafari"
 * - `!isMobile` → "NotIsMobile"
 * - `isMobile || isTablet` → "IsMobileOrIsTablet"
 * - `Browser.isSafari()` → "BrowserIsSafari" (no-arg call)
 * - `42 && something()` → null (too complex)
 */
export function extractConditionName(test: ExpressionKind): string | null {
  // Simple identifier: isMobile → "IsMobile"
  if (test.type === "Identifier") {
    return capitalize(test.name);
  }

  // Member expression: Browser.isSafari → "BrowserIsSafari"
  if (test.type === "MemberExpression" && !test.computed) {
    const parts: string[] = [];
    let current: ExpressionKind = test;
    while (
      current.type === "MemberExpression" &&
      !current.computed &&
      current.property.type === "Identifier"
    ) {
      parts.unshift(current.property.name);
      current = current.object as ExpressionKind;
    }
    if (current.type === "Identifier") {
      parts.unshift(current.name);
      return parts.map(capitalize).join("");
    }
    return null;
  }

  // Unary not: !isMobile → "NotIsMobile"
  if (test.type === "UnaryExpression" && test.operator === "!") {
    const inner = extractConditionName(test.argument as ExpressionKind);
    return inner ? `Not${inner}` : null;
  }

  // Logical OR: isMobile || isTablet → "IsMobileOrIsTablet"
  if (test.type === "LogicalExpression" && test.operator === "||") {
    const left = extractConditionName(test.left as ExpressionKind);
    const right = extractConditionName(test.right as ExpressionKind);
    return left && right ? `${left}Or${right}` : null;
  }

  // Logical AND: isMobile && isTablet → "IsMobileAndIsTablet"
  if (test.type === "LogicalExpression" && test.operator === "&&") {
    const left = extractConditionName(test.left as ExpressionKind);
    const right = extractConditionName(test.right as ExpressionKind);
    return left && right ? `${left}And${right}` : null;
  }

  // Call expression with no arguments: Browser.isSafari() → "BrowserIsSafari"
  if (test.type === "CallExpression") {
    const args = test.arguments ?? [];
    if (args.length === 0) {
      return extractConditionName(test.callee as ExpressionKind);
    }
    return null;
  }

  // Everything else is too complex
  return null;
}
