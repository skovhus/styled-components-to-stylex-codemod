/**
 * Collects runtime prop names referenced by resolved style objects and derives
 * conditional style-function keys / root-default detection. Split out of
 * `css-helper-conditional.ts`.
 */
import type { ExpressionKind, StyleFnFromPropsEntry } from "./decl-types.js";
import { type ASTNodeRecord } from "../utilities/jscodeshift-utils.js";
import { findInAst, isMemberExpression } from "./utils.js";
import { capitalize } from "../utilities/string-utils.js";
import { cssPropertyToIdentifier } from "./shared.js";
import {
  getStaticObjectPropertyKeyName,
  normalizeTransientPropName,
} from "./css-conditional-ast-utils.js";

export function collectRuntimeStylePropNames(
  style: Record<string, unknown>,
  importMap: Map<string, unknown>,
  stylexTokenIdentifiers: ReadonlySet<string>,
): Set<string> {
  const names = new Set<string>();
  for (const value of Object.values(style)) {
    collectRuntimePropNames(value, names, importMap, stylexTokenIdentifiers);
  }
  return names;
}

export function styleReferencesRuntimeTheme(style: Record<string, unknown>): boolean {
  return Object.values(style).some((value) =>
    findInAst(
      value,
      (node) =>
        isMemberExpression(node) &&
        (node.object as ASTNodeRecord | undefined)?.type === "Identifier" &&
        (node.object as { name?: string }).name === "props" &&
        (node.property as ASTNodeRecord | undefined)?.type === "Identifier" &&
        (node.property as { name?: string }).name === "theme" &&
        node.computed === false,
    ),
  );
}

export function collectStylePropNames(styles: Iterable<Record<string, unknown>>): Set<string> {
  const propNames = new Set<string>();
  for (const style of styles) {
    for (const propName of Object.keys(style)) {
      propNames.add(propName);
    }
  }
  return propNames;
}

export function hasRootStyleForProps(
  style: Record<string, unknown>,
  propNames: ReadonlySet<string>,
): boolean {
  for (const propName of propNames) {
    if (
      Object.prototype.hasOwnProperty.call(style, propName) &&
      styleValueIncludesRootDefault(style[propName])
    ) {
      return true;
    }
  }
  return false;
}

export function hasPriorRootStyleFnForProps(
  styleFnFromProps: StyleFnFromPropsEntry[],
  styleFnDecls: Map<string, unknown>,
  propNames: ReadonlySet<string>,
): boolean {
  for (const entry of styleFnFromProps) {
    const styleFn = styleFnDecls.get(entry.fnKey);
    if (
      styleFn &&
      typeof styleFn === "object" &&
      (styleFn as { type?: string }).type === "ArrowFunctionExpression"
    ) {
      const body = (styleFn as { body?: unknown }).body;
      if (objectExpressionHasRootStyleForProps(body, propNames)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * If the node is a `typeof x === "type"` expression (a TypeScript type guard),
 * returns the name of the narrowed identifier. Returns null otherwise.
 */
export function getTypeofGuardProp(node: ExpressionKind): string | null {
  if (node.type !== "BinaryExpression") {
    return null;
  }
  const { operator, left, right } = node as {
    operator: string;
    left: ExpressionKind;
    right: ExpressionKind;
  };
  if (operator !== "===" && operator !== "!==") {
    return null;
  }
  const extractTypeofArg = (n: ExpressionKind): string | null => {
    if (n.type !== "UnaryExpression" || (n as { operator: string }).operator !== "typeof") {
      return null;
    }
    const arg = (n as { argument: ExpressionKind }).argument;
    return arg?.type === "Identifier" ? (arg as { name: string }).name : null;
  };
  return extractTypeofArg(left) ?? extractTypeofArg(right);
}

/** Returns a unique key by appending a numeric suffix if the key already exists in any of the maps. */
export function ensureUniqueKey(maps: Map<string, unknown>[], key: string): string {
  const has = (k: string): boolean => maps.some((m) => m.has(k));
  if (!has(key)) {
    return key;
  }
  let i = 2;
  while (has(`${key}${i}`)) {
    i++;
  }
  return `${key}${i}`;
}

export function buildConditionalStyleFnKeys(
  styleKey: string,
  conditionName: string | null,
  consMap: Map<string, unknown>,
  altMap: Map<string, unknown>,
): { truthyKey: string; falsyKey: string } {
  if (conditionName) {
    return {
      truthyKey: `${styleKey}${conditionName}`,
      falsyKey: `${styleKey}Default`,
    };
  }

  const fallbackSuffix = buildFallbackPropSuffix(consMap, altMap);
  return {
    truthyKey: `${styleKey}With${fallbackSuffix}`,
    falsyKey: `${styleKey}Without${fallbackSuffix}`,
  };
}

function collectRuntimePropNames(
  value: unknown,
  names: Set<string>,
  importMap: Map<string, unknown>,
  stylexTokenIdentifiers: ReadonlySet<string>,
): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRuntimePropNames(item, names, importMap, stylexTokenIdentifiers);
    }
    return;
  }
  const node = value as ASTNodeRecord;
  if (node.type === "Identifier") {
    const name = (node as { name?: string }).name;
    if (name?.startsWith("$") && !importMap.has(name) && !stylexTokenIdentifiers.has(name)) {
      names.add(normalizeTransientPropName(name));
    }
    return;
  }
  if (isMemberExpression(node)) {
    const object = node.object as ASTNodeRecord | undefined;
    const property = node.property as ASTNodeRecord | undefined;
    if (
      object?.type === "Identifier" &&
      (object as { name?: string }).name === "props" &&
      property?.type === "Identifier" &&
      node.computed === false
    ) {
      const propName = (property as { name?: string }).name;
      if (propName && propName !== "theme") {
        names.add(normalizeTransientPropName(propName));
      }
      if (propName === "theme") {
        return;
      }
    }
    collectRuntimePropNames(node.object, names, importMap, stylexTokenIdentifiers);
    if (node.computed) {
      collectRuntimePropNames(node.property, names, importMap, stylexTokenIdentifiers);
    }
    return;
  }
  if (node.type === "Property") {
    if (node.computed) {
      collectRuntimePropNames(node.key, names, importMap, stylexTokenIdentifiers);
    }
    collectRuntimePropNames(node.value, names, importMap, stylexTokenIdentifiers);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === "loc" || key === "comments" || key === "type") {
      continue;
    }
    collectRuntimePropNames(child, names, importMap, stylexTokenIdentifiers);
  }
}

function objectExpressionHasRootStyleForProps(
  node: unknown,
  propNames: ReadonlySet<string>,
): boolean {
  if (
    !node ||
    typeof node !== "object" ||
    (node as { type?: string }).type !== "ObjectExpression"
  ) {
    return false;
  }
  const properties = (node as ASTNodeRecord).properties as ASTNodeRecord[] | undefined;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (keyName && propNames.has(keyName) && styleValueIncludesRootDefault(property.value)) {
      return true;
    }
  }
  return false;
}

function styleValueIncludesRootDefault(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return true;
  }
  if ((value as { type?: string }).type === "ObjectExpression") {
    const properties = (value as ASTNodeRecord).properties as ASTNodeRecord[] | undefined;
    for (const property of properties ?? []) {
      if (!property || property.type !== "Property") {
        continue;
      }
      const keyName = getStaticObjectPropertyKeyName(property);
      if (keyName && isRootStyleValueKey(keyName)) {
        return true;
      }
    }
    return false;
  }
  for (const keyName of Object.keys(value)) {
    if (isRootStyleValueKey(keyName)) {
      return true;
    }
  }
  return false;
}

function isRootStyleValueKey(keyName: string): boolean {
  return keyName === "default" || (!keyName.startsWith(":") && !keyName.startsWith("@"));
}

function buildFallbackPropSuffix(
  consMap: Map<string, unknown>,
  altMap: Map<string, unknown>,
): string {
  const propName =
    consMap.size > 0 ? Array.from(consMap.keys())[0] : (Array.from(altMap.keys())[0] ?? null);
  if (!propName) {
    return "Styles";
  }
  return capitalize(cssPropertyToIdentifier(propName));
}
