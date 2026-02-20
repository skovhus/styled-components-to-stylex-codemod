/**
 * Parses variant condition ("when") strings into AST nodes for conditional
 * style application.
 *
 * Core concepts: boolean expression parsing (&&, ||, !, ===, !==),
 * prop reference extraction, and conditional style expression generation
 * for stylex.props().
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind, WrapperPropDefaults } from "./types.js";

export type LogicalExpressionOperand = Parameters<JSCodeshift["logicalExpression"]>[1];

type VariantConditionResult = {
  cond: LogicalExpressionOperand;
  props: string[];
  isBoolean: boolean;
};

const isValidIdentifier = (name: string): boolean => /^[$A-Z_][0-9A-Z_$]*$/i.test(name);

/**
 * Parse a variant "when" string into an AST condition expression.
 *
 * Handles the following patterns:
 * - Simple identifiers: `"disabled"` → `disabled`
 * - Negation: `"!disabled"` → `!disabled`
 * - Comparison: `"variant === 'primary'"` → `variant === 'primary'`
 * - Conjunction: `"disabled && variant"` → `disabled && variant`
 * - Disjunction: `"a || b"` → `a || b`
 * - Grouped negation: `"!(a || b)"` → `!(a || b)`
 */
export function parseVariantWhenToAst(j: JSCodeshift, when: string): VariantConditionResult {
  const buildMemberExpr = (raw: string): ExpressionKind | null => {
    if (!raw.includes(".")) {
      return null;
    }
    const parts = raw
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2 || parts.some((part) => !isValidIdentifier(part))) {
      return null;
    }
    return parts
      .slice(1)
      .reduce<ExpressionKind>(
        (acc, part) => j.memberExpression(acc, j.identifier(part)),
        j.identifier(parts[0]!),
      );
  };

  const parsePropRef = (raw: string): { propName: string | null; expr: ExpressionKind } => {
    const trimmedRaw = raw.trim();
    if (!trimmedRaw) {
      return { propName: null, expr: j.identifier("undefined") };
    }
    if (trimmedRaw.includes(".")) {
      const parts = trimmedRaw
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
      const last = parts[parts.length - 1];
      if (!last || !isValidIdentifier(last)) {
        return { propName: null, expr: j.identifier(trimmedRaw) };
      }
      const root = parts[0];
      if (root === "props" || root === "p") {
        const propRoot = parts[1];
        if (!propRoot || !isValidIdentifier(propRoot)) {
          return { propName: null, expr: j.identifier(trimmedRaw) };
        }
        const expr = parts
          .slice(2)
          .reduce<ExpressionKind>(
            (acc, part) => j.memberExpression(acc, j.identifier(part)),
            j.identifier(propRoot),
          );
        return { propName: propRoot, expr };
      }
      const memberExpr = buildMemberExpr(trimmedRaw);
      if (memberExpr) {
        return { propName: null, expr: memberExpr };
      }
      return { propName: null, expr: j.identifier(trimmedRaw) };
    }
    return { propName: trimmedRaw, expr: j.identifier(trimmedRaw) };
  };

  const trimmed = String(when ?? "").trim();
  if (!trimmed) {
    return { cond: j.identifier("true"), props: [], isBoolean: true };
  }

  // Handle negation with parentheses first: !(A || B) should strip outer negation
  // before checking for || to avoid incorrect splitting
  if (trimmed.startsWith("!(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(2, -1).trim();
    const innerParsed = parseVariantWhenToAst(j, inner);
    // Negation always produces boolean
    return {
      cond: j.unaryExpression("!", innerParsed.cond),
      props: innerParsed.props,
      isBoolean: true,
    };
  }

  if (trimmed.includes("&&")) {
    const parts = trimmed
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = parts.map((p) => parseVariantWhenToAst(j, p));
    const firstParsed = parsed[0];
    if (!firstParsed) {
      return { cond: j.identifier("true"), props: [], isBoolean: true };
    }
    const cond = parsed
      .slice(1)
      .reduce((acc, cur) => j.logicalExpression("&&", acc, cur.cond), firstParsed.cond);
    const props = [...new Set(parsed.flatMap((x) => x.props))];
    // Combined && is boolean only if all parts are boolean
    const isBoolean = parsed.every((p) => p.isBoolean);
    return { cond, props, isBoolean };
  }

  // Handle || conditions (e.g., for nested ternary default branches after negation stripped)
  if (trimmed.includes(" || ")) {
    const parts = trimmed
      .split(" || ")
      .map((s) => s.trim())
      .filter(Boolean);
    const parsed = parts.map((p) => parseVariantWhenToAst(j, p));
    const firstParsedOr = parsed[0];
    if (!firstParsedOr) {
      return { cond: j.identifier("true"), props: [], isBoolean: true };
    }
    const cond = parsed
      .slice(1)
      .reduce((acc, cur) => j.logicalExpression("||", acc, cur.cond), firstParsedOr.cond);
    const props = [...new Set(parsed.flatMap((x) => x.props))];
    // Combined || is boolean only if all parts are boolean
    const isBoolean = parsed.every((p) => p.isBoolean);
    return { cond, props, isBoolean };
  }

  // Handle simple negation without parentheses: !prop
  if (trimmed.startsWith("!")) {
    const inner = trimmed.slice(1).trim();
    const innerParsed = parseVariantWhenToAst(j, inner);
    // Negation always produces boolean
    return {
      cond: j.unaryExpression("!", innerParsed.cond),
      props: innerParsed.props,
      isBoolean: true,
    };
  }

  if (trimmed.includes("===") || trimmed.includes("!==")) {
    const op = trimmed.includes("!==") ? "!==" : "===";
    const [lhs, rhsRaw0] = trimmed.split(op).map((s) => s.trim());
    const rhsRaw = rhsRaw0 ?? "";
    const lhsInfo = parsePropRef(lhs ?? "");
    const rhs =
      rhsRaw?.startsWith('"') || rhsRaw?.startsWith("'")
        ? j.literal(JSON.parse(rhsRaw.replace(/^'/, '"').replace(/'$/, '"')))
        : /^-?\d+(\.\d+)?$/.test(rhsRaw)
          ? j.literal(Number(rhsRaw))
          : (buildMemberExpr(rhsRaw) ?? j.identifier(rhsRaw));
    const propName = lhsInfo.propName ?? "";
    // Comparison always produces boolean
    return {
      cond: j.binaryExpression(op as any, lhsInfo.expr, rhs),
      props: propName ? [propName] : [],
      isBoolean: true,
    };
  }

  // Simple identifier - NOT guaranteed to be boolean (could be "" or 0)
  const simple = parsePropRef(trimmed);
  return {
    cond: simple.expr,
    props: simple.propName ? [simple.propName] : [],
    isBoolean: false,
  };
}

/**
 * Parses a "when" string and optionally collects the referenced prop names
 * into a `destructureProps` array so they can be included in the wrapper
 * function's parameter destructuring.
 */
export function collectConditionProps(
  j: JSCodeshift,
  args: { when: string; destructureProps?: string[] },
): VariantConditionResult {
  const { when, destructureProps } = args;
  const parsed = parseVariantWhenToAst(j, when);
  if (destructureProps) {
    for (const p of parsed.props) {
      if (p && !destructureProps.includes(p)) {
        destructureProps.push(p);
      }
    }
  }
  return parsed;
}

/**
 * Creates a conditional style expression that's safe for stylex.props().
 * For boolean conditions, uses && (since false is valid for stylex.props).
 * For non-boolean conditions (could be "" or 0), uses ternary with undefined fallback.
 */
export function makeConditionalStyleExpr(
  j: JSCodeshift,
  args: {
    cond: LogicalExpressionOperand;
    expr: ExpressionKind;
    isBoolean: boolean;
  },
): ExpressionKind {
  const { cond, expr, isBoolean } = args;
  if (isBoolean) {
    return j.logicalExpression("&&", cond, expr);
  }
  return j.conditionalExpression(cond, expr, j.identifier("undefined"));
}

/**
 * Builds style expressions from extraStylexPropsArgs entries, merging
 * complementary boolean condition pairs into single ternary expressions.
 *
 * Two entries with `when: "prop"` and `when: "!prop"` are merged into
 * `prop ? trueExpr : falseExpr` instead of emitting separate conditionals.
 */
export function buildExtraStylexPropsExprs(
  j: JSCodeshift,
  args: {
    entries: ReadonlyArray<{ when?: string; expr: ExpressionKind }>;
    destructureProps?: string[];
    propDefaults?: WrapperPropDefaults;
  },
): ExpressionKind[] {
  const { entries, destructureProps, propDefaults } = args;
  const result: ExpressionKind[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (consumed.has(i)) {
      continue;
    }
    const entry = entries[i]!;

    if (!entry.when) {
      result.push(entry.expr);
      continue;
    }

    // Look for a complementary entry to merge into a single ternary
    const complementIndex = findComplementaryEntry(entries, i, consumed);
    if (complementIndex !== null) {
      consumed.add(complementIndex);
      const other = entries[complementIndex]!;
      const positiveWhenRaw = getPositiveWhen(entry.when, other.when!)!;
      const positiveWhen = maybeSimplifyTruthyDefaultWhen(positiveWhenRaw, propDefaults);
      const { cond } = collectConditionProps(j, { when: positiveWhen, destructureProps });

      const isEntryPositive = areEquivalentWhen(entry.when, positiveWhenRaw);
      const trueExpr = isEntryPositive ? entry.expr : other.expr;
      const falseExpr = isEntryPositive ? other.expr : entry.expr;

      result.push(j.conditionalExpression(cond, trueExpr, falseExpr));
      continue;
    }

    // No complement found — emit standard conditional
    const { cond, isBoolean } = collectConditionProps(j, {
      when: entry.when,
      destructureProps,
    });
    result.push(makeConditionalStyleExpr(j, { cond, expr: entry.expr, isBoolean }));
  }

  return result;
}

// --- Non-exported helpers ---

/**
 * Finds the immediately next unconsumed entry that has a complementary "when"
 * condition to the entry at `index`. Only checks the adjacent unconsumed entry
 * to preserve style precedence ordering — merging non-adjacent pairs would
 * reorder styles relative to entries between them.
 */
function findComplementaryEntry(
  entries: ReadonlyArray<{ when?: string; expr: ExpressionKind }>,
  index: number,
  consumed: ReadonlySet<number>,
): number | null {
  const when = entries[index]?.when;
  if (!when) {
    return null;
  }

  // Find the next unconsumed entry
  let next = index + 1;
  while (next < entries.length && consumed.has(next)) {
    next++;
  }
  if (next >= entries.length) {
    return null;
  }

  const otherWhen = entries[next]?.when;
  if (otherWhen && getPositiveWhen(when, otherWhen) !== null) {
    return next;
  }

  return null;
}

/**
 * If two "when" strings represent complementary conditions (e.g., "prop" and
 * "!prop"), returns the positive (non-negated) condition string. Returns null
 * otherwise.
 */
function getPositiveWhen(whenA: string, whenB: string): string | null {
  const a = whenA.trim();
  const b = whenB.trim();
  if (isNegationOf(b, a)) {
    return a;
  }
  if (isNegationOf(a, b)) {
    return b;
  }
  return null;
}

function maybeSimplifyTruthyDefaultWhen(
  when: string,
  propDefaults: WrapperPropDefaults | undefined,
): string {
  if (!propDefaults) {
    return when;
  }
  const propName = extractTruthyDefaultPropName(when);
  if (!propName) {
    return when;
  }
  const existingDefault = propDefaults.get(propName);
  if (existingDefault !== undefined && existingDefault !== true) {
    return when;
  }
  propDefaults.set(propName, true);
  return propName;
}

function extractTruthyDefaultPropName(when: string): string | null {
  const normalized = normalizeWhenForComparison(when);
  const directMatch = normalized.match(/^([A-Za-z_$][0-9A-Za-z_$]*)===undefined\|\|\1$/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }
  const reverseMatch = normalized.match(/^([A-Za-z_$][0-9A-Za-z_$]*)\|\|\1===undefined$/);
  if (reverseMatch?.[1]) {
    return reverseMatch[1];
  }
  return null;
}

function areEquivalentWhen(left: string, right: string): boolean {
  return normalizeWhenForComparison(left) === normalizeWhenForComparison(right);
}

function isNegationOf(candidate: string, base: string): boolean {
  const candidateNormalized = normalizeWhenForComparison(candidate);
  if (!candidateNormalized.startsWith("!")) {
    return false;
  }
  const inner = normalizeWhenForComparison(candidateNormalized.slice(1));
  const baseNormalized = normalizeWhenForComparison(base);
  return inner === baseNormalized;
}

function normalizeWhenForComparison(when: string): string {
  const withoutWhitespace = String(when ?? "").replace(/\s+/g, "");
  return stripOuterParens(withoutWhitespace);
}

function stripOuterParens(expr: string): string {
  let current = expr;
  while (current.startsWith("(") && current.endsWith(")") && hasEnclosingParens(current)) {
    current = current.slice(1, -1);
  }
  return current;
}

function hasEnclosingParens(expr: string): boolean {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch !== ")") {
      continue;
    }
    depth--;
    if (depth < 0) {
      return false;
    }
    if (depth === 0 && i !== expr.length - 1) {
      return false;
    }
  }
  return depth === 0;
}
