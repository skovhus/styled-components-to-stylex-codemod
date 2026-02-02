import type { JSCodeshift } from "jscodeshift";
import {
  cloneAstNode,
  getArrowFnParamBindings,
  getFunctionBodyExpr,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";

type ExpressionKind = Parameters<JSCodeshift["expressionStatement"]>[0];

// Helper type for flexible AST node property access - jscodeshift types are complex
// and generic AST traversal requires flexibility (per CLAUDE.md guidelines)
type ASTNodeRecord = Record<string, unknown> & { type: string };

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
  const clone = cloneAstNode(bodyExpr);
  const replace = (node: any): any => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(replace);
    }
    if (
      (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
      node.object?.type === "Identifier" &&
      node.object.name === paramName &&
      node.property?.type === "Identifier" &&
      node.computed === false
    ) {
      const propName = node.property.name;
      if (!propName.startsWith("$")) {
        safeToInline = false;
        return node;
      }
      propsUsed.add(propName);
      return j.identifier(propName);
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        (node as any)[key] = replace(child);
      }
    }
    return node;
  };
  const replaced = replace(clone);
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
  const visit = (node: any): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    if (
      (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
      node.object?.type === "Identifier" &&
      node.object.name === paramName &&
      node.property?.type === "Identifier" &&
      node.computed === false
    ) {
      props.add(node.property.name);
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(getFunctionBodyExpr(expr));
  return props;
}

export function countConditionalExpressions(node: any): number {
  if (!node || typeof node !== "object") {
    return 0;
  }
  if (Array.isArray(node)) {
    return node.reduce((sum, child) => sum + countConditionalExpressions(child), 0);
  }
  let count = node.type === "ConditionalExpression" ? 1 : 0;
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "comments") {
      continue;
    }
    const child = node[key];
    if (child && typeof child === "object") {
      count += countConditionalExpressions(child);
    }
  }
  return count;
}

export function hasThemeAccessInArrowFn(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  if (expr.params?.length !== 1 || expr.params[0]?.type !== "Identifier") {
    return false;
  }
  const paramName = expr.params[0].name;
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  let found = false;
  const visit = (node: any): void => {
    if (!node || typeof node !== "object" || found) {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    if (
      (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") &&
      node.object?.type === "Identifier" &&
      node.object.name === paramName &&
      node.property?.type === "Identifier" &&
      node.property.name === "theme" &&
      node.computed === false
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(bodyExpr);
  return found;
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
    const replace = (node: any): any => {
      if (!node || typeof node !== "object") {
        return node;
      }
      if (Array.isArray(node)) {
        return node.map(replace);
      }
      if (node.type === "Identifier" && node.name === paramName) {
        return j.identifier("props");
      }
      if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
        node.object = replace(node.object);
        if (node.computed) {
          node.property = replace(node.property);
        }
        return node;
      }
      if (node.type === "Property") {
        if (node.computed) {
          node.key = replace(node.key);
        }
        node.value = replace(node.value);
        return node;
      }
      for (const key of Object.keys(node)) {
        if (key === "loc" || key === "comments") {
          continue;
        }
        const child = (node as any)[key];
        if (child && typeof child === "object") {
          (node as any)[key] = replace(child);
        }
      }
      return node;
    };
    const cloned = cloneAstNode(bodyExpr);
    return replace(cloned);
  }

  // Destructured param: ({ color, size: size_ }) => ...
  const bindings = getArrowFnParamBindings(expr);
  if (!bindings || bindings.kind !== "destructured") {
    return null;
  }

  // Replace destructured identifiers with props.propName
  const replace = (node: any): any => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(replace);
    }
    // If identifier matches a destructured binding, replace with props.propName
    // If there's a default value, wrap with nullish coalescing: props.propName ?? defaultValue
    if (node.type === "Identifier" && bindings.bindings.has(node.name)) {
      const propName = bindings.bindings.get(node.name)!;
      const memberExpr = j.memberExpression(j.identifier("props"), j.identifier(propName));
      const defaultValue = bindings.defaults?.get(propName);
      if (defaultValue) {
        return j.logicalExpression("??", memberExpr, cloneAstNode(defaultValue) as ExpressionKind);
      }
      return memberExpr;
    }
    if (node.type === "MemberExpression" || node.type === "OptionalMemberExpression") {
      node.object = replace(node.object);
      if (node.computed) {
        node.property = replace(node.property);
      }
      return node;
    }
    if (node.type === "Property") {
      if (node.computed) {
        node.key = replace(node.key);
      }
      node.value = replace(node.value);
      return node;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        (node as any)[key] = replace(child);
      }
    }
    return node;
  };
  const cloned = cloneAstNode(bodyExpr);
  return replace(cloned);
}

export function hasUnsupportedConditionalTest(expr: any): boolean {
  if (!expr || expr.type !== "ArrowFunctionExpression") {
    return false;
  }
  const bodyExpr = getFunctionBodyExpr(expr);
  if (!bodyExpr) {
    return false;
  }
  let found = false;
  const visit = (node: any): void => {
    if (!node || typeof node !== "object" || found) {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    if (
      node.type === "ConditionalExpression" &&
      (node.test?.type === "LogicalExpression" || node.test?.type === "ConditionalExpression")
    ) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(bodyExpr);
  return found;
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
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        visit(child);
      }
      return;
    }
    const n = node as ASTNodeRecord;
    if (
      (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
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
  for (const expr of expressions) {
    visit(expr);
  }
}

/**
 * Normalizes $-prefixed prop references to props.X format for StyleX style functions:
 * - `$foo` identifier -> `props.foo` (wrap in member expression)
 * - `props.$foo` -> `props.foo` (strip $ prefix)
 * - `props.foo` -> unchanged
 */
export function normalizeDollarProps(j: JSCodeshift, exprNode: ExpressionKind): ExpressionKind {
  const cloned = cloneAstNode(exprNode);
  const replace = (node: unknown): unknown => {
    if (!node || typeof node !== "object") {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map((child) => replace(child));
    }
    const n = node as ASTNodeRecord;
    // Handle props.$foo -> props.foo (strip $ from property name)
    if (
      (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") &&
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
    for (const key of Object.keys(n)) {
      if (key === "loc" || key === "comments") {
        continue;
      }
      const child = n[key];
      if (child && typeof child === "object") {
        n[key] = replace(child);
      }
    }
    return n;
  };
  return replace(cloned) as ExpressionKind;
}
