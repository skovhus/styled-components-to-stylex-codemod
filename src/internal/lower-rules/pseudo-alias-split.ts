/**
 * Splits style objects that mix root styles with pseudo-alias selector entries
 * into a root style plus per-pseudo-alias style maps. Split out of
 * `css-helper-conditional.ts`.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./decl-types.js";
import { cloneAstNode, type ASTNodeRecord } from "../utilities/jscodeshift-utils.js";
import {
  copyObjectExpressionPropertiesToRootValue,
  getStaticObjectPropertyKeyName,
  staticValueFromExpression,
} from "./css-conditional-ast-utils.js";

export function splitStaticPseudoAliasStyle(
  j: JSCodeshift,
  style: Record<string, unknown>,
  pseudoNames: string[],
  pseudoKeys: string[],
  rootDefaultObjects: WeakMap<object, true>,
  shouldPreserveAliasDefault: (propName: string) => boolean,
): {
  rootStyle: Record<string, unknown>;
  pseudoAliasStyles: Map<string, Record<string, unknown>> | null;
} {
  const rootStyle: Record<string, unknown> = {};
  const pseudoAliasStyles = new Map<string, Record<string, unknown>>();
  for (const pseudoName of pseudoNames) {
    pseudoAliasStyles.set(pseudoName, {});
  }

  let hasAliasStyle = false;
  for (const [prop, value] of Object.entries(style)) {
    const split = splitPseudoObjectByAliasName(
      j,
      value,
      pseudoNames,
      pseudoKeys,
      rootDefaultObjects,
      shouldPreserveAliasDefault(prop),
    );
    if (!split) {
      rootStyle[prop] = value;
      continue;
    }
    hasAliasStyle = true;
    if (split.rootValue) {
      rootStyle[prop] = split.rootValue;
    }
    for (const [pseudoName, pseudoValue] of split.byPseudoName) {
      const styleForPseudo = pseudoAliasStyles.get(pseudoName);
      if (styleForPseudo) {
        styleForPseudo[prop] = pseudoValue;
      }
    }
  }

  return {
    rootStyle,
    pseudoAliasStyles: hasAliasStyle ? pseudoAliasStyles : null,
  };
}

function splitPseudoObjectByAliasName(
  j: JSCodeshift,
  value: unknown,
  pseudoNames: string[],
  pseudoKeys: string[],
  rootDefaultObjects: WeakMap<object, true>,
  preserveAliasDefault: boolean,
): {
  byPseudoName: Map<string, ExpressionKind>;
  rootValue?: Record<string, unknown>;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const node = value as ASTNodeRecord;
  if (node.type !== "ObjectExpression") {
    return null;
  }

  const properties = node.properties as ASTNodeRecord[] | undefined;
  const byKey = new Map<string, ExpressionKind>();
  const pseudoKeySet = new Set(pseudoKeys);
  const rootValue: Record<string, unknown> = {};
  let aliasDefaultValue: ExpressionKind | null = null;
  for (const property of properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property);
    if (keyName) {
      byKey.set(keyName, property.value as ExpressionKind);
      if (preserveAliasDefault && keyName === "default" && !rootDefaultObjects.has(node)) {
        const staticDefault = staticValueFromExpression(property.value);
        if (staticDefault !== null && staticDefault !== undefined) {
          aliasDefaultValue = property.value as ExpressionKind;
        }
      }
      if (!pseudoKeySet.has(keyName) && (keyName !== "default" || rootDefaultObjects.has(node))) {
        if (
          keyName === "default" &&
          (property.value as ASTNodeRecord | undefined)?.type === "ObjectExpression"
        ) {
          copyObjectExpressionPropertiesToRootValue(rootValue, property.value as ASTNodeRecord);
        } else {
          rootValue[keyName] =
            staticValueFromExpression(property.value) ?? cloneAstNode(property.value);
        }
      }
    }
  }

  const byPseudoName = new Map<string, ExpressionKind>();
  for (let index = 0; index < pseudoNames.length; index++) {
    const pseudoName = pseudoNames[index]!;
    const pseudoKey = pseudoKeys[index] ?? `:${pseudoName}`;
    const pseudoValue = byKey.get(pseudoKey);
    if (!pseudoValue) {
      return null;
    }
    byPseudoName.set(
      pseudoName,
      j.objectExpression([
        ...(aliasDefaultValue
          ? [
              j.property(
                "init",
                j.identifier("default"),
                cloneAstNode(aliasDefaultValue) as ExpressionKind,
              ),
            ]
          : []),
        j.property("init", j.literal(pseudoKey), cloneAstNode(pseudoValue) as ExpressionKind),
      ]) as ExpressionKind,
    );
  }
  return {
    byPseudoName,
    ...(Object.keys(rootValue).length > 0 ? { rootValue } : {}),
  };
}
