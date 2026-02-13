/**
 * Shared helpers for lower-rules transformations.
 * Core concepts: safe AST keys for CSS props, concise style object properties,
 * and relation override bucket management.
 */
import type { JSCodeshift } from "jscodeshift";
import type { ExpressionKind } from "./decl-types.js";
import type { RelationOverride } from "./state.js";

/**
 * Creates an AST key node for a CSS property name.
 * For CSS variables (e.g., --component-width), returns a string literal.
 * For regular property names (e.g., backgroundColor), returns an identifier.
 */
export function makeCssPropKey(j: JSCodeshift, prop: string): ExpressionKind {
  // CSS variables and other non-identifier keys need to be string literals
  if (!prop.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
    return j.literal(prop);
  }
  return j.identifier(prop);
}

/**
 * Converts a CSS property name to a valid JavaScript identifier.
 * For CSS variables (e.g., --component-width), converts to camelCase (componentWidth).
 * For regular property names (e.g., backgroundColor), returns as-is.
 */
export function cssPropertyToIdentifier(prop: string): string {
  // CSS variables: --component-width -> componentWidth
  if (prop.startsWith("--")) {
    const withoutDashes = prop.slice(2);
    // Convert kebab-case to camelCase
    return withoutDashes.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
  return prop;
}

/**
 * Get or create a pseudo bucket for a relation override style key.
 * Registers the override in `relationOverrides` if not already present.
 */
export function getOrCreateRelationOverrideBucket(
  overrideStyleKey: string,
  parentStyleKey: string,
  childStyleKey: string,
  ancestorPseudo: string | null,
  relationOverrides: RelationOverride[],
  relationOverridePseudoBuckets: Map<string, Map<string | null, Record<string, unknown>>>,
  childExtraStyleKeys?: string[],
): Record<string, unknown> {
  if (!relationOverridePseudoBuckets.has(overrideStyleKey)) {
    relationOverrides.push({
      parentStyleKey,
      childStyleKey,
      overrideStyleKey,
      childExtraStyleKeys,
    });
  }
  let pseudoBuckets = relationOverridePseudoBuckets.get(overrideStyleKey);
  if (!pseudoBuckets) {
    pseudoBuckets = new Map();
    relationOverridePseudoBuckets.set(overrideStyleKey, pseudoBuckets);
  }
  let bucket = pseudoBuckets.get(ancestorPseudo);
  if (!bucket) {
    bucket = {};
    pseudoBuckets.set(ancestorPseudo, bucket);
  }
  return bucket;
}

/**
 * Creates an object property for a CSS property with shorthand support.
 * Uses shorthand ({ color }) for regular properties when key matches value,
 * but never for CSS variables (which need string literal keys).
 */
export function makeCssProperty(
  j: JSCodeshift,
  cssProp: string,
  valueIdentifierName: string,
): ReturnType<typeof j.property> {
  const key = makeCssPropKey(j, cssProp);
  const p = j.property("init", key, j.identifier(valueIdentifierName)) as ReturnType<
    typeof j.property
  > & { shorthand?: boolean };
  // Use shorthand only when key is an identifier (not a string literal) and names match
  if (key.type === "Identifier" && key.name === valueIdentifierName) {
    p.shorthand = true;
  }
  return p;
}
