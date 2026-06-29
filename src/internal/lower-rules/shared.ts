/**
 * Shared helpers for lower-rules transformations.
 * Core concepts: safe AST keys for CSS props, concise style object properties,
 * and relation override bucket management.
 */
import type { JSCodeshift } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { PLACEHOLDER_RE } from "../styled-css.js";
import { isTemplatePlaceholderInSelectorContext } from "../utilities/selector-context-heuristic.js";
import type { ExpressionKind } from "./decl-types.js";
import type { LowerRulesState, RelationOverride } from "./state.js";

const PLACEHOLDER_RE_G = new RegExp(PLACEHOLDER_RE.source, "g");

/**
 * Collects the local names of components interpolated as *selectors* in a decl's
 * template (e.g. `${Card}:hover &`, `${Badge} { ... }`), filtering out
 * interpolations used as values. Shared by the rule-processing and post-lowering
 * preservation passes so both detect the same selector references.
 */
export function collectTemplateSelectorIdentifiers(decl: StyledDecl): Set<string> {
  const identifiers = new Set<string>();
  if (!decl.rawCss) {
    return identifiers;
  }
  for (const match of decl.rawCss.matchAll(PLACEHOLDER_RE_G)) {
    const slotId = Number(match[1]);
    const expr = decl.templateExpressions[slotId] as { type?: string; name?: string } | undefined;
    if (
      expr?.type === "Identifier" &&
      expr.name &&
      isTemplatePlaceholderInSelectorContext(decl.rawCss, match.index, match[0].length)
    ) {
      identifiers.add(expr.name);
    }
  }
  return identifiers;
}

/**
 * True when a decl's template interpolates an imported component as a selector.
 * A reveal child preserved as raw styled-components would strand that cross-file
 * selector if its target converted to StyleX in its own file (the consumer
 * bridge patcher skips files that otherwise transform), so callers bail.
 */
export function declReferencesCrossFileSelector(state: LowerRulesState, decl: StyledDecl): boolean {
  if (state.crossFileSelectorsByLocal.size === 0) {
    return false;
  }
  for (const ref of collectTemplateSelectorIdentifiers(decl)) {
    if (state.crossFileSelectorsByLocal.has(ref)) {
      return true;
    }
  }
  return false;
}

export function findPlaceholderBlock(
  rawCss: string,
  placeholder: string,
): { start: number; end: number } | null {
  let searchFrom = 0;
  while (true) {
    const start = rawCss.indexOf(placeholder, searchFrom);
    if (start < 0) {
      return null;
    }
    const blockOpen = readNextNonWhitespace(rawCss, start + placeholder.length);
    if (blockOpen?.value !== "{") {
      searchFrom = start + placeholder.length;
      continue;
    }
    return { start, end: blockOpen.index };
  }
}

export function findPreviousOpeningBraceBeforeSelector(
  rawCss: string,
  position: number,
): number | null {
  let depth = 0;
  for (let i = position - 1; i >= 0; i--) {
    const ch = rawCss[i];
    if (ch === ";") {
      continue;
    }
    if (ch === "}") {
      depth++;
      continue;
    }
    if (ch === "{") {
      if (depth > 0) {
        depth--;
        continue;
      }
      return i;
    }
  }
  return null;
}

export function readSelectorBeforeBlock(rawCss: string, blockStart: number): string {
  let selectorStart = blockStart - 1;
  while (selectorStart >= 0) {
    const ch = rawCss[selectorStart];
    if (ch === "}" || ch === "{" || ch === ";") {
      break;
    }
    selectorStart--;
  }
  return rawCss.slice(selectorStart + 1, blockStart).trim();
}

export function readPrefixSinceLastBlockBoundary(rawCss: string, position: number): string {
  let start = position - 1;
  while (start >= 0) {
    const ch = rawCss[start];
    if (ch === "{" || ch === "}") {
      break;
    }
    start--;
  }
  return rawCss.slice(start + 1, position);
}

export function parseSimpleParentPseudoSelectorList(selectorText: string): string[] | null {
  const parts = selectorText
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const pseudos: string[] = [];
  for (const part of parts) {
    const match = part.match(/^&(:[a-z-]+(?:\([^)]*\))?)$/i);
    if (!match?.[1]) {
      return null;
    }
    pseudos.push(match[1]);
  }
  return pseudos;
}

/**
 * Builds a `stylex.when.ancestor(pseudo, marker?)` AST call expression.
 */
export function makeAncestorKeyExpr(
  j: JSCodeshift,
  pseudo: string,
  markerVarName?: string,
): ExpressionKind {
  const callArgs: ExpressionKind[] = [j.literal(pseudo)];
  if (markerVarName) {
    callArgs.push(j.identifier(markerVarName));
  }
  return j.callExpression(
    j.memberExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("when")),
      j.identifier("ancestor"),
    ),
    callArgs,
  );
}

/**
 * Builds a `stylex.when.descendant(":is(*)", marker)` AST call expression.
 * Used for `&:has(${Component})` selectors where styles apply to self
 * when a descendant matching the marker is present.
 * Uses `:is(*)` as a required pseudo argument (StyleX API mandates a pseudo string).
 */
export function makeDescendantKeyExpr(j: JSCodeshift, markerVarName: string): ExpressionKind {
  return j.callExpression(
    j.memberExpression(
      j.memberExpression(j.identifier("stylex"), j.identifier("when")),
      j.identifier("descendant"),
    ),
    [j.literal(":is(*)"), j.identifier(markerVarName)],
  );
}

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
 *
 * When `avoidNames` is provided, appends "Value" to the result if it would
 * conflict with an existing binding (e.g., a top-level import). This prevents
 * `no-shadow` lint errors when the generated identifier becomes a function
 * parameter name.
 */
export function cssPropertyToIdentifier(prop: string, avoidNames?: Set<string>): string {
  let name: string;
  // CSS variables: --component-width -> componentWidth
  if (prop.startsWith("--")) {
    const withoutDashes = prop.slice(2);
    // Convert kebab-case to camelCase
    name = withoutDashes.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  } else {
    name = prop;
  }
  if (avoidNames?.has(name)) {
    return `${name}Value`;
  }
  return name;
}

/**
 * Tag every relation override registered under `overrideStyleKey` with the
 * immutable local names of the decls it relates. Post-lowering preservation and
 * pruning resolve decls by these names because a decl's style key can be
 * rewritten after the override is registered (e.g. enum/string-mapping variants
 * rewrite `decl.styleKey` to a derived base key). Call at every override-creation
 * site so the tags don't depend on which path created the override.
 */
export function tagRelationOverrideLocals(
  relationOverrides: RelationOverride[],
  overrideStyleKey: string,
  parentLocalName: string | undefined,
  childLocalName: string | undefined,
): void {
  for (const o of relationOverrides) {
    if (o.overrideStyleKey !== overrideStyleKey) {
      continue;
    }
    if (parentLocalName) {
      o.parentLocalName = parentLocalName;
    }
    if (childLocalName) {
      o.childLocalName = childLocalName;
    }
  }
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
  } else if (childExtraStyleKeys?.length) {
    // Update an existing override entry with child extras that weren't available
    // on the first call (e.g., forward path created the entry, reverse path adds extras).
    const existing = relationOverrides.find((o) => o.overrideStyleKey === overrideStyleKey);
    if (existing && !existing.childExtraStyleKeys?.length) {
      existing.childExtraStyleKeys = childExtraStyleKeys;
    }
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

function readNextNonWhitespace(
  rawCss: string,
  position: number,
): { index: number; value: string } | null {
  for (let i = position; i < rawCss.length; i++) {
    const ch = rawCss[i]!;
    if (!/\s/.test(ch)) {
      return { index: i, value: ch };
    }
  }
  return null;
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
