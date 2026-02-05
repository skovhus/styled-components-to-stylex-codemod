/**
 * Generates stable style key suffixes from prop/condition strings.
 * Core concepts: suffix normalization and readable naming.
 */
import { capitalize } from "./string-utils.js";

type ExpressionKind = Parameters<import("jscodeshift").JSCodeshift["expressionStatement"]>[0];

/**
 * Converts a prop/condition string to a PascalCase suffix for style keys.
 *
 * @example
 * - `$isActive` → "Active"
 * - `config.enabled` → "ConfigEnabled"
 * - `size === "large"` → "SizeLarge"
 * - `user.role === Role.admin` → "UserRoleAdmin" (dedupes consecutive words)
 */
export function toSuffixFromProp(propName: string): string {
  // `$isActive` => `IsActive`, `primary` => `Primary`
  const raw = propName.startsWith("$") ? propName.slice(1) : propName;
  if (!raw) {
    return "Variant";
  }

  // Helper to convert dotted paths to PascalCase: `config.enabled` => `ConfigEnabled`
  const dottedToPascal = (s: string): string => {
    if (!s.includes(".")) {
      return s;
    }
    return s
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  };

  // Helper to remove consecutive duplicate words in PascalCase:
  // `UserRoleRoleAdmin` => `UserRoleAdmin`, `StatusStatusActive` => `StatusActive`
  const dedupeWords = (s: string): string => {
    // Split PascalCase into words: "UserRoleRoleAdmin" => ["User", "Role", "Role", "Admin"]
    const words = s.split(/(?=[A-Z])/).filter(Boolean);
    // Remove consecutive duplicates (case-insensitive comparison)
    const deduped: string[] = [];
    for (const word of words) {
      const last = deduped[deduped.length - 1];
      if (!last || last.toLowerCase() !== word.toLowerCase()) {
        deduped.push(word);
      }
    }
    return deduped.join("");
  };

  // Handle CSS variable names: `--component-width` => `ComponentWidth`
  if (raw.startsWith("--")) {
    const withoutDashes = raw
      .slice(2)
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
    return withoutDashes || "Var";
  }

  // Handle simple expression keys coming from the dynamic resolution pipeline, e.g.:
  //   `size === "large"` -> `SizeLarge`
  //   `variant === "primary"` -> `VariantPrimary`
  //   `!isActive` -> `NotActive`
  const trimmed = dottedToPascal(raw.trim());

  // Handle negation first to avoid incorrect splitting on || inside negated expressions
  // e.g., `!($mode === "gradient" || $mode === "pattern")` -> `NotModeGradientOrModePattern`
  if (trimmed.startsWith("!")) {
    const inner = trimmed
      .slice(1)
      .trim()
      .replace(/^\(|\)$/g, "");
    const base = toSuffixFromProp(inner);
    return `Not${base}`;
  }

  // Handle simple compound expressions (used for compound variant buckets), e.g.:
  //   `disabled && color === "primary"` -> `DisabledColorPrimary`
  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      const suffixes = parts.map((p) => toSuffixFromProp(p));
      if (suffixes.includes("CondTruthy")) {
        return "CondTruthy";
      }
      return suffixes.join("");
    }
  }

  // Handle || conditions (e.g., for nested ternary default branches):
  //   `mode === "gradient" || mode === "pattern"` -> `ModeGradientOrModePattern`
  if (trimmed.includes(" || ")) {
    const parts = trimmed
      .split(" || ")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      const suffixes = parts.map((p) => toSuffixFromProp(p));
      if (suffixes.includes("CondTruthy")) {
        return "CondTruthy";
      }
      return suffixes.join("Or");
    }
  }
  const eq = trimmed.includes("!==") ? "!==" : trimmed.includes("===") ? "===" : null;
  if (eq) {
    const [lhs0, rhs0] = trimmed.split(eq).map((s) => s.trim());
    const lhs = lhs0 ?? "Variant";
    const rhsRaw = (rhs0 ?? "").replace(/^['"]|['"]$/g, "");
    const isSimpleRhs = /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(rhsRaw) || /^-?\d+(\.\d+)?$/.test(rhsRaw);
    if (rhsRaw && !isSimpleRhs) {
      return "CondTruthy";
    }
    const rhs = rhsRaw || (eq === "!==" ? "NotMatch" : "Match");
    const lhsSuffix = lhs.charAt(0).toUpperCase() + lhs.slice(1);
    const rhsSuffix = rhs.charAt(0).toUpperCase() + rhs.slice(1);
    const combined = eq === "!==" ? `${lhsSuffix}Not${rhsSuffix}` : `${lhsSuffix}${rhsSuffix}`;
    return dedupeWords(combined);
  }

  // Common boolean convention: `$isActive` -> `Active` (matches existing fixtures)
  if (trimmed.startsWith("is") && trimmed.length > 2 && /[A-Z]/.test(trimmed.charAt(2))) {
    return trimmed.slice(2);
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

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
