/**
 * Builds and types style-function parameters after lowering: aligning param
 * names to call args, unioning required params across call sites, and narrowing
 * guarded parameter types (dropping `| undefined` when the call is guarded).
 */
import type { StyledDecl } from "../transform-types.js";
import type { JSCodeshift } from "jscodeshift";
import {
  getArrowFnSingleParamName,
  isUndefinedIdentifier,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { renameIdentifierInAst } from "./ast-style-utils.js";

type StyleFnParamBuilderJ = {
  identifier: JSCodeshift["identifier"];
  tsBooleanKeyword: JSCodeshift["tsBooleanKeyword"];
  tsNumberKeyword: JSCodeshift["tsNumberKeyword"];
  tsStringKeyword: JSCodeshift["tsStringKeyword"];
  tsTypeAnnotation: JSCodeshift["tsTypeAnnotation"];
  tsUnionType: JSCodeshift["tsUnionType"];
};

export function alignComputedCallArgStyleFnParams(
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  for (const entry of styleFnFromProps) {
    if (!entry.callArg || entry.jsxProp === "__props") {
      continue;
    }
    const fnAst = styleFnDecls.get(entry.fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const paramName = getArrowFnSingleParamName(
      fnAst as Parameters<typeof getArrowFnSingleParamName>[0],
    );
    if (!paramName || paramName === entry.jsxProp) {
      continue;
    }
    renameIdentifierInAst(fnAst, entry.jsxProp, paramName);
  }
}

/**
 * Ensures every style-fn declaration declares all the parameters the call site
 * will pass. When `styleFnFromProps` reports that a single fnKey is called
 * with both a primary jsxProp and extra call args (e.g.
 * `styles.panel(compact, isExpanded)`), but the function definition only
 * declares the primary as a parameter, the body's references to the extras
 * become dangling identifiers — TS2304 "Cannot find name 'isExpanded'" plus
 * TS2554 "Expected 1 arguments, but got 2" on the call site.
 *
 * This post-process step inspects all styleFnFromProps entries for each fnKey,
 * collects the union of jsxProps referenced as primary + extra args, and adds
 * any missing identifiers as additional parameters at the end of the
 * function's parameter list.
 */
export function unionStyleFnParamsFromStyleFnFromProps(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  const requiredParamsByFn = new Map<string, string[]>();
  for (const entry of styleFnFromProps) {
    if (entry.jsxProp === "__props" || entry.jsxProp === "__helper") {
      continue;
    }
    const requiredParams = requiredParamsByFn.get(entry.fnKey) ?? [];
    if (!requiredParams.includes(entry.jsxProp)) {
      requiredParams.push(entry.jsxProp);
    }
    if (entry.extraCallArgs) {
      for (const extra of entry.extraCallArgs) {
        if (extra.jsxProp === "__props" || extra.jsxProp === "__helper") {
          continue;
        }
        if (!requiredParams.includes(extra.jsxProp)) {
          requiredParams.push(extra.jsxProp);
        }
      }
    }
    requiredParamsByFn.set(entry.fnKey, requiredParams);
  }
  for (const [fnKey, requiredParams] of requiredParamsByFn) {
    if (requiredParams.length < 2) {
      continue;
    }
    const fnAst = styleFnDecls.get(fnKey);
    if (!fnAst || typeof fnAst !== "object") {
      continue;
    }
    const params = (fnAst as { params?: Array<{ name?: string }> }).params;
    if (!Array.isArray(params)) {
      continue;
    }
    const existingParamNames = new Set(
      params.map((p) => p?.name).filter((name): name is string => typeof name === "string"),
    );
    for (const required of requiredParams) {
      if (!existingParamNames.has(required)) {
        params.push(buildStyleFnParam(j, decl, required) as never);
        existingParamNames.add(required);
      }
    }
  }
}

export function narrowGuardedStyleFnParamTypes(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  styleFnDecls: Map<string, unknown>,
  styleFnFromProps: NonNullable<StyledDecl["styleFnFromProps"]>,
): void {
  const entriesByFnKey = new Map<string, NonNullable<StyledDecl["styleFnFromProps"]>>();
  for (const entry of styleFnFromProps) {
    const entries = entriesByFnKey.get(entry.fnKey) ?? [];
    entries.push(entry);
    entriesByFnKey.set(entry.fnKey, entries);
  }

  for (const fnKey of styleFnDecls.keys()) {
    const fnAst = styleFnDecls.get(fnKey);
    if (!isArrowFunctionWithParams(fnAst)) {
      continue;
    }
    const firstParam = fnAst.params[0];
    if (!firstParam) {
      continue;
    }
    const entries = entriesByFnKey.get(fnKey);
    const paramName = readParamName(firstParam);
    const variantWhens = Object.entries(decl.variantStyleKeys ?? {})
      .filter(([, key]) => key === fnKey)
      .map(([when]) => when);
    const extraStylexCalls = collectExtraStylexPropsArgCalls(decl, fnKey);
    const variantCallIsGuarded =
      paramName !== null &&
      variantWhens.length > 0 &&
      variantWhens.every((when) => conditionWhenGuardsProp(when, paramName));
    const extraStylexCallIsGuarded =
      extraStylexCalls.length > 0 &&
      extraStylexCalls.every((call) => extraStylexCallGuardsPrimaryArg(call));
    const isGuarded = entries
      ? entries.every(styleFnEntryGuardsPrimaryArg)
      : variantCallIsGuarded || extraStylexCallIsGuarded;
    if (!isGuarded) {
      continue;
    }
    removeUndefinedFromParamType(j, firstParam);
  }
}

function buildStyleFnParam(
  j: StyleFnParamBuilderJ,
  decl: StyledDecl,
  propName: string,
): ReturnType<JSCodeshift["identifier"]> {
  const param = j.identifier(propName);
  const typeNode = typeNodeFromPropTypeText(j, decl.typeScriptPropTypes?.get(propName));
  if (typeNode) {
    param.typeAnnotation = j.tsTypeAnnotation(typeNode);
  }
  return param;
}

// --- Non-exported helpers ---

type StyleFnParamTypeNode = Parameters<JSCodeshift["tsTypeAnnotation"]>[0];
type StyleFnUnionMemberTypeNode = Parameters<JSCodeshift["tsUnionType"]>[0][number];

function styleFnEntryGuardsPrimaryArg(
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): boolean {
  if (entry.jsxProp === "__props" || entry.jsxProp === "__helper") {
    return false;
  }
  if (!styleFnEntryPrimaryArgIsProp(entry)) {
    return false;
  }
  if (entry.condition === "truthy") {
    return true;
  }
  if (entry.condition === "always") {
    return false;
  }
  return entry.conditionWhen ? conditionWhenGuardsProp(entry.conditionWhen, entry.jsxProp) : false;
}

function styleFnEntryPrimaryArgIsProp(
  entry: NonNullable<StyledDecl["styleFnFromProps"]>[number],
): boolean {
  if (!entry.callArg) {
    return true;
  }
  const argName = readIdentifierLikeName(entry.callArg);
  return argName !== null && normalizePropName(argName) === normalizePropName(entry.jsxProp);
}

function conditionWhenGuardsProp(when: string, propName: string): boolean {
  const prop = escapeRegExp(normalizePropName(propName));
  const trimmed = when.trim();
  return (
    new RegExp(`^${prop}$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*\\|\\|\\s*false$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*!=\\s*null$`).test(trimmed) ||
    new RegExp(`^${prop}\\s*!==?\\s*undefined$`).test(trimmed)
  );
}

function collectExtraStylexPropsArgCalls(
  decl: StyledDecl,
  fnKey: string,
): Array<{ when: string | undefined; condition: ExpressionKind | null; argName: string | null }> {
  const calls: Array<{
    when: string | undefined;
    condition: ExpressionKind | null;
    argName: string | null;
  }> = [];
  for (const entry of decl.extraStylexPropsArgs ?? []) {
    const call = readExtraStylexPropsArgCall(entry.expr);
    if (call?.fnKey === fnKey) {
      calls.push({ when: entry.when, condition: call.condition, argName: call.argName });
    }
  }
  return calls;
}

function extraStylexCallGuardsPrimaryArg(call: {
  when: string | undefined;
  condition: ExpressionKind | null;
  argName: string | null;
}): boolean {
  if (call.argName === null) {
    return false;
  }
  if (call.when !== undefined) {
    return conditionWhenGuardsProp(call.when, call.argName);
  }
  return call.condition !== null && conditionExprGuardsProp(call.condition, call.argName);
}

function readExtraStylexPropsArgCall(
  expr: ExpressionKind,
): { fnKey: string; argName: string | null; condition: ExpressionKind | null } | null {
  const direct = readStyleFnCall(expr);
  if (direct) {
    return { ...direct, condition: null };
  }
  if (
    !expr ||
    typeof expr !== "object" ||
    (expr as { type?: string }).type !== "ConditionalExpression"
  ) {
    return null;
  }
  const conditional = expr as { test?: ExpressionKind; consequent?: ExpressionKind };
  if (!conditional.test || !conditional.consequent) {
    return null;
  }
  const consequentCall = readStyleFnCall(conditional.consequent);
  return consequentCall ? { ...consequentCall, condition: conditional.test } : null;
}

function readStyleFnCall(expr: ExpressionKind): { fnKey: string; argName: string | null } | null {
  if (!expr || typeof expr !== "object" || (expr as { type?: string }).type !== "CallExpression") {
    return null;
  }
  const call = expr as { callee?: unknown; arguments?: ExpressionKind[] };
  const callee = call.callee;
  if (!callee || typeof callee !== "object") {
    return null;
  }
  const member = callee as { type?: string; property?: unknown; computed?: boolean };
  if (member.type !== "MemberExpression" || member.computed) {
    return null;
  }
  const property = member.property;
  const fnKey =
    property &&
    typeof property === "object" &&
    (property as { type?: string }).type === "Identifier"
      ? ((property as { name?: string }).name ?? null)
      : null;
  if (!fnKey) {
    return null;
  }
  return {
    fnKey,
    argName: call.arguments?.[0] ? readIdentifierLikeName(call.arguments[0]) : null,
  };
}

function conditionExprGuardsProp(condition: ExpressionKind, propName: string): boolean {
  if (!condition || typeof condition !== "object") {
    return false;
  }
  const normalizedProp = normalizePropName(propName);
  const conditionName = readIdentifierLikeName(condition);
  if (conditionName !== null) {
    return normalizePropName(conditionName) === normalizedProp;
  }
  const typed = condition as {
    type?: string;
    operator?: string;
    left?: ExpressionKind;
    right?: ExpressionKind;
  };
  if (typed.type === "LogicalExpression" && typed.operator === "||") {
    return (
      typed.left !== undefined &&
      typed.right !== undefined &&
      conditionExprGuardsProp(typed.left, propName) &&
      isFalseLiteral(typed.right)
    );
  }
  if (typed.type === "BinaryExpression" && typed.left && typed.right) {
    const leftName = readIdentifierLikeName(typed.left);
    const leftMatches = leftName !== null && normalizePropName(leftName) === normalizedProp;
    if (!leftMatches) {
      return false;
    }
    return (
      (typed.operator === "!=" && isNullLiteral(typed.right)) ||
      ((typed.operator === "!==" || typed.operator === "!=") && isUndefinedIdentifier(typed.right))
    );
  }
  return false;
}

function isFalseLiteral(node: ExpressionKind): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    (((node as { type?: string; value?: unknown }).type === "BooleanLiteral" &&
      (node as { value?: unknown }).value === false) ||
      ((node as { type?: string; value?: unknown }).type === "Literal" &&
        (node as { value?: unknown }).value === false))
  );
}

function isNullLiteral(node: ExpressionKind): boolean {
  return (
    !!node &&
    typeof node === "object" &&
    ((node as { type?: string }).type === "NullLiteral" ||
      ((node as { type?: string; value?: unknown }).type === "Literal" &&
        (node as { value?: unknown }).value === null))
  );
}

function readIdentifierLikeName(node: ExpressionKind): string | null {
  let current: ExpressionKind | undefined = node;
  while (current && typeof current === "object") {
    const typed = current as {
      type?: string;
      name?: string;
      expression?: ExpressionKind;
      expressions?: ExpressionKind[];
    };
    if (typed.type === "Identifier") {
      return typed.name ?? null;
    }
    if (
      typed.type === "ParenthesizedExpression" ||
      typed.type === "TSAsExpression" ||
      typed.type === "TSNonNullExpression"
    ) {
      current = typed.expression;
      continue;
    }
    if (typed.type === "TemplateLiteral" && typed.expressions?.length === 1) {
      current = typed.expressions[0];
      continue;
    }
    break;
  }
  return null;
}

function normalizePropName(name: string): string {
  return name.startsWith("$") ? name.slice(1) : name;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isArrowFunctionWithParams(node: unknown): node is {
  type: "ArrowFunctionExpression";
  params: unknown[];
} {
  return (
    !!node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "ArrowFunctionExpression" &&
    Array.isArray((node as { params?: unknown }).params)
  );
}

function readParamName(param: unknown): string | null {
  return param && typeof param === "object" && (param as { type?: string }).type === "Identifier"
    ? ((param as { name?: string }).name ?? null)
    : null;
}

function removeUndefinedFromParamType(j: StyleFnParamBuilderJ, param: unknown): void {
  const typedParam = param as { typeAnnotation?: { typeAnnotation?: unknown } };
  const typeAnnotation = typedParam.typeAnnotation?.typeAnnotation;
  if (!typeAnnotation || typeof typeAnnotation !== "object") {
    return;
  }
  const typeNode = typeAnnotation as { type?: string; types?: unknown[] };
  if (typeNode.type !== "TSUnionType" || !typeNode.types) {
    return;
  }
  const narrowedTypes = typeNode.types.filter(
    (member) =>
      !(
        member &&
        typeof member === "object" &&
        (member as { type?: string }).type === "TSUndefinedKeyword"
      ),
  );
  if (narrowedTypes.length === typeNode.types.length || narrowedTypes.length === 0) {
    return;
  }
  typedParam.typeAnnotation =
    narrowedTypes.length === 1
      ? j.tsTypeAnnotation(narrowedTypes[0] as StyleFnUnionMemberTypeNode)
      : j.tsTypeAnnotation(j.tsUnionType(narrowedTypes as StyleFnUnionMemberTypeNode[]));
}

function typeNodeFromPropTypeText(
  j: StyleFnParamBuilderJ,
  typeText: string | undefined,
): StyleFnParamTypeNode | null {
  const normalized = typeText?.replace(/\|\s*undefined\b/g, "").trim();
  if (normalized === "boolean") {
    return j.tsBooleanKeyword() as StyleFnParamTypeNode;
  }
  if (normalized === "number") {
    return j.tsNumberKeyword() as StyleFnParamTypeNode;
  }
  if (normalized === "string") {
    return j.tsStringKeyword() as StyleFnParamTypeNode;
  }
  return null;
}
