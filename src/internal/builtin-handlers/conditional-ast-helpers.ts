/**
 * Small AST predicates and parsers shared by the conditional handlers:
 * destructuring checks, curried-helper context detection, ternary template
 * parsing, and `when` condition construction for destructured props.
 */
import {
  type ArrowFnParamBindings,
  getMemberPathFromIdentifier,
  literalToStaticValue,
  literalToString,
} from "../utilities/jscodeshift-utils.js";
import type { ConditionalExpressionBody } from "./types.js";

/**
 * Check whether a given identifier name is actually destructured from the
 * arrow function's ObjectPattern parameter.  This prevents treating closure
 * variables (captured from outer scope) as component props.
 *
 * Example: `({ enabled, theme }) => enabled ? …` → `enabled` IS destructured.
 * Example: `({ theme }) => closureVar ? …` → `closureVar` is NOT destructured.
 */
export function isDestructuredFromParam(arrowFn: unknown, name: string): boolean {
  const fn = arrowFn as { params?: Array<{ type?: string; properties?: unknown[] }> };
  const param = fn.params?.[0];
  if (!param || param.type !== "ObjectPattern" || !Array.isArray(param.properties)) {
    return false;
  }
  return param.properties.some((prop) => {
    const p = prop as { type?: string; key?: { type?: string; name?: string } };
    if (p.type !== "Property" && p.type !== "ObjectProperty") {
      return false;
    }
    return p.key?.type === "Identifier" && p.key.name === name;
  });
}

export function isCurrentCurriedHelperContextArg(
  arg: unknown,
  propsParamName: string | undefined,
  themeBindingName: string | undefined,
): boolean {
  if (!arg || typeof arg !== "object") {
    return false;
  }
  const node = arg as {
    type?: string;
    name?: string;
    properties?: unknown[];
  };
  if (node.type === "Identifier") {
    return node.name === propsParamName || node.name === themeBindingName;
  }
  if (node.type !== "ObjectExpression" || node.properties?.length !== 1) {
    return false;
  }
  const property = node.properties[0] as {
    type?: string;
    computed?: boolean;
    key?: { type?: string; name?: string };
    value?: unknown;
  };
  if (
    (property.type !== "Property" && property.type !== "ObjectProperty") ||
    property.computed ||
    property.key?.type !== "Identifier" ||
    property.key.name !== "theme"
  ) {
    return false;
  }
  const value = property.value as { type?: string; name?: string } | null | undefined;
  if (value?.type === "Identifier" && value.name === themeBindingName) {
    return true;
  }
  if (propsParamName) {
    const valuePath = getMemberPathFromIdentifier(
      property.value as Parameters<typeof getMemberPathFromIdentifier>[0],
      propsParamName,
    );
    return valuePath?.length === 1 && valuePath[0] === "theme";
  }
  return false;
}

/**
 * Parses a template literal that contains a simple prop-based ternary expression.
 * Supports patterns like: `background: ${props.$primary ? "red" : "blue"}`
 *
 * Returns the static parts (prefix/suffix), the inner conditional's test node,
 * and the truthy/falsy values, or null if not a supported pattern.
 */
export function parseCssTemplateLiteralWithTernary(node: unknown): {
  prefix: string;
  suffix: string;
  innerTest: unknown;
  truthyValue: string;
  falsyValue: string;
} | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const n = node as {
    type?: string;
    expressions?: unknown[];
    quasis?: Array<{ value?: { raw?: string; cooked?: string } }>;
  };

  // Must be a TemplateLiteral with exactly 1 expression
  if (n.type !== "TemplateLiteral") {
    return null;
  }
  if (!n.expressions || n.expressions.length !== 1) {
    return null;
  }
  if (!n.quasis || n.quasis.length !== 2) {
    return null;
  }

  // Extract the static parts (quasis)
  const prefix = n.quasis[0]?.value?.cooked ?? n.quasis[0]?.value?.raw ?? "";
  const suffix = n.quasis[1]?.value?.cooked ?? n.quasis[1]?.value?.raw ?? "";

  // The expression must be a ConditionalExpression
  const expr = n.expressions[0] as ConditionalExpressionBody;
  if (!expr || expr.type !== "ConditionalExpression") {
    return null;
  }

  // Extract truthy and falsy values - they must be string literals
  const truthyValue = literalToString(expr.consequent);
  const falsyValue = literalToString(expr.alternate);
  if (truthyValue === null || falsyValue === null) {
    return null;
  }

  return { prefix, suffix, innerTest: expr.test, truthyValue, falsyValue };
}

/**
 * Builds truthy/falsy `when` condition strings for a destructured boolean-ish prop,
 * accounting for destructuring defaults. A default applies only when the prop is
 * `undefined`, so a statically-truthy default means the truthy branch must also
 * apply when the prop is unset (`prop === undefined || prop`).
 *
 * Returns null when the prop has a default whose truthiness cannot be determined
 * statically — callers should fall back to other handlers instead of emitting a
 * condition that ignores the default.
 */
export function destructuredBooleanWhens(
  propName: string,
  bindings: ArrowFnParamBindings | null,
): { truthy: string; falsy: string } | null {
  if (bindings?.kind !== "destructured" || !bindings.defaults?.has(propName)) {
    return { truthy: propName, falsy: `!${propName}` };
  }
  const defaultValue = literalToStaticValue(bindings.defaults.get(propName));
  if (defaultValue === null) {
    return null;
  }
  if (defaultValue) {
    const truthy = `${propName} === undefined || ${propName}`;
    return { truthy, falsy: `!(${truthy})` };
  }
  return { truthy: propName, falsy: `!${propName}` };
}
