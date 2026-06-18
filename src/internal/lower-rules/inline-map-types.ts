/**
 * Shared types for the inline-map resolver and the conditional css`` helper
 * dispatcher. Split out of `css-helper-conditional.ts`.
 */
import type { ExpressionKind } from "./decl-types.js";

export type RuntimePseudoAlias = {
  pseudoNames: string[];
  pseudoKeys: string[];
  styleSelectorExpr: ExpressionKind;
};

export type ResolvedPseudoEntry = {
  pseudo: string;
  conditionExpr?: ExpressionKind;
  alias?: RuntimePseudoAlias;
};

export type InlineMapPseudoAliases = WeakMap<Map<string, ExpressionKind>, RuntimePseudoAlias[]>;

export type InlineMapPseudoRootDefaults = WeakMap<object, true>;
