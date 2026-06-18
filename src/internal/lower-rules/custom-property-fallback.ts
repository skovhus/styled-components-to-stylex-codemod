/**
 * Helpers extracted from rule-interpolated-declaration.ts.
 * Keep behavior identical to the original inline definitions.
 */
import type { CssDeclarationIR } from "../css-ir.js";
import { findCssVarCallsInString } from "../css-vars.js";
import { stylexVarMemberExpression } from "../transform-css-vars.js";
import type { LocalStylexVarRef, StyledDecl } from "../transform-types.js";
import {
  getFunctionBodyExpr,
  getSinglePropFromMemberExpr,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { buildTemplateWithStaticParts } from "./inline-styles.js";
import { ensureShouldForwardPropDrop } from "./types.js";
import type { JSCodeshift } from "jscodeshift";

export function tryHandleLocalCustomPropertyDefinition(args: {
  j: JSCodeshift;
  d: CssDeclarationIR;
  decl: StyledDecl;
  expr: unknown;
  getOrCreateLocalStylexVar: (cssName: string, defaultValue: string) => LocalStylexVarRef;
  inlineStyleProps: Array<{ prop: string; expr: ExpressionKind; keyExpr?: ExpressionKind }>;
}): boolean {
  const { j, d, decl, expr, getOrCreateLocalStylexVar, inlineStyleProps } = args;
  if (!expr || typeof expr !== "object") {
    return false;
  }
  const arrow = expr as {
    type?: string;
    params?: unknown[];
    body?: unknown;
  };
  if (arrow.type !== "ArrowFunctionExpression" && arrow.type !== "FunctionExpression") {
    return false;
  }
  const paramName =
    arrow.params?.[0] && (arrow.params[0] as { type?: string; name?: string }).type === "Identifier"
      ? (arrow.params[0] as { name: string }).name
      : null;
  if (!paramName) {
    return false;
  }
  const body = getFunctionBodyExpr(arrow) as {
    type?: string;
    test?: unknown;
    consequent?: unknown;
    alternate?: unknown;
  } | null;
  if (body?.type !== "ConditionalExpression") {
    return false;
  }
  const conditionProp = getSinglePropFromMemberExpr(body.test, paramName);
  if (!conditionProp || !isEmptyCssExpression(body.alternate)) {
    return false;
  }
  const customValue = parseCustomPropertyTemplateValue(
    d.property ?? null,
    body.consequent,
    paramName,
  );
  if (!customValue) {
    return false;
  }
  const defaultValue = findLocalCustomPropertyFallback(customValue.cssName, decl);
  if (!defaultValue) {
    return false;
  }
  const localVar = getOrCreateLocalStylexVar(customValue.cssName, defaultValue);
  const propName = conditionProp.startsWith("$") ? conditionProp.slice(1) : conditionProp;
  const valueExpr = buildTemplateWithStaticParts(
    j,
    j.identifier(propName),
    customValue.prefix,
    customValue.suffix,
  );
  inlineStyleProps.push({
    prop: customValue.cssName,
    expr: j.conditionalExpression(j.identifier(propName), valueExpr, j.identifier("undefined")),
    keyExpr: stylexVarMemberExpression(j, localVar),
  });
  if (conditionProp.startsWith("$")) {
    ensureShouldForwardPropDrop(decl, conditionProp);
  }
  decl.needsWrapperComponent = true;
  return true;
}

function findLocalCustomPropertyFallback(cssName: string, decl: StyledDecl): string | null {
  for (const rule of decl.rules) {
    for (const candidate of rule.declarations) {
      if (candidate.property !== cssName || candidate.value.kind !== "static") {
        continue;
      }
      const staticValue = String(candidate.value.value);
      if (staticValue) {
        return staticValue;
      }
    }
  }
  for (const rule of decl.rules) {
    for (const candidate of rule.declarations) {
      const value = candidate.value.kind === "static" ? String(candidate.value.value) : null;
      if (value === null) {
        continue;
      }
      for (const call of findCssVarCallsInString(value)) {
        if (call.name === cssName && call.fallback) {
          return call.fallback;
        }
      }
    }
  }
  return null;
}

function parseCustomPropertyTemplateValue(
  expectedCssName: string | null,
  node: unknown,
  paramName: string,
): { cssName: string; prefix: string; suffix: string } | null {
  const tpl = node as {
    type?: string;
    quasis?: Array<{ value?: { cooked?: string; raw?: string } }>;
    expressions?: unknown[];
  };
  if (tpl.type !== "TemplateLiteral" || !tpl.quasis || !tpl.expressions) {
    return null;
  }

  if (tpl.quasis.length !== 2 || tpl.expressions.length !== 1) {
    return null;
  }
  if (!getSinglePropFromMemberExpr(tpl.expressions[0], paramName)) {
    return null;
  }
  const prefixText = tpl.quasis[0]?.value?.cooked ?? tpl.quasis[0]?.value?.raw ?? "";
  const suffixWithTerminator = tpl.quasis[1]?.value?.cooked ?? tpl.quasis[1]?.value?.raw ?? "";
  const declarationMatch = prefixText.trimStart().match(/^(--[-_a-zA-Z0-9]+)\s*:/);
  const cssName = declarationMatch?.[1] ?? null;
  if (!cssName || (expectedCssName && cssName !== expectedCssName)) {
    return null;
  }
  const declarationPrefix = `${cssName}:`;
  return {
    cssName,
    prefix: prefixText
      .slice(prefixText.indexOf(declarationPrefix) + declarationPrefix.length)
      .trimStart(),
    suffix: suffixWithTerminator.replace(/;\s*$/, ""),
  };
}

function isEmptyCssExpression(node: unknown): boolean {
  if (!node || typeof node !== "object") {
    return node == null || node === false;
  }
  const typed = node as { type?: string; value?: unknown };
  if (typed.type === "StringLiteral" || typed.type === "Literal") {
    return typed.value === "";
  }
  if (typed.type === "NullLiteral") {
    return true;
  }
  if (typed.type === "BooleanLiteral") {
    return typed.value === false;
  }
  return false;
}
