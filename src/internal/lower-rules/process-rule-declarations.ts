/**
 * Processes declarations within a single CSS rule.
 * Core concepts: dispatch interpolated declarations and apply static values.
 */
import type { CssRuleIR } from "../css-ir.js";
import type { DeclProcessingState } from "./decl-setup.js";
import { cssDeclarationToStylexDeclarations } from "../css-prop-mapping.js";
import { cssValueToJs } from "../transform/helpers.js";
import { expandStaticAnimationShorthand } from "../keyframes.js";
import { handleInterpolatedDeclaration } from "./rule-interpolated-declaration.js";

type CommentSource = { leading?: string; trailingLine?: string } | null;

type RuleDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  applyResolvedPropValue: (prop: string, value: unknown, commentSource: CommentSource) => void;
};

export function processRuleDeclarations(args: RuleDeclarationContext): void {
  const {
    ctx,
    rule,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    applyResolvedPropValue,
  } = args;
  const { state } = ctx;

  for (const d of rule.declarations) {
    if (d.value.kind === "interpolated") {
      handleInterpolatedDeclaration({
        ctx,
        rule,
        d,
        media,
        pseudos,
        pseudoElement,
        attrTarget,
        resolvedSelectorMedia,
        applyResolvedPropValue,
      });
      if (state.bail) {
        break;
      }
      continue;
    }

    // Handle static `animation` shorthand that references inline @keyframes.
    // Expand to longhand properties with an identifier reference for the name.
    if (d.property === "animation" && d.value.kind === "static" && state.keyframesNames.size > 0) {
      const expanded: Record<string, unknown> = {};
      if (expandStaticAnimationShorthand(d.valueRaw, state.keyframesNames, state.j, expanded)) {
        const commentSource = {
          leading: (d as any).leadingComment,
          trailingLine: (d as any).trailingLineComment,
        };
        let isFirst = true;
        for (const [prop, value] of Object.entries(expanded)) {
          applyResolvedPropValue(prop, value, isFirst ? commentSource : null);
          isFirst = false;
        }
        continue;
      }
    }

    const outs = cssDeclarationToStylexDeclarations(d);
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i]!;
      let value = cssValueToJs(out.value, d.important, out.prop);
      if (out.prop === "content" && typeof value === "string") {
        const m = value.match(/^['"]([\s\S]*)['"]$/);
        if (m) {
          value = `"${m[1]}"`;
        } else if (!value.startsWith('"') && !value.endsWith('"')) {
          value = `"${value}"`;
        }
      }
      const commentSource =
        i === 0
          ? {
              leading: (d as any).leadingComment,
              trailingLine: (d as any).trailingLineComment,
            }
          : null;
      applyResolvedPropValue(out.prop, value, commentSource);
    }
  }
}
