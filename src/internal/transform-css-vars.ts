/**
 * Rewrites CSS variable entries inside style objects.
 * Core concepts: var() replacement and AST value normalization.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ImportSpec, ResolveValueContext, ResolveValueResult } from "../adapter.js";
import { findCssVarCallsInString, resolveCssVarCall, rewriteCssVarsInString } from "./css-vars.js";
import { SOURCE_CSS_PROPERTIES_KEY, type ComputedKeyEntry } from "./transform/helpers.js";
import type { LocalStylexVarRef } from "./transform-types.js";
import { isAstNode } from "./utilities/jscodeshift-utils.js";

export { stylexVarMemberExpression };

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
  localStylexVars?: Map<string, LocalStylexVarRef>;
  getLocalStylexVar?: (cssName: string, defaultValue: string) => LocalStylexVarRef | undefined;
  getOrCreateLocalStylexVar?: (
    cssName: string,
    defaultValue: string | number | null,
  ) => LocalStylexVarRef;
  resolveValue: (ctx: ResolveValueContext) => ResolveValueResult | undefined;
  addImport: (imp: ImportSpec) => void;
  parseExpr: (exprSource: string) => ExpressionKind | null;
  j: JSCodeshift;
  cssProperty?: string;
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

type OriginalCssProperties = Record<string, string>;

function rewriteCssVarsInStyleObjectImpl(
  obj: Record<string, unknown>,
  ctx: CssVarRewriteContext,
): void {
  const originalCssProperties = readOriginalCssProperties(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith("--")) {
      const rewrittenValue = rewriteCssVarsInStyleObjectValue(v, ctx);
      const result = ctx.resolveValue({
        kind: "cssVariable",
        name: k,
        filePath: ctx.filePath,
        ...(ctx.cssProperty ? { cssProperty: ctx.cssProperty } : {}),
        ...(typeof v === "string" ? { definedValue: v } : {}),
      });

      if (!result) {
        const localVar =
          typeof v === "string"
            ? ctx.getLocalStylexVar?.(k, v)
            : isSupportedDefineVarsDefault(rewrittenValue) && ctx.getOrCreateLocalStylexVar
              ? ctx.getOrCreateLocalStylexVar(k, rewrittenValue)
              : undefined;
        if (localVar) {
          delete obj[k];
          addComputedKeyForCssVar(obj, {
            keyExpr: stylexVarMemberExpression(ctx.j, localVar),
            value: rewrittenValue,
            originalCssVariableName: k,
          });
          continue;
        }
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

      addComputedKeyForCssVar(obj, {
        keyExpr,
        value: rewrittenValue,
        originalCssVariableName: k,
      });
      continue;
    }

    if (k === "__computedKeys") {
      rewriteComputedKeyValues(v, ctx);
      continue;
    }

    if (k.startsWith("__")) {
      continue;
    }

    obj[k] = rewriteCssVarsInStyleObjectValue(v, {
      ...ctx,
      cssProperty: getCssVariableValueProperty(k, ctx, originalCssProperties),
    });
  }
}

function isSupportedDefineVarsDefault(value: unknown): value is string | number | null {
  return value === null || typeof value === "string" || typeof value === "number";
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
    const rewritten = rewriteCssVarsInString({ raw: value, ...ctx });
    if (rewritten !== value) {
      return rewritten;
    }
    const localRewrite = rewriteLocalStylexVarString(value, ctx);
    return localRewrite ?? value;
  }

  return value;
}

function readOriginalCssProperties(obj: Record<string, unknown>): OriginalCssProperties {
  const raw = obj[SOURCE_CSS_PROPERTIES_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || isAstNode(raw)) {
    return {};
  }
  return raw as OriginalCssProperties;
}

function getCssVariableValueProperty(
  key: string,
  ctx: CssVarRewriteContext,
  originalCssProperties: OriginalCssProperties,
): string | undefined {
  if (key === "default" || key.startsWith(":") || key.startsWith("@") || key.startsWith("--")) {
    return ctx.cssProperty;
  }
  return originalCssProperties[key] ?? key;
}

function rewriteLocalStylexVarString(
  value: string,
  ctx: CssVarRewriteContext,
): ExpressionKind | null {
  const calls = findCssVarCallsInString(value).filter((call) => call.fallback);
  for (const call of calls) {
    const fallback = call.fallback?.trim().replace(/,\s*$/, "");
    if (!fallback) {
      continue;
    }
    const localVar =
      ctx.getLocalStylexVar?.(call.name, fallback) ??
      (ctx.definedVars.has(call.name)
        ? ctx.getOrCreateLocalStylexVar?.(call.name, fallback)
        : undefined);
    if (!localVar || localVar.defaultValue !== fallback) {
      continue;
    }
    if (call.start === 0 && call.end === value.length) {
      return stylexVarMemberExpression(ctx.j, localVar);
    }
  }
  return null;
}

function rewriteComputedKeyValues(value: unknown, ctx: CssVarRewriteContext): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || isAstNode(entry)) {
      continue;
    }
    const record = entry as { value?: unknown };
    record.value = rewriteCssVarsInStyleObjectValue(record.value, ctx);
  }
}

function rewriteCssVarsInAstNode(node: { type: string }, ctx: CssVarRewriteContext): void {
  rewriteCssVarPropertyKeyInAstNode(node, ctx);

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

function rewriteCssVarPropertyKeyInAstNode(
  node: { type: string },
  ctx: CssVarRewriteContext,
): void {
  if (node.type !== "Property" && node.type !== "ObjectProperty") {
    return;
  }
  const property = node as {
    key?: { type?: string; name?: string; value?: unknown };
    value?: { type?: string; value?: unknown };
    computed?: boolean;
  };
  const rawKey = readStaticPropertyKey(property.key);
  if (!rawKey?.startsWith("--")) {
    return;
  }
  const localVar =
    typeof property.value?.value === "string"
      ? ctx.getLocalStylexVar?.(rawKey, property.value.value)
      : undefined;
  if (!localVar) {
    return;
  }
  property.key = stylexVarMemberExpression(ctx.j, localVar) as typeof property.key;
  property.computed = true;
}

function readStaticPropertyKey(
  key: { type?: string; name?: string; value?: unknown } | undefined,
): string | null {
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return key.name ?? null;
  }
  if (typeof key.value === "string") {
    return key.value;
  }
  return null;
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
  if (node.type === "StringLiteral" || node.type === "Literal") {
    const literal = node as { value?: unknown };
    if (typeof literal.value !== "string") {
      return null;
    }
    const rewritten = rewriteCssVarsInString({ raw: literal.value, ...ctx });
    return rewritten === literal.value ? null : (rewritten as ExpressionKind);
  }
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
    const localVar = cleanedFallback
      ? ctx.getLocalStylexVar?.(call.name, cleanedFallback)
      : undefined;
    if (localVar && cleanedFallback === localVar.defaultValue) {
      replacements.push({
        start: call.start,
        end: call.end,
        expr: stylexVarMemberExpression(ctx.j, localVar),
      });
      continue;
    }

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
      ...(ctx.cssProperty ? { cssProperty: ctx.cssProperty } : {}),
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

function addComputedKeyForCssVar(
  obj: Record<string, unknown>,
  entry: Omit<ComputedKeyEntry, "prepend">,
): void {
  const computedKeys: ComputedKeyEntry[] = Array.isArray(obj.__computedKeys)
    ? (obj.__computedKeys as ComputedKeyEntry[])
    : [];
  computedKeys.push({
    ...entry,
    prepend: true,
  });
  obj.__computedKeys = computedKeys;
}

function stylexVarMemberExpression(j: JSCodeshift, ref: LocalStylexVarRef): ExpressionKind {
  const keyExpr = ref.keyName.startsWith("--") ? j.literal(ref.keyName) : j.identifier(ref.keyName);
  return j.memberExpression(j.identifier(ref.groupName), keyExpr, ref.keyName.startsWith("--"));
}
