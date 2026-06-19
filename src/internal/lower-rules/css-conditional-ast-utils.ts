/**
 * Shared low-level AST helpers for conditional css`` helper resolution.
 * These primitives are used across the theme-condition, pseudo-alias, and
 * runtime-prop-name modules that were split out of `css-helper-conditional.ts`.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./decl-types.js";
import {
  cloneAstNode,
  staticValueToLiteral,
  type ASTNodeRecord,
} from "../utilities/jscodeshift-utils.js";
import { normalizeDollarProps, rewritePropsThemeToThemeVar } from "./inline-styles.js";
import { literalToStaticValue } from "./types.js";

export function getStaticObjectPropertyKeyName(property: ASTNodeRecord): string | null {
  const key = property.key as ASTNodeRecord | undefined;
  if (!key) {
    return null;
  }
  if (key.type === "Identifier") {
    return (key as { name?: string }).name ?? null;
  }
  if (key.type === "Literal" || key.type === "StringLiteral") {
    const value = (key as { value?: unknown }).value;
    return typeof value === "string" ? value : null;
  }
  return null;
}

export function staticValueFromExpression(
  node: unknown,
): string | number | boolean | null | undefined {
  if (
    node &&
    typeof node === "object" &&
    (node as { type?: string }).type === "Literal" &&
    (node as { value?: unknown }).value === null
  ) {
    return null;
  }
  const value = literalToStaticValue(node);
  return value === null ? undefined : value;
}

export function copyObjectExpressionPropertiesToRootValue(
  rootValue: Record<string, unknown>,
  objectExpression: ASTNodeRecord,
): void {
  const properties = objectExpression.properties as ASTNodeRecord[] | undefined;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (!keyName) {
      continue;
    }
    rootValue[keyName] = staticValueFromExpression(property.value) ?? cloneAstNode(property.value);
  }
}

export function styleValueToExpression(j: any, value: unknown): ExpressionKind {
  if (value === null) {
    return j.literal(null) as ExpressionKind;
  }
  if (value !== null && typeof value === "object" && "type" in value) {
    return cloneAstNode(value) as ExpressionKind;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return j.objectExpression(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) =>
        j.property(
          "init",
          /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? j.identifier(key) : j.literal(key),
          styleValueToExpression(j, nestedValue),
        ),
      ),
    ) as ExpressionKind;
  }
  return staticValueToLiteral(j, value as string | number | boolean) as ExpressionKind;
}

export function toRuntimeStyleExpression(
  j: JSCodeshift,
  value: unknown,
  stylexTokenIdentifiers: ReadonlySet<string>,
): ExpressionKind {
  const expr = styleValueToExpression(j, value);
  return rewritePropsThemeToThemeVar(
    normalizeDollarProps(j, expr, { skipIdentifiers: stylexTokenIdentifiers }),
  );
}

export function normalizeTransientPropName(propName: string): string {
  return propName.startsWith("$") ? propName.slice(1) : propName;
}

export function normalizeTransientWhen(when: string): string {
  return when.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, "$1");
}
