/**
 * Step: inline prop-conditional css`` helpers into their consuming styled components.
 * Core concepts: a standalone `css` helper whose template branches on component props
 * (e.g. `width: ${(p) => (p.$big ? "100px" : "50px")}`) cannot be lowered to a single
 * shared StyleX style key, so it cannot be referenced as a mixin. Instead we splice the
 * helper's CSS declarations directly into each consumer at the `${helper}` reference site,
 * remapping the helper's interpolation slots onto the consumer. The consumer's normal rule
 * lowering then handles the prop conditional the same way it would for an inline declaration.
 */
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { StyledDecl } from "../transform-types.js";
import { CONTINUE, type StepResult } from "../transform-types.js";
import { TransformContext } from "../transform-context.js";
import { cloneAstNode } from "../utilities/jscodeshift-utils.js";
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
    const references = collectInlinableHelperReferences(consumer, declByLocalName);
    if (references.length === 0) {
      continue;
    }
    // Snapshot the consumer's own (authored) rules before any inlining so nested helper
    // rules can detect — and bail on — merges into a consumer-authored selector.
    const authoredRules = new Set(consumer.rules);
    for (const reference of references) {
      const helperDecl = reference.helperDecl;
      if (!isInlinableHelper(helperDecl, cssHelperNames)) {
        retainedHelpers.add(helperDecl.localName);
        continue;
      }
      if (inlineHelperReference(consumer, reference, authoredRules)) {
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
 * merging a helper's own nested rules under another selector is not generally safe.
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
 * A helper is inlinable when it carries a prop-based interpolation (the case that the
 * mixin path bails on) and it is a private, locally-defined helper whose rules are
 * statically splice-able (no interpolated selectors, no references to other helpers).
 */
function isInlinableHelper(helperDecl: StyledDecl, cssHelperNames: ReadonlySet<string>): boolean {
  if (helperDecl.isExported || helperDecl.preserveCssHelperDeclaration) {
    return false;
  }
  if (!helperUsesProps(helperDecl)) {
    return false;
  }
  for (const rule of helperDecl.rules) {
    if (rule.selector.includes("__SC_EXPR_")) {
      return false;
    }
  }
  // Bail if the helper interpolates another css helper — chained inlining is out of scope.
  for (const expr of helperDecl.templateExpressions as Array<{ type?: string; name?: string }>) {
    if (expr?.type === "Identifier" && expr.name && cssHelperNames.has(expr.name)) {
      return false;
    }
  }
  return true;
}

/** Mirrors the mixin-bail detection: a helper interpolation that reads non-theme props. */
function helperUsesProps(helperDecl: StyledDecl): boolean {
  for (const expr of helperDecl.templateExpressions as Array<{ type?: string }>) {
    if (!expr || (expr.type !== "ArrowFunctionExpression" && expr.type !== "FunctionExpression")) {
      continue;
    }
    const propsUsed = new Set([
      ...collectPropsFromArrowFn(expr as never),
      ...collectPropsFromArrowFnDestructured(expr as never),
    ]);
    propsUsed.delete("theme");
    if (propsUsed.size > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Splices the helper's declarations into the consumer at the reference site, remapping
 * the helper's interpolation slots onto freshly-appended consumer template expressions.
 * Returns false (without mutating) when the helper shape is not safe to inline.
 *
 * `authoredRules` is the set of the consumer's own rules captured before any inlining; a
 * helper nested rule (e.g. `&:hover`) that would merge into a consumer-authored rule bails,
 * because appending its declarations cannot preserve the `${helper}` reference's cascade
 * position relative to the consumer's own rule for that selector.
 */
function inlineHelperReference(
  consumer: StyledDecl,
  reference: HelperReference,
  authoredRules: ReadonlySet<CssRuleIR>,
): boolean {
  const { rule, referenceDecl, helperDecl } = reference;
  const declIndex = rule.declarations.indexOf(referenceDecl);
  if (declIndex === -1) {
    return false;
  }
  const slotOffset = consumer.templateExpressions.length;
  const inheritedSourceOrder = referenceDecl.sourceOrder;

  const baseDecls: CssDeclarationIR[] = [];
  type NestedRuleDecls = {
    selector: string;
    atRuleStack: string[];
    declarations: CssDeclarationIR[];
  };
  const nestedRuleDecls: NestedRuleDecls[] = [];

  for (const helperRule of helperDecl.rules) {
    const remapped = helperRule.declarations.map((d) =>
      remapDeclaration(d, slotOffset, inheritedSourceOrder),
    );
    if (remapped.length === 0) {
      continue;
    }
    if (helperRule.selector.trim() === "&" && helperRule.atRuleStack.length === 0) {
      baseDecls.push(...remapped);
    } else {
      const existing = findMatchingRule(
        consumer.rules,
        helperRule.selector,
        helperRule.atRuleStack,
      );
      if (existing && authoredRules.has(existing)) {
        return false;
      }
      nestedRuleDecls.push({
        selector: helperRule.selector,
        atRuleStack: helperRule.atRuleStack,
        declarations: remapped,
      });
    }
  }

  // Commit: append cloned helper template expressions, then splice declarations.
  for (const expr of helperDecl.templateExpressions) {
    consumer.templateExpressions.push(cloneAstNode(expr));
  }
  rule.declarations.splice(declIndex, 1, ...baseDecls);
  for (const nested of nestedRuleDecls) {
    const target = findOrCreateRule(consumer.rules, nested.selector, nested.atRuleStack);
    target.declarations.push(...nested.declarations);
  }
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

function findMatchingRule(
  rules: readonly CssRuleIR[],
  selector: string,
  atRuleStack: readonly string[],
): CssRuleIR | undefined {
  return rules.find((r) => r.selector === selector && sameArray(r.atRuleStack, atRuleStack));
}

function findOrCreateRule(rules: CssRuleIR[], selector: string, atRuleStack: string[]): CssRuleIR {
  const existing = findMatchingRule(rules, selector, atRuleStack);
  if (existing) {
    return existing;
  }
  const created: CssRuleIR = { selector, atRuleStack: [...atRuleStack], declarations: [] };
  rules.push(created);
  return created;
}

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
