/**
 * Shared context type threaded through the interpolated-declaration handlers.
 * Extracted from rule-interpolated-declaration.ts so the per-concern handler
 * modules can import it without depending on the dispatcher file.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { ImportSpec } from "../../adapter.js";
import type { DeclProcessingState } from "./decl-setup.js";
import type { ExpressionKind } from "./decl-types.js";
import type { ResolveImportedValueOptions } from "./interpolations.js";

type CommentSource = { leading?: string; leadingLine?: string; trailingLine?: string } | null;

export type ResolvedImportedValue = {
  resolved: ExpressionKind;
  imports?: ImportSpec[];
  skipStaticWrap?: boolean;
};
export type ImportedValueResolution = ResolvedImportedValue | { bail: true } | null;
export type ResolveImportedValueExpr = (
  expr: any,
  options?: ResolveImportedValueOptions,
) => ImportedValueResolution;

export type InterpolatedDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  allRules: readonly CssRuleIR[];
  d: CssDeclarationIR;
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  hasAncestorAttributeScope: boolean;
  applyResolvedPropValue: (
    prop: string,
    value: unknown,
    commentSource: CommentSource,
    sourceCssProperty?: string,
  ) => void;
};
