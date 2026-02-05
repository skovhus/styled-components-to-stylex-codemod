import type { JSCodeshift } from "jscodeshift";
import {
  cloneAstNode,
  getMemberPathFromIdentifier,
  literalToStaticValue,
} from "./jscodeshift-utils.js";

export type ThemeIsDarkContext = {
  propsParamName?: string | null;
  themeBindingName?: string | null;
};

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

export type ThemeIsDarkTestMatch = { isNegated: boolean };

export function matchThemeIsDarkTest(
  test: ExpressionKind,
  ctx: ThemeIsDarkContext,
): ThemeIsDarkTestMatch | null {
  const unwrapped = unwrapExpression(test);
  if (isThemeIsDarkMember(unwrapped, ctx)) {
    return { isNegated: false };
  }
  if (unwrapped.type === "UnaryExpression" && unwrapped.operator === "!") {
    const innerMatch = matchThemeIsDarkTest(unwrapped.argument as ExpressionKind, ctx);
    return innerMatch ? { isNegated: !innerMatch.isNegated } : null;
  }
  if (
    unwrapped.type === "BinaryExpression" &&
    (unwrapped.operator === "===" || unwrapped.operator === "!==")
  ) {
    const leftIsTheme = isThemeIsDarkMember(unwrapped.left as ExpressionKind, ctx);
    const rightIsTheme = isThemeIsDarkMember(unwrapped.right as ExpressionKind, ctx);
    if (leftIsTheme === rightIsTheme) {
      return null;
    }
    const literalSide = leftIsTheme ? unwrapped.right : unwrapped.left;
    const literalValue = literalToStaticValue(literalSide);
    if (typeof literalValue !== "boolean") {
      return null;
    }
    const isNegated = unwrapped.operator === "===" ? literalValue === false : literalValue === true;
    return { isNegated };
  }
  return null;
}

export function replaceThemeIsDarkConditionals(args: {
  expr: ExpressionKind;
  preferDark: boolean;
  propsParamName?: string | null;
  themeBindingName?: string | null;
}): { expr: ExpressionKind; replaced: boolean; hasNonThemeConditional: boolean } {
  const { expr, preferDark, propsParamName, themeBindingName } = args;
  const ctx: ThemeIsDarkContext = { propsParamName, themeBindingName };
  let replaced = false;
  let hasNonThemeConditional = false;

  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(visit);
    }
    const typed = node as { type?: string };
    if (typed.type === "ConditionalExpression") {
      const match = matchThemeIsDarkTest((node as any).test as ExpressionKind, ctx);
      if (match) {
        replaced = true;
        const useConsequent = preferDark ? !match.isNegated : match.isNegated;
        const chosen = useConsequent ? (node as any).consequent : (node as any).alternate;
        return visit(chosen);
      }
      hasNonThemeConditional = true;
    }
    for (const key of Object.keys(node as Record<string, unknown>)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as Record<string, unknown>)[key];
      if (child && typeof child === "object") {
        (node as Record<string, unknown>)[key] = visit(child) as any;
      }
    }
    return node;
  };

  const cloned = cloneAstNode(expr);
  const result = visit(cloned) as ExpressionKind;
  return { expr: result, replaced, hasNonThemeConditional };
}

const unwrapExpression = (node: ExpressionKind): ExpressionKind => {
  let current: ExpressionKind = node;
  while (current && typeof current === "object") {
    if (current.type === "ParenthesizedExpression") {
      current = current.expression as ExpressionKind;
      continue;
    }
    if (current.type === "TSAsExpression" || current.type === "TSNonNullExpression") {
      current = current.expression as ExpressionKind;
      continue;
    }
    if (current.type === "TSTypeAssertion") {
      current = current.expression as ExpressionKind;
      continue;
    }
    if (current.type === "ChainExpression") {
      current = current.expression as ExpressionKind;
      continue;
    }
    break;
  }
  return current;
};

const isThemeIsDarkMember = (node: ExpressionKind, ctx: ThemeIsDarkContext): boolean => {
  const unwrapped = unwrapExpression(node);
  if (unwrapped.type !== "MemberExpression" && unwrapped.type !== "OptionalMemberExpression") {
    return false;
  }
  const { propsParamName, themeBindingName } = ctx;
  if (propsParamName) {
    const path = getMemberPathFromIdentifier(unwrapped as any, propsParamName);
    if (path && path.length === 2 && path[0] === "theme" && path[1] === "isDark") {
      return true;
    }
  }
  if (themeBindingName) {
    const path = getMemberPathFromIdentifier(unwrapped as any, themeBindingName);
    if (path && path.length === 1 && path[0] === "isDark") {
      return true;
    }
  }
  return false;
};
