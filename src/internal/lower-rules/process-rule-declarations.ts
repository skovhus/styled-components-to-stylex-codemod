/**
 * Processes declarations within a single CSS rule.
 * Core concepts: dispatch interpolated declarations and apply static values.
 */
import type { CssRuleIR } from "../css-ir.js";
import type { DeclProcessingState } from "./decl-setup.js";
import {
  cssDeclarationToStylexDeclarations,
  expandBackgroundShorthandComponents,
  isLogicalScrollAxisShorthand,
  isUnsupportedStylexProperty,
  isUnsupportedBackgroundShorthandValue,
} from "../css-prop-mapping.js";
import { cssValueToJs, normalizeCssContentValue } from "../transform/helpers.js";
import { cssKeyframeNameToIdentifier, expandStaticAnimationShorthand } from "../keyframes.js";
import { handleInterpolatedDeclaration } from "./rule-interpolated-declaration.js";
import { resolveExpressionToStaticString } from "./resolve-imported-static-string.js";
import { PLACEHOLDER_RE } from "../styled-css.js";

type CommentSource = { leading?: string; leadingLine?: string; trailingLine?: string } | null;

type RuleDeclarationContext = {
  ctx: DeclProcessingState;
  rule: CssRuleIR;
  allRules: readonly CssRuleIR[];
  media: string | undefined;
  pseudos: string[] | null;
  pseudoElement: string | null;
  attrTarget: Record<string, unknown> | null;
  resolvedSelectorMedia: { keyExpr: unknown; exprSource: string } | null;
  applyResolvedPropValue: (
    prop: string,
    value: unknown,
    commentSource: CommentSource,
    sourceCssProperty?: string,
  ) => void;
};

export function processRuleDeclarations(args: RuleDeclarationContext): void {
  const {
    ctx,
    rule,
    allRules,
    media,
    pseudos,
    pseudoElement,
    attrTarget,
    resolvedSelectorMedia,
    applyResolvedPropValue,
  } = args;
  const { state } = ctx;

  for (const d of rule.declarations) {
    ctx.setCurrentDeclarationSourceOrder(d.sourceOrder);
    // Dynamic property names (slot placeholders in property position) such as
    // `${CSS_VAR}: 100%;`. Try to resolve every placeholder in the property
    // name to a static string (e.g. via a top-level `const X = "--var"`). If
    // every slot resolves to a CSS-variable-compatible literal, substitute the
    // resolved name and continue processing as a regular declaration. Bail
    // otherwise — emitting the raw `__SC_EXPR_N__` placeholder produces broken
    // StyleX output.
    if (d.property && d.property.includes("__SC_EXPR_")) {
      const resolvedProperty = resolveInterpolatedPropertyName(d.property, ctx);
      if (resolvedProperty === null) {
        ctx.state.bailUnsupported(ctx.decl, "Unsupported interpolation: property");
        break;
      }
      d.property = resolvedProperty;
    }

    if (d.value.kind === "interpolated") {
      // A logical scroll axis shorthand with a dynamic value cannot be split
      // into the Start/End longhands StyleX requires, so it would otherwise
      // emit the unsupported axis shorthand. Bail instead.
      if (d.property && isLogicalScrollAxisShorthand(d.property)) {
        state.bailUnsupported(
          ctx.decl,
          "Dynamic logical scroll shorthand cannot be expanded — bind a specific longhand (e.g. scroll-padding-inline-start) instead",
        );
        if (state.currentDecl === ctx.decl) {
          continue;
        }
        state.bail = true;
        break;
      }
      handleInterpolatedDeclaration({
        ctx,
        rule,
        allRules,
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

    // Handle static `animation-name` longhand that references inline @keyframes.
    if (
      d.property === "animation-name" &&
      d.value.kind === "static" &&
      state.keyframesNames.size > 0
    ) {
      const rawName = d.valueRaw.trim();
      if (state.keyframesNames.has(rawName)) {
        const jsName =
          state.inlineKeyframeNameMap?.get(rawName) ?? cssKeyframeNameToIdentifier(rawName);
        const commentSource = {
          leading: (d as any).leadingComment,
          leadingLine: (d as any).leadingLineComment,
          trailingLine: (d as any).trailingLineComment,
        };
        applyResolvedPropValue("animationName", state.j.identifier(jsName), commentSource);
        continue;
      }
    }

    // Handle static `animation` shorthand that references inline @keyframes.
    // Expand to longhand properties with an identifier reference for the name.
    if (d.property === "animation" && d.value.kind === "static" && state.keyframesNames.size > 0) {
      const expanded: Record<string, unknown> = {};
      if (
        expandStaticAnimationShorthand(
          d.valueRaw,
          state.keyframesNames,
          state.j,
          expanded,
          state.inlineKeyframeNameMap,
        )
      ) {
        const commentSource = {
          leading: (d as any).leadingComment,
          leadingLine: (d as any).leadingLineComment,
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

    if (d.property === "background" && isUnsupportedBackgroundShorthandValue(d.valueRaw)) {
      // Only expand a standalone multi-component background. The expansion emits
      // every longhand (omitted components reset to their initial value), which
      // is correct in isolation, but a sibling `background`/`background-*`
      // declaration may take the single-longhand path (no reset) and leak stale
      // longhands across the cascade — bail when any other background
      // declaration is present.
      const expanded =
        d.value.kind === "static" && !d.important && !hasOtherBackgroundDeclaration(allRules, d)
          ? expandBackgroundShorthandComponents(d.valueRaw)
          : null;
      if (expanded) {
        const commentSource = {
          leading: (d as any).leadingComment,
          leadingLine: (d as any).leadingLineComment,
          trailingLine: (d as any).trailingLineComment,
        };
        let isFirst = true;
        for (const { prop, value } of expanded) {
          applyResolvedPropValue(prop, value, isFirst ? commentSource : null, d.property);
          isFirst = false;
        }
        continue;
      }
      state.bailUnsupported(
        ctx.decl,
        "Unsupported background shorthand: multiple components cannot be mapped to a single StyleX longhand",
      );
      if (state.currentDecl === ctx.decl) {
        break;
      }
      state.bail = true;
      break;
    }
    if (d.property && isUnsupportedStylexProperty(d.property)) {
      state.bailUnsupported(
        ctx.decl,
        `Unsupported CSS property "${d.property}" cannot be emitted in StyleX`,
      );
      if (state.currentDecl === ctx.decl) {
        break;
      }
      state.bail = true;
      break;
    }
    const outs = cssDeclarationToStylexDeclarations(d);
    for (let i = 0; i < outs.length; i++) {
      const out = outs[i]!;
      let value = cssValueToJs(out.value, d.important, out.prop);
      if (out.prop === "content" && typeof value === "string") {
        value = normalizeCssContentValue(value);
      }
      const commentSource =
        i === 0
          ? {
              leading: (d as any).leadingComment,
              leadingLine: (d as any).leadingLineComment,
              trailingLine: (d as any).trailingLineComment,
            }
          : null;
      applyResolvedPropValue(out.prop, value, commentSource, d.property);
    }
  }
}

// --- Non-exported helpers ---

/**
 * Attempts to substitute `__SC_EXPR_N__` placeholders in a CSS property name
 * with statically-resolvable string values pulled from the styled component's
 * template expressions. Only succeeds when:
 *   - every placeholder slot resolves to a string literal (directly or via a
 *     top-level `const NAME = "..."` binding in the same file), and
 *   - the resulting property name is a CSS custom property (starts with `--`).
 *
 * Returns the resolved property name on success, or `null` when the property
 * cannot be safely lowered.
 */
function resolveInterpolatedPropertyName(
  property: string,
  ctx: DeclProcessingState,
): string | null {
  const { decl, state } = ctx;
  const placeholderRe = new RegExp(PLACEHOLDER_RE.source, "g");
  let failed = false;
  const resolved = property.replace(placeholderRe, (_match, slotIdRaw: string) => {
    const slotId = Number(slotIdRaw);
    const expr = decl.templateExpressions[slotId];
    const value = resolveExpressionToStaticString(expr, state);
    if (value === null) {
      failed = true;
      return "";
    }
    return value;
  });
  if (failed) {
    return null;
  }
  // Only substitute names that look like CSS custom properties to avoid
  // accidentally turning unrelated dynamic patterns (e.g. computed standard
  // property names) into silently mistransformed output.
  if (!resolved.startsWith("--")) {
    return null;
  }
  return resolved;
}

/**
 * True when any declaration other than `current` (across all of the component's
 * rules) targets a `background`/`background-*` property. A multi-component
 * background expansion only reproduces reset semantics in isolation, so the
 * presence of a sibling background declaration makes the expansion unsafe.
 */
function hasOtherBackgroundDeclaration(
  allRules: readonly CssRuleIR[],
  current: CssRuleIR["declarations"][number],
): boolean {
  for (const rule of allRules) {
    for (const declaration of rule.declarations) {
      if (declaration === current) {
        continue;
      }
      if (declaration.property && /^background(-|$)/.test(declaration.property)) {
        return true;
      }
    }
  }
  return false;
}
