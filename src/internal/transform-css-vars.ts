/**
 * Rewrites CSS variable entries inside style objects.
 * Core concepts: var() replacement and AST value normalization.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ImportSpec, ResolveValueContext, ResolveValueResult } from "../adapter.js";
import { findCssVarCallsInString, resolveCssVarCall, rewriteCssVarsInString } from "./css-vars.js";
import type { ComputedKeyEntry } from "./transform/helpers.js";
import { isAstNode } from "./utilities/jscodeshift-utils.js";

export function rewriteCssVarsInStyleObject(
  args: CssVarRewriteContext & {
    obj: Record<string, unknown>;
  },
): void {
  const { obj, ...ctx } = args;
  rewriteCssVarsInStyleObjectImpl(obj, ctx);
}

/**
 * Recursively rewrites `var(...)` calls embedded in a single AST node (e.g. a
 * style function body's TemplateLiteral). Used when style values are not stored
 * as plain object entries, but as AST nodes inside `styleFnDecls`.
 */
export function rewriteCssVarsInAstNodeRoot(
  args: CssVarRewriteContext & {
    node: { type: string };
  },
): void {
  const { node, ...ctx } = args;
  rewriteCssVarsInAstNodeAndMaybeSimplify(node, ctx);
}

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

type CssVarRewriteContext = {
  filePath: string;
  definedVars: Map<string, string>;
  varsToDrop: Set<string>;
  resolveValue: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
};

type TemplateElementNode = {
  type: "TemplateElement";
  value: { raw?: string; cooked?: string };
  tail?: boolean;
};

type TemplateLiteralNode = {
  type: "TemplateLiteral";
  quasis: TemplateElementNode[];
  expressions: ExpressionKind[];
};

function rewriteCssVarsInStyleObjectImpl(
  obj: Record<string, unknown>,
  ctx: CssVarRewriteContext,
): void {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("--")) {
      const rewrittenValue = rewriteCssVarsInStyleObjectValue(v, ctx);
      const result = ctx.resolveValue({
        kind: "cssVariable",
        name: k,
        filePath: ctx.filePath,
        ...(typeof v === "string" ? { definedValue: v } : {}),
      });

      if (!result) {
        obj[k] = rewrittenValue;
        continue;
      }

      delete obj[k];

      if (result.dropDefinition) {
        continue;
      }

      const keyExpr = ctx.parseExpr(result.expr);
      if (!keyExpr) {
        obj[k] = rewrittenValue;
        continue;
      }

      for (const imp of result.imports ?? []) {
        ctx.addImport(imp);
      }

      const computedKeys: ComputedKeyEntry[] = Array.isArray(obj.__computedKeys)
        ? obj.__computedKeys
        : [];
      computedKeys.push({
        keyExpr,
        value: rewrittenValue,
        prepend: true,
        originalCssVariableName: k,
      });
      obj.__computedKeys = computedKeys;
      continue;
    }

    obj[k] = rewriteCssVarsInStyleObjectValue(v, ctx);
  }
}

function rewriteCssVarsInStyleObjectValue(value: unknown, ctx: CssVarRewriteContext): unknown {
  if (value && typeof value === "object") {
    if (isAstNode(value)) {
      return rewriteCssVarsInAstNodeAndMaybeSimplify(value, ctx) ?? value;
    }
    rewriteCssVarsInStyleObjectImpl(value as Record<string, unknown>, ctx);
    return value;
  }

  if (typeof value === "string") {
    return rewriteCssVarsInString({ raw: value, ...ctx });
  }

  return value;
}

/**
 * Walks an AST node (e.g. TemplateLiteral, ArrowFunctionExpression) to find `var(...)`
 * calls embedded in template literal quasis and rewrites them via the adapter.
 *
 * When a `var(--name, fallback)` is fully contained within a single template element,
 * the rewrite is straightforward (similar to rewriteCssVarsInString).
 *
 * When the `var(...)` call spans multiple quasis (because `${dynamic}` is INSIDE the
 * var() call's name or fallback), the resolved adapter expression replaces the entire
 * var(...) — the dynamic expressions inside are dropped. This matches the user
 * expectation that adapter-resolved tokens supersede their default values.
 */
function rewriteCssVarsInAstNode(node: { type: string }, ctx: CssVarRewriteContext): void {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (!isAstNode(item)) {
          continue;
        }
        const replacement = rewriteCssVarsInAstNodeAndMaybeSimplify(item, ctx);
        if (replacement) {
          value[i] = replacement;
        }
      }
      continue;
    }
    if (isAstNode(value)) {
      const replacement = rewriteCssVarsInAstNodeAndMaybeSimplify(value, ctx);
      if (replacement) {
        (node as Record<string, unknown>)[key] = replacement;
      }
    }
  }
}

/**
 * Rewrites a child AST node and returns a simplified replacement when the rewrite
 * collapses a TemplateLiteral to a single bare expression. Returns `null` when no
 * replacement is needed (the node was either not modified or remains a template literal).
 */
function rewriteCssVarsInAstNodeAndMaybeSimplify(
  node: { type: string },
  ctx: CssVarRewriteContext,
): ExpressionKind | null {
  if (node.type === "TemplateLiteral") {
    const tpl = node as TemplateLiteralNode;
    const modified = rewriteCssVarsInTemplateLiteral(tpl, ctx);
    if (modified) {
      return simplifyTemplateLiteral(tpl);
    }
    return null;
  }
  rewriteCssVarsInAstNode(node, ctx);
  return null;
}

/**
 * Simplifies a trivial template literal `${expr}` (single expression with empty quasis)
 * to the bare expression. Returns null when the template literal cannot be simplified.
 */
function simplifyTemplateLiteral(node: TemplateLiteralNode): ExpressionKind | null {
  if (node.expressions.length !== 1) {
    return null;
  }
  for (const q of node.quasis) {
    const text = q.value.cooked ?? q.value.raw ?? "";
    if (text !== "") {
      return null;
    }
  }
  return node.expressions[0]!;
}

function rewriteCssVarsInTemplateLiteral(
  node: TemplateLiteralNode,
  ctx: CssVarRewriteContext,
): boolean {
  const quasis = node.quasis;
  const expressions = node.expressions;
  if (!Array.isArray(quasis) || quasis.length === 0) {
    return false;
  }

  // Recurse into expression children first (e.g. nested template literals in interpolations).
  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i];
    if (!isAstNode(expr)) {
      continue;
    }
    const replacement = rewriteCssVarsInAstNodeAndMaybeSimplify(expr, ctx);
    if (replacement) {
      expressions[i] = replacement;
    }
  }

  // Build a combined string with placeholders marking each interpolation slot.
  // Null bytes ensure the placeholder cannot appear in legitimate CSS source text.
  const PLACEHOLDER_PREFIX = "\u0000__SC_TPL_EXPR_";
  const PLACEHOLDER_SUFFIX = "__\u0000";
  // eslint-disable-next-line no-control-regex
  const placeholderPattern = /\u0000__SC_TPL_EXPR_\d+__\u0000/g;
  const slotPositions: Array<{ start: number; end: number; slotIdx: number }> = [];
  let combined = "";
  for (let i = 0; i < quasis.length; i++) {
    const q = quasis[i]!;
    const text = q.value.cooked ?? q.value.raw ?? "";
    combined += text;
    if (i < expressions.length) {
      const placeholder = `${PLACEHOLDER_PREFIX}${i}${PLACEHOLDER_SUFFIX}`;
      slotPositions.push({
        start: combined.length,
        end: combined.length + placeholder.length,
        slotIdx: i,
      });
      combined += placeholder;
    }
  }

  const calls = findCssVarCallsInString(combined);
  if (calls.length === 0) {
    return false;
  }

  type Replacement = { start: number; end: number; expr: ExpressionKind };
  const replacements: Replacement[] = [];

  for (const call of calls) {
    // Strip placeholder sentinels from the fallback before forwarding to the adapter so
    // adapter logic that inspects `ctx.fallback` (validation, parsing, expression generation)
    // never sees synthetic interpolation markers. When the fallback consists entirely of
    // placeholders/whitespace, omit it altogether.
    const cleanedFallback = call.fallback
      ? call.fallback.replace(placeholderPattern, "").trim().replace(/,\s*$/, "")
      : undefined;
    const res = resolveCssVarCall({
      call: {
        start: call.start,
        end: call.end,
        name: call.name,
        ...(cleanedFallback ? { fallback: cleanedFallback } : {}),
      },
      definedValue: ctx.definedVars.get(call.name),
      filePath: ctx.filePath,
      resolveValue: ctx.resolveValue,
    });
    if (!res) {
      continue;
    }
    const exprAst = ctx.parseExpr(res.expr);
    if (!exprAst) {
      continue;
    }
    for (const imp of res.imports ?? []) {
      ctx.addImport(imp);
    }
    if ("dropDefinition" in res && res.dropDefinition) {
      ctx.varsToDrop.add(call.name);
    }
    replacements.push({ start: call.start, end: call.end, expr: exprAst });
  }

  if (replacements.length === 0) {
    return false;
  }

  // Rebuild the template literal:
  // - For each replacement, drop interpolation slots whose placeholders fall fully
  //   inside the var(...) span (their expressions are subsumed by the adapter result).
  // - Outside var(...) spans, preserve the original text and slot expressions.
  const newQuasis: TemplateElementNode[] = [];
  const newExpressions: ExpressionKind[] = [];
  let cursor = 0;
  let currentText = "";

  const flushQuasi = (tail: boolean): void => {
    newQuasis.push({
      type: "TemplateElement",
      value: { raw: currentText, cooked: currentText },
      tail,
    });
    currentText = "";
  };

  let nextSlotIdx = 0;
  const advanceSlotsTo = (pos: number): void => {
    while (nextSlotIdx < slotPositions.length) {
      const slot = slotPositions[nextSlotIdx]!;
      if (slot.start >= pos) {
        return;
      }
      currentText += combined.slice(cursor, slot.start);
      flushQuasi(false);
      newExpressions.push(expressions[slot.slotIdx]!);
      cursor = slot.end;
      nextSlotIdx++;
    }
  };

  for (const r of replacements) {
    advanceSlotsTo(r.start);
    currentText += combined.slice(cursor, r.start);
    flushQuasi(false);
    newExpressions.push(r.expr);
    cursor = r.end;
    // Skip any slots fully inside this replacement (their expressions are dropped)
    while (nextSlotIdx < slotPositions.length) {
      const slot = slotPositions[nextSlotIdx]!;
      if (slot.start >= r.end) {
        break;
      }
      nextSlotIdx++;
    }
  }

  advanceSlotsTo(combined.length);
  currentText += combined.slice(cursor);
  flushQuasi(true);

  // Mutate the input node in place to preserve identity for the surrounding AST.
  node.quasis = newQuasis;
  node.expressions = newExpressions;
  return true;
}
