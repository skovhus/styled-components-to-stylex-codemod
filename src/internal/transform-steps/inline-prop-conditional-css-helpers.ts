/**
 * Step: inline prop-conditional css`` helpers into their consuming styled components.
 * Core concepts: a standalone `css` helper whose template branches on component props
 * (e.g. `width: ${(p) => (p.$big ? "100px" : "50px")}`) cannot be lowered to a single
 * shared StyleX style key, so it cannot be referenced as a mixin. Instead we splice the
 * helper's CSS declarations directly into each consumer at the `${helper}` reference site,
 * remapping the helper's interpolation slots onto the consumer. The consumer's normal rule
 * lowering then handles the prop conditional the same way it would for an inline declaration.
 *
 * Inlining is intentionally conservative: only a helper that is a single top-level `&` block
 * with no chained mixin references is spliced. Helpers with nested selectors/at-rules or
 * chained `${otherMixin}` references would require source-order-aware merging into the
 * consumer to preserve the CSS cascade, so they are left for the existing mixin bail instead.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { StyledDecl } from "../transform-types.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import {
  cloneAstNode,
  getFunctionBodyExpr,
  literalToStaticValue,
} from "../utilities/jscodeshift-utils.js";
import {
  collectPropsFromArrowFn,
  collectPropsFromArrowFnDestructured,
} from "../lower-rules/inline-styles.js";

/**
 * Inlines prop-conditional css`` helpers into consumers so their prop-dependent
 * styles are preserved. Helpers that cannot be safely inlined are left untouched
 * (their `${helper}` reference falls through to the existing mixin bail).
 */
export function inlinePropConditionalCssHelpersStep(ctx: TransformContext): StepResult {
  const styledDecls = ctx.styledDecls;
  const cssHelperNames: Set<string> | undefined = ctx.cssHelpers?.cssHelperNames;
  if (!styledDecls || !cssHelperNames || cssHelperNames.size === 0) {
    return CONTINUE;
  }

  const declByLocalName = new Map<string, StyledDecl>();
  for (const decl of styledDecls) {
    declByLocalName.set(decl.localName, decl);
  }

  // Helpers whose every reference was inlined: their declarations can be emptied.
  const fullyInlinedHelpers = new Set<string>();
  // Helpers that have at least one reference we could not inline (must keep them intact).
  const retainedHelpers = new Set<string>();

  for (const consumer of styledDecls) {
    if (consumer.isCssHelper) {
      continue;
    }
    for (const reference of collectInlinableHelperReferences(consumer, declByLocalName)) {
      const helperDecl = reference.helperDecl;
      if (!isInlinableHelper(helperDecl)) {
        retainedHelpers.add(helperDecl.localName);
        continue;
      }
      if (inlineHelperReference(consumer, reference)) {
        fullyInlinedHelpers.add(helperDecl.localName);
        ctx.markChanged();
      } else {
        retainedHelpers.add(helperDecl.localName);
      }
    }
  }

  // Empty the rules of fully-inlined helpers so they lower to nothing (no dead style keys).
  // The decls are deliberately kept in `styledDecls`: lowerRulesStep's skipped-decl safety
  // check relies on them remaining in `removedHelperLocalNames` to bail when a preserved
  // consumer (partial migration / leaves-only) still references the extracted helper source.
  for (const decl of styledDecls) {
    if (
      decl.isCssHelper &&
      fullyInlinedHelpers.has(decl.localName) &&
      !retainedHelpers.has(decl.localName)
    ) {
      decl.rules = [];
    }
  }

  return CONTINUE;
}

// --- Non-exported helpers ---

type HelperReference = {
  /** The rule in the consumer that contains the `${helper}` reference declaration. */
  rule: CssRuleIR;
  /** The reference declaration object (located by identity to survive splices). */
  referenceDecl: CssDeclarationIR;
  /** The css helper declaration referenced by `${helper}`. */
  helperDecl: StyledDecl;
};

/**
 * Finds property-less `${helper}` references (single-slot identifier interpolations)
 * that sit in the consumer's top-level `&` rule. Only top-level references are returned;
 * references nested under selectors/at-rules are left for the existing bail path because
 * merging a helper's own declarations under another selector is not generally safe.
 */
function collectInlinableHelperReferences(
  consumer: StyledDecl,
  declByLocalName: Map<string, StyledDecl>,
): HelperReference[] {
  const references: HelperReference[] = [];
  for (const rule of consumer.rules) {
    if (rule.selector.trim() !== "&" || rule.atRuleStack.length > 0) {
      continue;
    }
    for (const referenceDecl of rule.declarations) {
      const helperName = referencedHelperName(referenceDecl, consumer);
      if (!helperName) {
        continue;
      }
      const helperDecl = declByLocalName.get(helperName);
      if (helperDecl?.isCssHelper) {
        references.push({ rule, referenceDecl, helperDecl });
      }
    }
  }
  return references;
}

/** Returns the helper identifier name if `d` is a standalone `${identifier}` interpolation. */
function referencedHelperName(d: CssDeclarationIR, consumer: StyledDecl): string | null {
  if (d.property || d.value.kind !== "interpolated") {
    return null;
  }
  const parts = d.value.parts;
  if (parts.length !== 1 || parts[0]?.kind !== "slot") {
    return null;
  }
  const expr = consumer.templateExpressions[parts[0].slotId] as { type?: string; name?: string };
  return expr?.type === "Identifier" && typeof expr.name === "string" ? expr.name : null;
}

/**
 * A helper is inlinable when it carries a prop-based interpolation (the case the mixin path
 * bails on) and is shaped so its declarations can be spliced into the consumer's `&` block
 * without disturbing the CSS cascade:
 *
 *  - private (not exported / preserved for cross-file use),
 *  - every rule is the top-level `&` block (no nested selectors, no at-rules),
 *  - no chained mixin references (a property-less `${otherMixin}` / `${parts.reset}` slot)
 *    — those compose as separate style keys whose ordering we cannot preserve by splicing,
 *  - exactly one prop-dependent declaration. That single dynamic entry is the case the mixin
 *    path bails on, and it has no intra-helper ordering ambiguity. Zero means a plain mixin
 *    (handled by the shared-style-key path); two or more dynamic entries are emitted as
 *    styleFns/variants whose precedence depends on per-declaration source order, which the
 *    splice (which stamps the single reference order on every inlined declaration) cannot
 *    preserve — so bail, and
 *  - that prop-dependent declaration must lower to a static base+variant pair (a ternary with
 *    static branches). That path subtracts later same-property static overrides, so the
 *    consumer's `color: red;` after `${mixin}` still wins. An unconditional dynamic value
 *    lowers to a style function that does not subtract a later static override, so it is
 *    excluded (it would change styles where the helper previously bailed).
 */
function isInlinableHelper(helperDecl: StyledDecl): boolean {
  if (helperDecl.isExported || helperDecl.preserveCssHelperDeclaration) {
    return false;
  }
  let propDependentDeclaration: CssDeclarationIR | null = null;
  let propDependentCount = 0;
  for (const rule of helperDecl.rules) {
    if (rule.selector.trim() !== "&" || rule.atRuleStack.length > 0) {
      return false;
    }
    for (const declaration of rule.declarations) {
      if (!declaration.property) {
        return false;
      }
      if (declarationReadsProps(declaration, helperDecl.templateExpressions)) {
        propDependentCount += 1;
        propDependentDeclaration = declaration;
      }
    }
  }
  return (
    propDependentCount === 1 &&
    propDependentDeclaration !== null &&
    lowersToOverrideSafeVariant(propDependentDeclaration, helperDecl.templateExpressions)
  );
}

/**
 * True when a prop-dependent declaration is a single-slot ternary with static literal branches
 * (e.g. `${(p) => (p.$big ? "100px" : "50px")}`). This is the shape that lowers to a static
 * base+variant pair whose later same-property static overrides are subtracted by the existing
 * rule lowering — so splicing it preserves the cascade. Unconditional dynamic values
 * (`${(p) => p.$color}`) lower to a style function that does not subtract later overrides.
 */
function lowersToOverrideSafeVariant(
  declaration: CssDeclarationIR,
  templateExpressions: readonly unknown[],
): boolean {
  if (declaration.value.kind !== "interpolated" || declaration.value.parts.length !== 1) {
    return false;
  }
  const part = declaration.value.parts[0];
  if (part?.kind !== "slot") {
    return false;
  }
  const expr = templateExpressions[part.slotId] as { type?: string } | undefined;
  if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
    return false;
  }
  const body = getFunctionBodyExpr(expr as { body?: unknown });
  if (!body || (body as { type?: string }).type !== "ConditionalExpression") {
    return false;
  }
  const conditional = body as { consequent?: unknown; alternate?: unknown };
  return (
    literalToStaticValue(conditional.consequent) !== null &&
    literalToStaticValue(conditional.alternate) !== null
  );
}

/** True when a declaration's interpolated value reads a non-theme component prop. */
function declarationReadsProps(
  declaration: CssDeclarationIR,
  templateExpressions: readonly unknown[],
): boolean {
  if (declaration.value.kind !== "interpolated") {
    return false;
  }
  for (const part of declaration.value.parts) {
    if (part.kind === "slot" && expressionReadsNonThemeProps(templateExpressions[part.slotId])) {
      return true;
    }
  }
  return false;
}

/** Mirrors the mixin-bail detection: an arrow/function interpolation that reads non-theme props. */
function expressionReadsNonThemeProps(expr: unknown): boolean {
  const node = expr as { type?: string } | undefined;
  if (!node || (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression")) {
    return false;
  }
  const propsUsed = new Set([
    ...collectPropsFromArrowFn(node as never),
    ...collectPropsFromArrowFnDestructured(node as never),
  ]);
  propsUsed.delete("theme");
  return propsUsed.size > 0;
}

/**
 * Splices the helper's `&`-block declarations into the consumer at the reference site,
 * remapping the helper's interpolation slots onto freshly-appended consumer template
 * expressions. Returns false (without mutating) when the reference is no longer present.
 */
function inlineHelperReference(consumer: StyledDecl, reference: HelperReference): boolean {
  const { rule, referenceDecl, helperDecl } = reference;
  const declIndex = rule.declarations.indexOf(referenceDecl);
  if (declIndex === -1) {
    return false;
  }
  const slotOffset = consumer.templateExpressions.length;
  const inheritedSourceOrder = referenceDecl.sourceOrder;

  // isInlinableHelper guarantees every helper rule is the top-level `&` block.
  const inlinedDecls = helperDecl.rules.flatMap((helperRule) =>
    helperRule.declarations.map((d) => remapDeclaration(d, slotOffset, inheritedSourceOrder)),
  );

  for (const expr of helperDecl.templateExpressions) {
    consumer.templateExpressions.push(cloneAstNode(expr));
  }
  rule.declarations.splice(declIndex, 1, ...inlinedDecls);
  return true;
}

/** Deep-clones a CSS declaration, offsetting every interpolation slot id by `slotOffset`. */
function remapDeclaration(
  d: CssDeclarationIR,
  slotOffset: number,
  sourceOrder: number | undefined,
): CssDeclarationIR {
  const value: CssDeclarationIR["value"] =
    d.value.kind === "interpolated"
      ? {
          kind: "interpolated",
          parts: d.value.parts.map((part) =>
            part.kind === "slot"
              ? { kind: "slot", slotId: part.slotId + slotOffset }
              : { kind: "static", value: part.value },
          ),
        }
      : { kind: "static", value: d.value.value };
  // Inherit the reference declaration's source order so the spliced declarations take the
  // `${helper}` reference's cascade position, rather than the helper's own internal order.
  return {
    ...d,
    value,
    valueRaw: offsetPlaceholders(d.valueRaw, slotOffset),
    sourceOrder,
  };
}

/** Rewrites `__SC_EXPR_<n>__` placeholders in a raw value string by adding `slotOffset`. */
function offsetPlaceholders(valueRaw: string, slotOffset: number): string {
  return valueRaw.replace(
    /__SC_EXPR_(\d+)__/g,
    (_, n: string) => `__SC_EXPR_${Number(n) + slotOffset}__`,
  );
}
