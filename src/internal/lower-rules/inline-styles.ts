/**
 * Utilities for analyzing inline style arrow functions and templates.
 * Core concepts: prop extraction, conditional detection, and template assembly.
 */
import type { JSCodeshift } from "jscodeshift";
import {
  type ASTNodeRecord,
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import type { ExpressionKind } from "./decl-types.js";
import { findInAst, isMemberExpression, mapAst, walkAst } from "./utils.js";

// Build a template literal with static prefix/suffix around a dynamic expression.
// e.g., prefix="" suffix="ms" expr=<call> -> `${<call>}ms`
// If the expression is a static literal, returns a simple string literal instead.
// e.g., prefix="" suffix="px" expr=34 -> "34px" (not `${34}px`)
export function buildTemplateWithStaticParts(
  j: JSCodeshift,
  expr: ExpressionKind,
  prefix: string,
  suffix: string,
): ExpressionKind {
  if (!prefix && !suffix) {
    return expr;
  }
  // If the expression is a static literal, return a simple string literal
  const staticValue = literalToStaticValue(expr);
  if (staticValue !== null) {
    return j.stringLiteral(prefix + String(staticValue) + suffix);
  }
  return j.templateLiteral(
    [
      j.templateElement({ raw: prefix, cooked: prefix }, false),
      j.templateElement({ raw: suffix, cooked: suffix }, true),
    ],
    [expr],
  );
}

/**
 * Rewrites `props.theme.X` member access to `theme.X` in a cloned AST node.
 *
 * This is used when wrapper emission introduces `const theme = useTheme();`
 * and a preserved runtime expression should read from that variable.
 */
export function rewritePropsThemeToThemeVar(node: ExpressionKind): ExpressionKind {
  return mapAst(cloneAstNode(node), (rec, recurse) => {
    if (!isMemberExpression(rec)) {
      return undefined; // default traversal
    }
    const obj = rec.object as ASTNodeRecord | undefined;
    if (
      obj &&
      isMemberExpression(obj) &&
      (obj.object as { type?: string; name?: string })?.type === "Identifier" &&
      (obj.object as { name?: string })?.name === "props" &&
      (obj.property as { type?: string; name?: string })?.type === "Identifier" &&
      (obj.property as { name?: string })?.name === "theme" &&
      obj.computed === false
    ) {
      rec.object = { type: "Identifier", name: "theme" } as unknown as ASTNodeRecord;
      if (rec.computed) {
        rec.property = recurse(rec.property) as ASTNodeRecord;
      }
      return rec;
    }
    rec.object = recurse(rec.object) as ASTNodeRecord;
    if (rec.computed) {
      rec.property = recurse(rec.property) as ASTNodeRecord;
    }
    return rec;
  }) as ExpressionKind;
}

export function unwrapArrowFunctionToPropsExpr(
  j: JSCodeshift,
  expr: any,
): { expr: any; propsUsed: Set<string> } | null {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  if (expr.params?.length !== 1 || expr.params[0]?.type !== "Identifier") {
    return null;
  }
  const paramName = expr.params[0].name;
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return null;
  }

  const propsUsed = new Set<string>();
  let safeToInline = true;
  const replaced = mapAst(cloneAstNode(bodyExpr), (node) => {
    if (
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      node.computed === false
    ) {
      const propName = (node.property as { name: string }).name;
      if (!propName.startsWith("$")) {
        safeToInline = false;
        return node;
      }
      propsUsed.add(propName);
      return j.identifier(propName);
    }
    return undefined; // default traversal
  });
  if (!safeToInline || propsUsed.size === 0) {
    return null;
  }
  return { expr: replaced, propsUsed };
}

export function collectPropsFromArrowFn(expr: any): Set<string> {
  const props = new Set<string>();
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return props;
  }
  const paramName = expr.params?.[0]?.type === "Identifier" ? expr.params[0].name : null;
  if (!paramName) {
    return props;
  }
  walkAst(getFunctionBodyExpr(expr), (node) => {
    if (
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      node.computed === false
    ) {
      props.add((node.property as { name: string }).name);
    }
  });
  return props;
}

export function countConditionalExpressions(node: any): number {
  let count = 0;
  walkAst(node, (n) => {
    if (n.type === "ConditionalExpression") {
      count++;
    }
  });
  return count;
}

export function hasThemeAccessInArrowFn(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  if (expr.params?.length !== 1) {
    return false;
  }
  const param = expr.params[0];

  // Check for destructured `theme` in ObjectPattern: ({ enabled, theme }) => ...
  if (param?.type === "ObjectPattern" && Array.isArray(param.properties)) {
    for (const prop of param.properties) {
      if (
        prop &&
        (prop.type === "Property" || prop.type === "ObjectProperty") &&
        prop.key?.type === "Identifier" &&
        prop.key.name === "theme"
      ) {
        return true;
      }
    }
    return false;
  }

  if (param?.type !== "Identifier") {
    return false;
  }
  const paramName = param.name;
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  return findInAst(
    bodyExpr,
    (node) =>
      isMemberExpression(node) &&
      (node.object as any)?.type === "Identifier" &&
      (node.object as any)?.name === paramName &&
      (node.property as any)?.type === "Identifier" &&
      (node.property as any)?.name === "theme" &&
      node.computed === false,
  );
}

export function inlineArrowFunctionBody(j: JSCodeshift, expr: any): ExpressionKind | null {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return null;
  }
  if (expr.params?.length !== 1) {
    return null;
  }
  const param = expr.params[0];
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return null;
  }

  // Simple identifier param: (props) => ...
  if (param?.type === "Identifier") {
    const paramName = param.name;
    return mapAst(cloneAstNode(bodyExpr), (node) => {
      if (node.type === "Identifier" && node.name === paramName) {
        return j.identifier("props");
      }
      return undefined; // default traversal
    }) as ExpressionKind;
  }

  // Destructured param: ({ color, size: size_ }) => ...
  const bindings = getArrowFnParamBindings(expr);
  if (!bindings || bindings.kind !== "destructured") {
    return null;
  }

  // Replace destructured identifiers with props.propName
  // If there's a default value, wrap with nullish coalescing: props.propName ?? defaultValue
  return mapAst(cloneAstNode(bodyExpr), (node) => {
    if (node.type === "Identifier" && bindings.bindings.has(node.name as string)) {
      const propName = bindings.bindings.get(node.name as string)!;
      const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
      const defaultValue = bindings.defaults?.get(propName);
      if (defaultValue) {
        return j.logicalExpression("??", memberExpr, cloneAstNode(defaultValue) as ExpressionKind);
      }
      return memberExpr;
    }
    return undefined; // default traversal
  }) as ExpressionKind;
}

export function hasUnsupportedConditionalTest(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  return findInAst(
    bodyExpr,
    (node) =>
      node.type === "ConditionalExpression" &&
      ((node.test as Record<string, unknown>)?.type === "LogicalExpression" ||
        (node.test as Record<string, unknown>)?.type === "ConditionalExpression"),
  );
}

/**
 * Collects prop names from AST expressions by finding:
 * - Member expressions accessing `props.X` (non-computed)
 * - Identifiers starting with `$` (transient props)
 */
export function collectPropsFromExpressions(
  expressions: Iterable<unknown>,
  propsUsed: Set<string>,
): void {
  for (const expr of expressions) {
    walkAst(expr, (n) => {
      if (
        isMemberExpression(n) &&
        (n.object as ASTNodeRecord)?.type === "Identifier" &&
        (n.object as { name?: string })?.name === "props" &&
        (n.property as ASTNodeRecord)?.type === "Identifier" &&
        n.computed === false
      ) {
        propsUsed.add((n.property as { name: string }).name);
      }
      if (n.type === "Identifier") {
        const identName = n.name as string | undefined;
        if (identName?.startsWith("$")) {
          propsUsed.add(identName);
        }
      }
    });
  }
}

/**
 * Normalizes $-prefixed prop references to props.X format for StyleX style functions:
 * - `$foo` identifier -> `props.foo` (wrap in member expression)
 * - `props.$foo` -> `props.foo` (strip $ prefix)
 * - `props.foo` -> unchanged
 */
export function normalizeDollarProps(j: JSCodeshift, exprNode: ExpressionKind): ExpressionKind {
  return mapAst(cloneAstNode(exprNode), (n) => {
    // Handle props.$foo -> props.foo (strip $ from property name)
    if (
      isMemberExpression(n) &&
      (n.object as ASTNodeRecord)?.type === "Identifier" &&
      (n.object as { name?: string })?.name === "props" &&
      (n.property as ASTNodeRecord)?.type === "Identifier" &&
      n.computed === false
    ) {
      const propName = (n.property as { name: string }).name;
      if (propName.startsWith("$")) {
        return j.memberExpression(j.identifier("props"), j.identifier(propName.slice(1)));
      }
      // props.foo stays as props.foo - no change needed
      return n;
    }
    // Handle $foo identifier -> props.foo
    if (n.type === "Identifier") {
      const identName = n.name as string | undefined;
      if (identName?.startsWith("$")) {
        return j.memberExpression(j.identifier("props"), j.identifier(identName.slice(1)));
      }
    }
    return undefined; // default traversal
  }) as ExpressionKind;
}
