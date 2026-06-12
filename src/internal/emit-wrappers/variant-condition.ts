/**
 * Parses variant condition ("when") strings into AST nodes for conditional
 * style application.
 *
 * Core concepts: boolean expression parsing (&&, ||, !, ===, !==),
 * prop reference extraction, and conditional style expression generation
 * for stylex.props().
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./types.js";
import { isValidIdentifierName } from "../utilities/string-utils.js";

export type LogicalExpressionOperand = Parameters<JSCodeshift["logicalExpression"]>[1];

type VariantConditionResult = {
  cond: LogicalExpressionOperand;
  props: string[];
  isBoolean: boolean;
};

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
export function parseVariantWhenToAst(
  j: JSCodeshift,
  when: string,
  booleanProps?: ReadonlySet<string>,
  knownProps?: ReadonlySet<string>,
  nonPropRoots?: ReadonlySet<string>,
): VariantConditionResult {
  const buildMemberExpr = (raw: string): ExpressionKind | null => {
    if (!raw.includes(".")) {
      return null;
    }
    const parts = raw
      .split(".")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length < 2 || parts.some((part) => !isValidIdentifierName(part))) {
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
      if (!last || !isValidIdentifierName(last)) {
        return { propName: null, expr: j.identifier(trimmedRaw) };
      }
      const root = parts[0];
      if (root === "props" || root === "p") {
        const propRoot = parts[1];
        if (!propRoot || !isValidIdentifierName(propRoot)) {
          return { propName: null, expr: j.identifier(trimmedRaw) };
        }
        const expr = parts
          .slice(2)
          .reduce<ExpressionKind>(
            (acc, part) => j.memberExpression(acc, j.identifier(part)),
            j.identifier(propRoot),
          );
        return {
          propName: isConditionPropIdentifier(propRoot) ? propRoot : null,
          expr,
        };
      }
      const memberExpr = buildMemberExpr(trimmedRaw);
      if (memberExpr) {
        // Treat dotted refs as prop-root conditions (e.g., user.role, $layer.isTop)
        // so wrapper emitters can destructure the root identifier. Theme refs are
        // resolved via useTheme and should not be pulled from component props.
        const propName =
          root && root !== "theme" && !nonPropRoots?.has(root) && isConditionPropIdentifier(root)
            ? root
            : null;
        return { propName, expr: memberExpr };
      }
      return { propName: null, expr: j.identifier(trimmedRaw) };
    }
    // Bare "theme" is resolved via useTheme(), not from component props — same
    // treatment as dotted theme refs (line 90) to avoid dual-binding conflicts.
    return {
      propName:
        trimmedRaw === "theme" ||
        nonPropRoots?.has(trimmedRaw) ||
        !isConditionPropIdentifier(trimmedRaw)
          ? null
          : trimmedRaw,
      expr: j.identifier(trimmedRaw),
    };
  };

  const trimmed = String(when ?? "").trim();
  if (!trimmed) {
    return { cond: j.identifier("true"), props: [], isBoolean: true };
  }

  // Handle negation with parentheses first: !(A || B) should strip outer negation
  // before checking for || to avoid incorrect splitting
  if (trimmed.startsWith("!(") && trimmed.endsWith(")")) {
    const inner = trimmed.slice(2, -1).trim();
    const innerParsed = parseVariantWhenToAst(j, inner, booleanProps, knownProps, nonPropRoots);
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
    const parsed = parts.map((p) => parseVariantWhenToAst(j, p, booleanProps, knownProps, nonPropRoots));
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
    const parsed = parts.map((p) => parseVariantWhenToAst(j, p, booleanProps, knownProps, nonPropRoots));
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
    const innerParsed = parseVariantWhenToAst(j, inner, booleanProps, knownProps, nonPropRoots);
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
        : /^-?\d*\.?\d+$/.test(rhsRaw)
          ? j.literal(Number(rhsRaw))
          : rhsRaw === "true" || rhsRaw === "false"
            ? j.literal(rhsRaw === "true")
            : (buildMemberExpr(rhsRaw) ?? j.identifier(rhsRaw));
    const propName = lhsInfo.propName ?? "";
    // Comparison always produces boolean
    return {
      cond: j.binaryExpression(op as any, lhsInfo.expr, rhs),
      props: propName ? [propName] : [],
      isBoolean: true,
    };
  }

  const expression = parseConditionExpression(j, trimmed);
  if (expression) {
    return {
      cond: expression,
      props: collectGuardExpressionPropNames(expression, knownProps),
      isBoolean: true,
    };
  }

  // Simple identifier — NOT guaranteed to be boolean (could be "" or 0).
  // When callers provide booleanProps, identifiers matching known boolean props
  // produce `cond && expr` instead of `cond ? expr : undefined`.
  const simple = parsePropRef(trimmed);
  const propIsBoolean = !!(simple.propName && booleanProps?.has(simple.propName));
  return {
    cond: simple.expr,
    props: simple.propName ? [simple.propName] : [],
    isBoolean: propIsBoolean,
  };
}

function parseConditionExpression(j: JSCodeshift, source: string): ExpressionKind | null {
  if (!source.includes("(") && !/[<>?[\]]/.test(source)) {
    return null;
  }
  try {
    const declarator = j(`const __condition = (${source});`)
      .find(j.VariableDeclarator)
      .nodes()[0] as { init?: ExpressionKind } | undefined;
    return unwrapParenthesizedExpression(declarator?.init) ?? null;
  } catch {
    return null;
  }
}

function unwrapParenthesizedExpression(expr: ExpressionKind | undefined): ExpressionKind | null {
  let current = expr;
  while (current && current.type === "ParenthesizedExpression") {
    current = (current as { expression?: ExpressionKind }).expression;
  }
  return current ?? null;
}

function collectGuardExpressionPropNames(
  expr: ExpressionKind,
  knownProps?: ReadonlySet<string>,
): string[] {
  const props = new Set<string>();
  collectGuardProps(expr, props, knownProps);
  return [...props];
}

function collectGuardProps(
  node: unknown,
  props: Set<string>,
  knownProps?: ReadonlySet<string>,
): void {
  if (!node || typeof node !== "object") {
    return;
  }
  const record = node as Record<string, unknown>;
  const type = record.type;

  if (type === "Identifier") {
    const name = record.name;
    if (typeof name === "string" && isConditionPropIdentifier(name, knownProps)) {
      props.add(name);
    }
    return;
  }

  if (type === "CallExpression" || type === "OptionalCallExpression") {
    if (isMemberExpressionRecord(record.callee)) {
      collectMemberExpressionProp(record.callee, props, knownProps);
    }
    const args = record.arguments;
    if (Array.isArray(args)) {
      for (const arg of args) {
        collectGuardProps(arg, props, knownProps);
      }
    }
    return;
  }

  if (type === "MemberExpression" || type === "OptionalMemberExpression") {
    collectMemberExpressionProp(record, props, knownProps);
    return;
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "type" || key === "loc" || key === "comments" || key === "leadingComments") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collectGuardProps(item, props, knownProps);
      }
    } else {
      collectGuardProps(value, props, knownProps);
    }
  }
}

function isMemberExpressionRecord(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") {
    return false;
  }
  const type = (node as { type?: unknown }).type;
  return type === "MemberExpression" || type === "OptionalMemberExpression";
}

function collectMemberExpressionProp(
  node: Record<string, unknown>,
  props: Set<string>,
  knownProps?: ReadonlySet<string>,
): void {
  const object = node.object as Record<string, unknown> | undefined;
  const property = node.property as Record<string, unknown> | undefined;
  const rootName = readMemberRootIdentifier(object);
  if (rootName === "props" || rootName === "p") {
    // For chained member expressions like `props.size.startsWith`, we need to
    // find the property directly on `props`, not the outermost property.
    const propName = findPropsDirectProperty(node);
    if (typeof propName === "string" && isConditionPropIdentifier(propName, knownProps)) {
      props.add(propName);
    }
  } else if (
    typeof rootName === "string" &&
    rootName !== "theme" &&
    isConditionPropIdentifier(rootName, knownProps)
  ) {
    props.add(rootName);
  }
  if (node.computed) {
    collectGuardProps(property, props, knownProps);
  }
}

function readMemberRootIdentifier(node: Record<string, unknown> | undefined): string | null {
  if (!node) {
    return null;
  }
  if (node.type === "Identifier" && typeof node.name === "string") {
    return node.name;
  }
  if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
    return readMemberRootIdentifier(node.object as Record<string, unknown> | undefined);
  }
  return null;
}

/**
 * For chained member expressions rooted at `props` or `p`, finds the property
 * directly on `props`. For `props.size.startsWith`, returns "size".
 * For `props.foo`, returns "foo".
 */
function findPropsDirectProperty(node: Record<string, unknown>): string | null {
  const object = node.object as Record<string, unknown> | undefined;
  const property = node.property as Record<string, unknown> | undefined;

  if (!object) {
    return null;
  }

  // If the direct object is `props` or `p`, the property is what we want
  if (object.type === "Identifier") {
    const objName = object.name;
    if (objName === "props" || objName === "p") {
      return property?.type === "Identifier" ? (property.name as string) : null;
    }
    return null;
  }

  // For nested member expressions, recurse into the object chain
  if (object.type === "MemberExpression" || object.type === "OptionalMemberExpression") {
    return findPropsDirectProperty(object);
  }

  return null;
}

function isConditionPropIdentifier(name: string, knownProps?: ReadonlySet<string>): boolean {
  if (knownProps) {
    // Strict mode: only accept identifiers that are explicitly known props
    return knownProps.has(name);
  }
  // Heuristic mode: filter out likely non-prop identifiers
  // - Reserved words and special values
  if (name === "undefined" || name === "NaN" || name === "Infinity") {
    return false;
  }
  // - ALL_CAPS identifiers are likely constants, not props
  if (/^[A-Z][A-Z0-9_]*$/.test(name)) {
    return false;
  }
  // - PascalCase without underscores are likely class/component names
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name) && !name.includes("_")) {
    return false;
  }
  return isValidIdentifierName(name);
}

/**
 * Parses a "when" string and optionally collects the referenced prop names
 * into a `destructureProps` array so they can be included in the wrapper
 * function's parameter destructuring.
 */
export function collectConditionProps(
  j: JSCodeshift,
  args: {
    when: string;
    destructureProps?: string[];
    booleanProps?: ReadonlySet<string>;
    knownProps?: ReadonlySet<string>;
    nonPropRoots?: ReadonlySet<string>;
  },
): VariantConditionResult {
  const { when, destructureProps, booleanProps, knownProps, nonPropRoots } = args;
  const parsed = parseVariantWhenToAst(j, when, booleanProps, knownProps, nonPropRoots);
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
 * For boolean conditions, uses `cond && expr` (since `false` is a valid StyleXArray element).
 * For non-boolean conditions, uses `cond ? expr : undefined` to avoid producing
 * values like `""` or `0` which are not valid StyleXArray elements.
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
 * If two "when" strings represent complementary conditions (e.g., "prop" and
 * "!prop", or "x === v" and "x !== v"), returns the positive condition string.
 * Returns null otherwise.
 */
export function getPositiveWhen(whenA: string, whenB: string): string | null {
  const a = whenA.trim();
  const b = whenB.trim();
  if (isNegationOf(b, a)) {
    return a;
  }
  if (isNegationOf(a, b)) {
    return b;
  }
  // Detect === / !== pairs as complementary: "x === v" and "x !== v"
  const compResult = areComparisonInverses(a, b);
  if (compResult) {
    return compResult;
  }
  return null;
}

export function areEquivalentWhen(left: string, right: string): boolean {
  return normalizeWhenForComparison(left) === normalizeWhenForComparison(right);
}

export type ExtraStylexPropsExprEntry = {
  expr: ExpressionKind;
  conditional: boolean;
  afterBase?: boolean;
  afterVariants?: boolean;
};

/**
 * Builds style expressions from extraStylexPropsArgs entries, merging
 * complementary boolean condition pairs into single ternary expressions.
 *
 * Two entries with `when: "prop"` and `when: "!prop"` are merged into
 * `prop ? trueExpr : falseExpr` instead of emitting separate conditionals.
 */
export function buildExtraStylexPropsExprEntries(
  j: JSCodeshift,
  args: {
    entries: ReadonlyArray<{
      when?: string;
      expr: ExpressionKind;
      afterBase?: boolean;
      afterVariants?: boolean;
    }>;
    destructureProps?: string[];
    booleanProps?: ReadonlySet<string>;
  },
): ExtraStylexPropsExprEntry[] {
  const { entries, destructureProps, booleanProps } = args;
  const result: ExtraStylexPropsExprEntry[] = [];
  const consumed = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    if (consumed.has(i)) {
      continue;
    }
    const entry = entries[i]!;

    if (!entry.when) {
      result.push({
        expr: entry.expr,
        conditional: false,
        afterBase: entry.afterBase,
        afterVariants: entry.afterVariants,
      });
      continue;
    }

    // Look for a complementary entry to merge into a single ternary
    const complementIndex = findComplementaryEntry(entries, i, consumed);
    if (complementIndex !== null) {
      consumed.add(complementIndex);
      const other = entries[complementIndex]!;
      const positiveWhenRaw = getPositiveWhen(entry.when, other.when!)!;
      const { cond } = collectConditionProps(j, { when: positiveWhenRaw, destructureProps });

      const isEntryPositive = areEquivalentWhen(entry.when, positiveWhenRaw);
      const trueExpr = isEntryPositive ? entry.expr : other.expr;
      const falseExpr = isEntryPositive ? other.expr : entry.expr;

      result.push({
        expr: j.conditionalExpression(cond, trueExpr, falseExpr),
        conditional: true,
        afterBase: entry.afterBase || other.afterBase,
        afterVariants: entry.afterVariants || other.afterVariants,
      });
      continue;
    }

    // No complement found — emit standard conditional
    const { cond, isBoolean } = collectConditionProps(j, {
      when: entry.when,
      destructureProps,
      booleanProps,
    });
    result.push({
      expr: makeConditionalStyleExpr(j, { cond, expr: entry.expr, isBoolean }),
      conditional: true,
      afterBase: entry.afterBase,
      afterVariants: entry.afterVariants,
    });
  }

  return result;
}

export function buildExtraStylexPropsExprs(
  j: JSCodeshift,
  args: Parameters<typeof buildExtraStylexPropsExprEntries>[1],
): ExpressionKind[] {
  return buildExtraStylexPropsExprEntries(j, args).map((entry) => entry.expr);
}

/**
 * Merges adjacent `cond && styleA, !cond && styleB` expressions into
 * `cond ? styleA : styleB` without reordering other style args.
 */
export function mergeAdjacentComplementaryStyleExprs(
  j: JSCodeshift,
  styleArgs: ExpressionKind[],
): ExpressionKind[] {
  const result: ExpressionKind[] = [];
  for (let i = 0; i < styleArgs.length; i++) {
    const current = styleArgs[i]!;
    const next = styleArgs[i + 1];
    if (next) {
      const merged = mergeComplementaryLogicalPair(j, current, next);
      if (merged) {
        result.push(merged);
        i++;
        continue;
      }
    }
    result.push(current);
  }
  return result;
}

/**
 * Finds the next unconsumed entry in sorted variant entries (as `[when, key]` tuples)
 * that has a complementary "when" condition to the entry at `index`.
 * Used by both intrinsic-simple and component emitters for ternary merging.
 */
export function findComplementaryVariantEntry(
  entries: ReadonlyArray<readonly [string, string]>,
  index: number,
  consumed: ReadonlySet<number>,
): number | null {
  const when = entries[index]?.[0];
  if (!when) {
    return null;
  }
  let next = index + 1;
  while (next < entries.length && consumed.has(next)) {
    next++;
  }
  if (next >= entries.length) {
    return null;
  }
  const otherWhen = entries[next]?.[0];
  if (otherWhen && getPositiveWhen(when, otherWhen) !== null) {
    return next;
  }
  return null;
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

function mergeComplementaryLogicalPair(
  j: JSCodeshift,
  leftExpr: ExpressionKind,
  rightExpr: ExpressionKind,
): ExpressionKind | null {
  const left = getConditionalStyleParts(j, leftExpr);
  const right = getConditionalStyleParts(j, rightExpr);
  if (!left || !right) {
    return null;
  }

  const positiveWhen = getPositiveWhen(left.when, right.when);
  if (!positiveWhen) {
    return null;
  }

  const isLeftPositive = areEquivalentWhen(left.when, positiveWhen);
  return j.conditionalExpression(
    isLeftPositive ? left.cond : right.cond,
    isLeftPositive ? left.style : right.style,
    isLeftPositive ? right.style : left.style,
  );
}

function getConditionalStyleParts(
  j: JSCodeshift,
  expr: ExpressionKind,
): {
  when: string;
  cond: ExpressionKind;
  style: ExpressionKind;
} | null {
  if (expr.type !== "LogicalExpression" || expr.operator !== "&&") {
    return null;
  }
  const cond = expr.left as ExpressionKind;
  const when = printCondition(j, cond);
  if (!when) {
    return null;
  }
  return {
    when,
    cond,
    style: expr.right as ExpressionKind,
  };
}

function printCondition(j: JSCodeshift, cond: ExpressionKind): string | null {
  try {
    return j(cond).toSource();
  } catch {
    return null;
  }
}

/**
 * Detects if two "when" strings differ only in === vs !==.
 * Returns the "===" variant (the positive one) or null if they're not inverses.
 */
function areComparisonInverses(a: string, b: string): string | null {
  const aNorm = normalizeWhenForComparison(a);
  const bNorm = normalizeWhenForComparison(b);
  const aComparison = parseSingleComparison(aNorm);
  const bComparison = parseSingleComparison(bNorm);
  if (!aComparison || !bComparison) {
    return null;
  }
  if (aComparison.left !== bComparison.left || aComparison.right !== bComparison.right) {
    return null;
  }
  if (aComparison.operator === "===" && bComparison.operator === "!==") {
    return a.trim();
  }
  if (aComparison.operator === "!==" && bComparison.operator === "===") {
    return b.trim();
  }
  return null;
}

function parseSingleComparison(expr: string): {
  left: string;
  operator: "===" | "!==";
  right: string;
} | null {
  const neqIndex = findTopLevelOperator(expr, "!==");
  const eqIndex = findTopLevelOperator(expr, "===");
  if ((neqIndex >= 0 && eqIndex >= 0) || (neqIndex < 0 && eqIndex < 0)) {
    return null;
  }
  const operator = neqIndex >= 0 ? "!==" : "===";
  const index = neqIndex >= 0 ? neqIndex : eqIndex;
  const left = expr.slice(0, index);
  const right = expr.slice(index + operator.length);
  if (!left || !right || hasTopLevelLogicalOperator(left) || hasTopLevelLogicalOperator(right)) {
    return null;
  }
  return { left, operator, right };
}

function hasTopLevelLogicalOperator(expr: string): boolean {
  return findTopLevelOperator(expr, "&&") >= 0 || findTopLevelOperator(expr, "||") >= 0;
}

function findTopLevelOperator(expr: string, operator: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i <= expr.length - operator.length; i++) {
    const ch = expr[i]!;
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      continue;
    }
    if (depth === 0 && expr.slice(i, i + operator.length) === operator) {
      return i;
    }
  }
  return -1;
}

function isNegationOf(candidate: string, base: string): boolean {
  const candidateNormalized = normalizeWhenForComparison(candidate);
  const baseNormalized = normalizeWhenForComparison(base);

  // Allow bare negation only for atomic expressions like `foo` or `props.foo`.
  if (isAtomicWhenExpression(baseNormalized) && candidateNormalized === `!${baseNormalized}`) {
    return true;
  }

  // For compound expressions, require grouped negation: `!(a || b)`.
  if (!candidateNormalized.startsWith("!(") || !candidateNormalized.endsWith(")")) {
    return false;
  }
  const grouped = candidateNormalized.slice(1);
  if (!hasEnclosingParens(grouped)) {
    return false;
  }
  const inner = normalizeWhenForComparison(candidateNormalized.slice(2, -1));
  return inner === baseNormalized;
}

function normalizeWhenForComparison(when: string): string {
  const withoutWhitespace = removeWhitespaceOutsideLiterals(String(when ?? ""));
  return stripOuterParens(withoutWhitespace);
}

function removeWhitespaceOutsideLiterals(expr: string): string {
  let result = "";
  let quote: string | null = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]!;
    if (quote) {
      result += ch;
      if (ch === "\\") {
        const next = expr[i + 1];
        if (next !== undefined) {
          result += next;
          i++;
        }
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      result += ch;
      continue;
    }
    if (!/\s/.test(ch)) {
      result += ch;
    }
  }
  return result;
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

function isAtomicWhenExpression(expr: string): boolean {
  return /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(expr);
}
