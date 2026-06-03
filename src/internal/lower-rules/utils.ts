/**
 * Shared lower-rules helpers for merging and formatting style objects.
 * Core concepts: deep merge semantics, AST node detection, and media query resolution.
 */
import {
  extractRootAndPath,
  isAstNode,
  isMemberExpressionNode,
} from "../utilities/jscodeshift-utils.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import type { Adapter, CallResolveContext, ImportSource, ImportSpec } from "../../adapter.js";
import { callArgsFromNode, isAdapterResultCssValue } from "../builtin-handlers/resolver-utils.js";
import { literalToStaticValue } from "./types.js";

// Re-exported for backwards compatibility; the canonical home is utilities/ast-walk.
export { walkAst } from "../utilities/ast-walk.js";

type ImportMeta = { importedName: string; source: ImportSource };
type ImportLookup = (localName: string, identNode?: unknown) => ImportMeta | null;
type MediaSlotResolution =
  | { kind: "static"; value: string | number; imports: ImportSpec[] }
  | { kind: "expression"; expr: string; imports: ImportSpec[] };

/** Context needed to resolve imported function calls via the adapter's `resolveCall`. */
export type AdapterCallResolver = {
  resolveCall: (
    ctx: CallResolveContext,
  ) => import("../../adapter.js").CallResolveResult | undefined;
  resolveImportInScope: (localName: string, identNode?: unknown) => ImportMeta | null;
  parseExpr: (exprSource: string) => unknown;
  resolverImports: Map<string, ImportSpec>;
  filePath: string;
};

/**
 * Tries to resolve a CallExpression via the adapter's `resolveCall`.
 * Shared by both css-helper and process-rules slot resolution.
 *
 * Returns `{ ast, exprString }` on success, `null` otherwise.
 */
export function tryResolveAdapterCall(
  expr: unknown,
  cssProperty: string | undefined,
  resolver: AdapterCallResolver,
): { ast: unknown; exprString: string } | null {
  const callExpr = expr as { type?: string; callee?: unknown; arguments?: unknown[] };
  if (callExpr.type !== "CallExpression" || !callExpr.callee) {
    return null;
  }
  const calleeInfo = extractRootAndPath(callExpr.callee);
  if (!calleeInfo) {
    return null;
  }
  const imp = resolver.resolveImportInScope(calleeInfo.rootName, calleeInfo.rootNode);
  if (!imp) {
    return null;
  }
  const args = callArgsFromNode(callExpr.arguments);
  const loc = (callExpr as { loc?: { start?: { line: number; column: number } } }).loc?.start;
  const result = resolver.resolveCall({
    callSiteFilePath: resolver.filePath,
    calleeImportedName: imp.importedName,
    calleeSource: imp.source,
    args,
    ...(calleeInfo.path.length > 0 ? { calleeMemberPath: calleeInfo.path } : {}),
    ...(loc ? { loc: { line: loc.line, column: loc.column } } : {}),
    ...(cssProperty ? { cssProperty } : {}),
  });
  if (!result || !("expr" in result) || !isAdapterResultCssValue(result, cssProperty)) {
    return null;
  }
  registerImports(result.imports, resolver.resolverImports);
  const ast = resolver.parseExpr(result.expr);
  if (!ast) {
    return null;
  }
  return { ast, exprString: result.expr };
}

/** Registers resolved imports into a deduplication map keyed by JSON.stringify. */
export function registerImports(
  imports: Iterable<ImportSpec> | null | undefined,
  resolverImports: Map<string, ImportSpec>,
): void {
  if (!imports) {
    return;
  }
  for (const imp of imports) {
    resolverImports.set(JSON.stringify(imp), imp);
  }
}

/** Returns true if the AST node is a `MemberExpression` or `OptionalMemberExpression`. */
export function isMemberExpression(node: { type?: string } | null | undefined): boolean {
  return isMemberExpressionNode(node);
}

/** Returns true for at-rules the codemod can transform as StyleX condition keys. */
export function isSupportedAtRule(atRule: string): boolean {
  return (
    atRule.startsWith("@media") || atRule.startsWith("@container") || atRule.startsWith("@supports")
  );
}

/** Finds the supported StyleX condition key for an at-rule stack, if representable. */
export function findSupportedAtRule(atRuleStack: string[]): string | undefined {
  return resolveSupportedAtRule(atRuleStack) ?? undefined;
}

/** Returns true when any at-rule in the stack cannot be represented by StyleX. */
export function hasUnsupportedAtRule(atRuleStack: string[]): boolean {
  return resolveSupportedAtRule(atRuleStack) === null;
}

/** Result of resolving a media/container at-rule that may contain placeholders. */
export type ResolvedMedia =
  | { kind: "static"; value: string }
  | { kind: "computed"; keyExpr: unknown; imports: ImportSpec[] };

/**
 * Resolves a media/container at-rule string that may contain `__SC_EXPR_N__` placeholders.
 *
 * First tries `resolveSelector` (when available) to produce a computed key like
 * `[breakpoints.phone]`. Falls back to static value substitution.
 *
 * Returns null if the placeholder cannot be resolved at all.
 */
export function resolveMediaAtRulePlaceholders(
  media: string,
  getSlotExpr: (slotId: number) => unknown,
  ctx: {
    lookupImport: ImportLookup;
    resolveValue: Adapter["resolveValue"];
    resolveSelector?: Adapter["resolveSelector"];
    parseExpr?: (expr: string) => unknown;
    filePath: string;
    resolverImports: Map<string, ImportSpec>;
  },
): ResolvedMedia | null {
  if (!media.includes("__SC_EXPR_")) {
    return { kind: "static", value: media };
  }

  const globalRe = new RegExp(PLACEHOLDER_RE.source, "g");
  const matches = [...media.matchAll(globalRe)];

  // Single placeholder: try resolveSelector for a defineConsts-backed computed key
  if (matches.length === 1 && ctx.resolveSelector && ctx.parseExpr) {
    const slotId = Number(matches[0]![1]);
    const match = matches[0]!;
    const expr = getSlotExpr(slotId);
    if (expr && typeof expr === "object") {
      const info = extractRootAndPath(expr);
      if (info) {
        const imp = ctx.lookupImport(info.rootName, info.rootNode);
        if (imp) {
          const result = ctx.resolveSelector({
            kind: "mediaQueryInterpolation",
            importedName: imp.importedName,
            source: imp.source,
            path: info.path.length > 0 ? info.path.join(".") : undefined,
            filePath: ctx.filePath,
            mediaQuery: getMediaQueryInterpolationContext(media, slotId, match),
          });
          if (result?.kind === "media") {
            const keyExpr = ctx.parseExpr(result.expr);
            if (keyExpr) {
              registerImports(result.imports, ctx.resolverImports);
              return { kind: "computed", keyExpr, imports: result.imports ?? [] };
            }
          }
        }
      }
    }
  }

  // Fall back to preserving the at-rule text and resolving slots inline.
  return resolveMediaQueryPlaceholders(
    media,
    (slotId) =>
      resolveSlotExprForMedia(
        getSlotExpr(slotId),
        ctx.lookupImport,
        ctx.resolveValue,
        ctx.filePath,
      ),
    ctx.resolverImports,
  );
}

function getMediaQueryInterpolationContext(
  atRule: string,
  slotId: number,
  match: RegExpMatchArray,
): {
  atRule: string;
  slotId: number;
  before: string;
  after: string;
  feature?: { modifier?: "min" | "max"; name: string; unit?: string };
} {
  const matchStart = match.index ?? 0;
  const matchEnd = matchStart + match[0].length;
  const before = atRule.slice(0, matchStart);
  const after = atRule.slice(matchEnd);
  return {
    atRule,
    slotId,
    before,
    after,
    ...getMediaFeatureContext(before, after),
  };
}

function getMediaFeatureContext(
  before: string,
  after: string,
): { feature?: { modifier?: "min" | "max"; name: string; unit?: string } } {
  const featureMatch = before.match(/\((?:(min|max)-)?([a-zA-Z-]+)\s*:\s*$/);
  if (!featureMatch) {
    return {};
  }

  const unitMatch = after.match(/^\s*([a-zA-Z%]+)/);
  const modifier =
    featureMatch[1] === "min" || featureMatch[1] === "max" ? featureMatch[1] : undefined;
  return {
    feature: {
      ...(modifier ? { modifier } : {}),
      name: featureMatch[2]!,
      ...(unitMatch ? { unit: unitMatch[1] } : {}),
    },
  };
}

/** Returns true if the key looks like a StyleX style condition (pseudo, media, container). */
export function isStyleConditionKey(key: string): boolean {
  return (
    key.startsWith(":") ||
    key.startsWith("::") ||
    key.startsWith("@media") ||
    key.startsWith("@container") ||
    key.startsWith("@supports")
  );
}

/**
 * Merges tracked @media values into a base style object as nested StyleX objects.
 * Each property that has media-scoped values is wrapped in:
 * `{ default: baseValue, "@media (...)": mediaValue }`
 */
export function mergeMediaIntoStyles(
  base: Record<string, unknown>,
  mediaStyles: Map<string, Record<string, unknown>>,
): void {
  for (const [mediaQuery, mediaStyle] of mediaStyles) {
    for (const [prop, mediaValue] of Object.entries(mediaStyle)) {
      const baseValue = base[prop];
      base[prop] = { default: baseValue ?? null, [mediaQuery]: mediaValue };
    }
  }
}

/**
 * Recursively merges style objects, combining nested objects rather than overwriting.
 *
 * Note: Security scanners may flag this as prototype pollution, but this is a false positive.
 * This is a codemod that runs locally on the developer's own source code - there is no
 * untrusted input that could exploit prototype pollution. The source objects are style
 * declarations extracted from the developer's own styled-components code.
 */
export function mergeStyleObjects(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value) &&
      !isAstNode(existing) &&
      !isAstNode(value)
    ) {
      mergeStyleObjects(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Non-exported helpers
// ---------------------------------------------------------------------------

/** Resolves `__SC_EXPR_N__` placeholders in a media string. */
function resolveMediaQueryPlaceholders(
  mediaQuery: string,
  resolveSlot: (slotId: number) => MediaSlotResolution | null,
  resolverImports: Map<string, ImportSpec>,
): ResolvedMedia | null {
  if (!mediaQuery.includes("__SC_EXPR_")) {
    return { kind: "static", value: mediaQuery };
  }

  const globalRe = new RegExp(PLACEHOLDER_RE.source, "g");
  let staticValue = "";
  let hasExpression = false;
  const imports: ImportSpec[] = [];
  let lastIndex = 0;
  let match;

  while ((match = globalRe.exec(mediaQuery)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const before = mediaQuery.slice(lastIndex, start);
    const slot = resolveSlot(Number(match[1]));
    if (!slot) {
      return null;
    }

    staticValue += before;
    imports.push(...slot.imports);

    if (slot.kind === "static") {
      const value = String(slot.value);
      staticValue += value;
    } else {
      hasExpression = true;
    }

    lastIndex = end;
  }

  const after = mediaQuery.slice(lastIndex);
  staticValue += after;

  if (!hasExpression) {
    registerImports(imports, resolverImports);
    return { kind: "static", value: staticValue };
  }

  // StyleX only accepts static media condition keys or direct defineConsts keys.
  // A computed template literal like [`@media (... ${token} ...)`] is rejected by
  // the StyleX compiler, so unresolved expression placeholders must bail.
  return null;
}

/** Resolves a slot expression AST node to either a static value or adapter expression. */
function resolveSlotExprForMedia(
  expr: unknown,
  lookupImport: ImportLookup,
  resolveValue: Adapter["resolveValue"],
  filePath: string,
): MediaSlotResolution | null {
  if (!expr || typeof expr !== "object") {
    return null;
  }

  const staticVal = literalToStaticValue(expr);
  if (typeof staticVal === "string" || typeof staticVal === "number") {
    return { kind: "static", value: staticVal, imports: [] };
  }

  const info = extractRootAndPath(expr);
  if (!info) {
    return null;
  }

  const imp = lookupImport(info.rootName, info.rootNode);
  if (!imp) {
    return null;
  }

  const result = resolveValue({
    kind: "importedValue",
    importedName: imp.importedName,
    source: imp.source,
    ...(info.path.length > 0 ? { path: info.path.join(".") } : {}),
    filePath,
  });
  if (!result || !("expr" in result)) {
    return null;
  }

  const staticResult = parseStaticExprString(result.expr);
  if (staticResult !== null) {
    return { kind: "static", value: staticResult, imports: result.imports ?? [] };
  }

  return { kind: "expression", expr: result.expr, imports: result.imports ?? [] };
}

/** Parses a JS expression string as a static numeric or quoted string value. */
function parseStaticExprString(expr: string): string | number | null {
  const trimmed = expr.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "") {
    return num;
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return null;
}

function resolveSupportedAtRule(atRuleStack: string[]): string | undefined | null {
  if (atRuleStack.length === 0) {
    return undefined;
  }
  if (atRuleStack.some((atRule) => !isSupportedAtRule(atRule))) {
    return null;
  }
  if (atRuleStack.length === 1) {
    return atRuleStack[0];
  }
  if (atRuleStack.every((atRule) => atRule.startsWith("@supports"))) {
    return combineSupportsAtRules(atRuleStack);
  }
  return null;
}

function combineSupportsAtRules(atRuleStack: string[]): string {
  const conditions = atRuleStack.map((atRule) =>
    parenthesizeSupportsCondition(atRule.slice("@supports".length).trim()),
  );
  return `@supports ${conditions.join(" and ")}`;
}

function parenthesizeSupportsCondition(condition: string): string {
  if (condition.includes(" and ") || condition.includes(" or ")) {
    return `(${condition})`;
  }
  return condition.startsWith("(") && condition.endsWith(")") ? condition : `(${condition})`;
}

// ---------------------------------------------------------------------------
// Generic AST tree-walkers
// ---------------------------------------------------------------------------

type AnyNode = Record<string, unknown>;

/**
 * Recursively walk an AST tree and return `true` if the predicate matches any node.
 * Skips `loc` and `comments` keys. Short-circuits on first match.
 */
export function findInAst(root: unknown, predicate: (node: AnyNode) => boolean): boolean {
  let found = false;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || found) {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    const n = node as AnyNode;
    if (predicate(n)) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(root);
  return found;
}

/**
 * Recursively transform an AST tree by applying a replacer to each node.
 * The replacer receives a node and a `recurse` callback for continuing traversal.
 * If the replacer returns a value, that value replaces the node (no further traversal).
 * If it returns `undefined`, the default recursive traversal continues.
 * Skips `loc` and `comments` keys.
 */
export function mapAst(
  root: unknown,
  replacer: (node: AnyNode, recurse: (n: unknown) => unknown) => unknown,
): unknown {
  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    const n = node as AnyNode;
    const replaced = replacer(n, visit);
    if (replaced !== undefined) {
      return replaced;
    }
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        n[key] = visit(child);
      }
    }
    return n;
  };
  return visit(root);
}

/**
 * Recursively walk an AST tree and call `visitor` on each node to collect data.
 * Skips `loc` and `comments` keys.
 */
