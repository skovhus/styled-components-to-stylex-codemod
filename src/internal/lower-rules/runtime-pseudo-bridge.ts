/**
 * Bridges runtime (theme/prop-dependent) color values declared inside pseudo
 * selector maps into CSS custom properties so StyleX can resolve them at runtime.
 * Split out of `css-helper-conditional.ts`.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./decl-types.js";
import { cloneAstNode, type ASTNodeRecord } from "../utilities/jscodeshift-utils.js";
import { findInAst, isMemberExpression } from "./utils.js";
import { camelToKebabCase } from "../utilities/string-utils.js";
import { getStaticObjectPropertyKeyName } from "./css-conditional-ast-utils.js";

export function bridgeRuntimePseudoColorValues(
  j: JSCodeshift,
  styleKey: string,
  stylexProp: string,
  expression: ExpressionKind,
): { expression: ExpressionKind; customProps: ReturnType<typeof j.property>[] } {
  if (!isColorLikeStylexProp(stylexProp) || expression.type !== "ObjectExpression") {
    return { expression, customProps: [] };
  }

  const customProps: ReturnType<typeof j.property>[] = [];
  for (const property of expression.properties ?? []) {
    if (!property || property.type !== "Property") {
      continue;
    }
    const keyName = getStaticObjectPropertyKeyName(property as unknown as ASTNodeRecord);
    if (!keyName?.startsWith(":")) {
      continue;
    }
    const value = property.value as ExpressionKind;
    if (!referencesRuntimeValue(value)) {
      continue;
    }

    const variableName = buildRuntimePseudoVariableName(styleKey, stylexProp, keyName);
    customProps.push(j.property("init", j.literal(variableName), cloneAstNode(value)));
    property.value = j.literal(`var(${variableName})`);
  }

  return { expression, customProps };
}

export function referencesRuntimeValue(
  value: ExpressionKind,
  stylexTokenIdentifiers: ReadonlySet<string> = new Set(),
): boolean {
  return findInAst(value, (node) => {
    if (node.type === "Identifier") {
      const name = (node as { name?: string }).name;
      if (name === "theme" || (name?.startsWith("$") && !stylexTokenIdentifiers.has(name))) {
        return true;
      }
    }
    return (
      isMemberExpression(node) &&
      (node.object as ASTNodeRecord | undefined)?.type === "Identifier" &&
      ((node.object as { name?: string }).name === "props" ||
        (node.object as { name?: string }).name === "theme") &&
      node.computed === false
    );
  });
}

function isColorLikeStylexProp(stylexProp: string): boolean {
  return (
    stylexProp === "color" ||
    stylexProp === "fill" ||
    stylexProp === "stroke" ||
    stylexProp.endsWith("Color")
  );
}

function buildRuntimePseudoVariableName(
  styleKey: string,
  stylexProp: string,
  pseudo: string,
): string {
  const pseudoSuffix =
    pseudo
      .replace(/^:+/, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "state";
  return `--${camelToKebabCase(styleKey)}-${camelToKebabCase(stylexProp)}-${pseudoSuffix}`;
}
