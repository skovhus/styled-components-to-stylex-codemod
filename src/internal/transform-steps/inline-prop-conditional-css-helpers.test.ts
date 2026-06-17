import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { Expression } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { inlinePropConditionalCssHelpersStep } from "./inline-prop-conditional-css-helpers.js";

const j = jscodeshift.withParser("tsx");

describe("inlinePropConditionalCssHelpersStep", () => {
  it("inlines a prop-conditional helper and empties (but keeps) the helper decl", () => {
    const helper = cssHelperDecl("sizing", [rule("&", [interpolatedDecl("width", 0)])]);
    const consumer = consumerDecl("Tile", "sizing", [
      rule("&", [helperReferenceDecl(0), staticDecl("color", "red")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    // Comment #1: the helper is retained in styledDecls (so lowerRulesStep's skipped-decl
    // safety check still sees it) but its rules are emptied so it emits no dead styles.
    expect(ctx.styledDecls).toContain(helper);
    expect(helper.rules).toEqual([]);

    // The `${sizing}` reference is replaced by the helper's declaration, remapped onto a
    // freshly appended consumer template expression (slot 1). The uncontested `width` is safe.
    const declarations = consumer.rules[0]!.declarations;
    expect(declarations.map((d) => d.property)).toEqual(["width", "color"]);
    expect(declarations[0]!.value).toEqual({
      kind: "interpolated",
      parts: [{ kind: "slot", slotId: 1 }],
    });
    expect(declarations[0]!.valueRaw).toBe("__SC_EXPR_1__");
    expect(consumer.templateExpressions).toHaveLength(2);
  });

  it("inlines an unconditional dynamic value when its property is uncontested", () => {
    const helper = cssHelperDecl("dynColor", [rule("&", [interpolatedDecl("color", 0)])]);
    helper.templateExpressions = [parseExpr("(p) => p.$color")];
    const consumer = consumerDecl("Box", "dynColor", [
      rule("&", [helperReferenceDecl(0), staticDecl("padding", "4px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toEqual([]);
    expect(consumer.rules[0]!.declarations.map((d) => d.property)).toEqual(["color", "padding"]);
  });

  it("does not inline when a later consumer declaration contests the prop-dependent property", () => {
    // Comments #6 / #7: a later `color: red;` (or `width: 80px;`) must win, but the inlined
    // dynamic value could override it depending on the lowering path — so bail.
    const helper = cssHelperDecl("dynColor", [rule("&", [interpolatedDecl("color", 0)])]);
    helper.templateExpressions = [parseExpr("(p) => p.$color")];
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynColor", [
      rule("&", [reference, staticDecl("color", "red")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(1);
  });

  it("does not inline when a separate later `&` rule contests the prop-dependent property", () => {
    // Comment #8: the contest check scans every consumer rule, not only the reference's rule.
    const helper = cssHelperDecl("sizing", [rule("&", [interpolatedDecl("width", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "sizing", [
      rule("&", [reference]),
      rule("&", [staticDecl("width", "80px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(1);
  });

  it("does not inline when a shorthand contests the prop-dependent longhand", () => {
    const helper = cssHelperDecl("dynMarginTop", [rule("&", [interpolatedDecl("margin-top", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynMarginTop", [
      rule("&", [reference, staticDecl("margin", "0")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline when a sub-shorthand family contests the prop-dependent longhand", () => {
    // Comment #10: `border-color` (shorthand) expands to the four side colors, overlapping the
    // dynamic `border-top-color`, even though neither name is a prefix of the other.
    const helper = cssHelperDecl("dynBorderTop", [
      rule("&", [interpolatedDecl("border-top-color", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynBorderTop", [
      rule("&", [reference, staticDecl("border-color", "green")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline when a logical shorthand contests the prop-dependent logical longhand", () => {
    // Comment #11: `border-block-color` expands to the block start/end colors (normalized to
    // physical top/bottom), overlapping the dynamic `border-block-start-color`.
    const helper = cssHelperDecl("dynBlock", [
      rule("&", [interpolatedDecl("border-block-start-color", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynBlock", [
      rule("&", [reference, staticDecl("border-block-color", "green")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline an unmodeled longhand contested by its prefix shorthand", () => {
    // Comment #18: `font-variant` is a nested shorthand the leaf table doesn't enumerate; the
    // word-prefix backstop catches `font-variant-numeric` vs `font-variant`.
    const helper = cssHelperDecl("dynVariant", [
      rule("&", [interpolatedDecl("font-variant-numeric", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynVariant", [
      rule("&", [reference, staticDecl("font-variant", "normal")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a dynamic property contested by its legacy CSS alias", () => {
    // Comment #22: `word-wrap` is a legacy alias of `overflow-wrap`, so a dynamic `overflow-wrap`
    // helper contends with a later `word-wrap` consumer declaration even though the camelCased
    // names differ; the later alias should win, so bail.
    const helper = cssHelperDecl("dynWrap", [rule("&", [interpolatedDecl("overflow-wrap", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynWrap", [
      rule("&", [reference, staticDecl("word-wrap", "break-word")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a dynamic gap longhand contested by a legacy grid-gap alias", () => {
    // Comment #22: `grid-gap` is a legacy alias of `gap`, which expands to `row-gap`/`column-gap`,
    // so it contends with a dynamic `row-gap` helper.
    const helper = cssHelperDecl("dynGap", [rule("&", [interpolatedDecl("row-gap", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynGap", [
      rule("&", [reference, staticDecl("grid-gap", "8px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a dynamic break longhand contested by a legacy page-break alias", () => {
    // Comment #23: `page-break-before` is a legacy alias of `break-before`, so it contends with a
    // dynamic `break-before` helper even though the camelCased names differ.
    const helper = cssHelperDecl("dynBreak", [rule("&", [interpolatedDecl("break-before", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynBreak", [
      rule("&", [reference, staticDecl("page-break-before", "always")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a border-image longhand contested by the border shorthand", () => {
    // Comment #21: `border` resets `border-image` to its initial value, so it contends with a
    // dynamic `border-image-source` even though `border` only sets width/style/color.
    const helper = cssHelperDecl("dynImage", [
      rule("&", [interpolatedDecl("border-image-source", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynImage", [
      rule("&", [reference, staticDecl("border", "1px solid red")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("inlines when a different sub-shorthand family does not contest", () => {
    // `border-radius` does not overlap `border-top-color`, so the inline is still safe.
    const helper = cssHelperDecl("dynBorderTop", [
      rule("&", [interpolatedDecl("border-top-color", 0)]),
    ]);
    const consumer = consumerDecl("Box", "dynBorderTop", [
      rule("&", [helperReferenceDecl(0), staticDecl("border-radius", "4px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toEqual([]);
    expect(consumer.rules[0]!.declarations.map((d) => d.property)).toEqual([
      "border-top-color",
      "border-radius",
    ]);
  });

  it("does not inline when the consumer composes another sibling mixin", () => {
    // Comment #9: a sibling `${reset}` appears as a property-less declaration whose emitted
    // properties are unknown here and could overlap, so bail rather than guess.
    const helper = cssHelperDecl("dynColor", [rule("&", [interpolatedDecl("color", 0)])]);
    helper.templateExpressions = [parseExpr("(p) => p.$color")];
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynColor", [
      rule("&", [reference, helperReferenceDecl(1)]),
    ]);
    // Slot 1 is a second mixin reference (e.g. `${reset}`).
    consumer.templateExpressions = [parseExpr("dynColor"), parseExpr("reset")];
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(2);
  });

  it("does not inline a logical size contested by a physical dimension", () => {
    // Comment #19: `inline-size` is `width` in horizontal-tb (and `height` in vertical modes), so
    // it contends with a later physical `width`.
    const helper = cssHelperDecl("dynSize", [rule("&", [interpolatedDecl("inline-size", 0)])]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynSize", [
      rule("&", [reference, staticDecl("width", "80px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a logical inline side contested by either physical side", () => {
    // Comment #12: `margin-inline-start` is the right side in RTL, so it conservatively contends
    // with both `margin-left` and `margin-right`.
    const helper = cssHelperDecl("dynInline", [
      rule("&", [interpolatedDecl("margin-inline-start", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynInline", [
      rule("&", [reference, staticDecl("margin-right", "0")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("treats a logical block side as contesting any physical side (vertical writing modes)", () => {
    // Comment #16: in vertical writing modes `margin-block-start` can target the left/right side,
    // so it conservatively contends with every physical margin side.
    const helper = cssHelperDecl("dynBlock", [
      rule("&", [interpolatedDecl("margin-block-start", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynBlock", [
      rule("&", [reference, staticDecl("margin-left", "0")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline an overscroll-behavior axis contested by the shorthand", () => {
    // Comment #17: `overscroll-behavior` sets both axes, overlapping `overscroll-behavior-x`.
    const helper = cssHelperDecl("dynOverscroll", [
      rule("&", [interpolatedDecl("overscroll-behavior-x", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynOverscroll", [
      rule("&", [reference, staticDecl("overscroll-behavior", "contain")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a background-position axis contested by the shorthand", () => {
    // Comment #13: `background-position` sets both axes, overlapping `background-position-x`.
    const helper = cssHelperDecl("dynPosX", [
      rule("&", [interpolatedDecl("background-position-x", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynPosX", [
      rule("&", [reference, staticDecl("background-position", "center")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline when a helper static property contests a consumer declaration", () => {
    // Comment #14: the helper's static `color: red` should override the consumer's earlier dynamic
    // `color`, but splicing could let the dynamic win — the property overlap must bail.
    const helper = cssHelperDecl("sizing", [
      rule("&", [staticDecl("color", "red"), interpolatedDecl("width", 0)]),
    ]);
    const reference = helperReferenceDecl(1);
    const consumer = consumerDecl("Box", "sizing", [
      rule("&", [interpolatedDecl("color", 0), reference]),
    ]);
    consumer.templateExpressions = [parseExpr("(p) => p.$color"), parseExpr("sizing")];
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a logical corner radius contested by any physical corner", () => {
    // Comment #15: a logical corner can map to any physical corner under some writing mode.
    const helper = cssHelperDecl("dynCorner", [
      rule("&", [interpolatedDecl("border-start-start-radius", 0)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "dynCorner", [
      rule("&", [reference, staticDecl("border-bottom-right-radius", "4px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
  });

  it("does not inline a helper that carries a nested selector block", () => {
    const helper = cssHelperDecl("interactive", [
      rule("&", [interpolatedDecl("opacity", 0)]),
      rule("&:hover", [staticDecl("background-color", "gold")]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Toggle", "interactive", [
      rule("&", [reference, staticDecl("padding", "8px")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    // Comment #3: a helper's nested rule (e.g. `&:hover`) cannot be spliced into the
    // consumer's `&` block while preserving cascade order, so the reference is left intact.
    expect(helper.rules).toHaveLength(2);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(1);
  });

  it("does not inline a helper with more than one prop-dependent declaration", () => {
    // Comment #5: two dynamic declarations would each carry the reference's source order,
    // losing their intra-helper precedence, so bail rather than reorder the cascade.
    const helper = cssHelperDecl("twoDynamic", [
      rule("&", [interpolatedDecl("color", 0), interpolatedDecl("background-color", 1)]),
    ]);
    helper.templateExpressions = [propArrow(), propArrow()];
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "twoDynamic", [rule("&", [reference])]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(1);
  });

  it("does not inline a helper that chains another mixin reference", () => {
    // `${parts.reset}` composes as a separate (member) css helper — represented as a
    // property-less declaration. Comment #4: inlining would reorder the cascade, so bail.
    const helper = cssHelperDecl("composed", [
      rule("&", [interpolatedDecl("opacity", 0), helperReferenceDecl(1)]),
    ]);
    const reference = helperReferenceDecl(0);
    const consumer = consumerDecl("Box", "composed", [rule("&", [reference])]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    expect(helper.rules).toHaveLength(1);
    expect(consumer.rules[0]!.declarations).toContain(reference);
    expect(consumer.templateExpressions).toHaveLength(1);
  });
});

// --- helpers ---

function createContext(styledDecls: StyledDecl[]): TransformContext {
  const cssHelperNames = new Set(styledDecls.filter((d) => d.isCssHelper).map((d) => d.localName));
  return {
    styledDecls,
    cssHelpers: { cssHelperNames },
    markChanged: () => {},
  } as unknown as TransformContext;
}

function cssHelperDecl(localName: string, rules: CssRuleIR[]): StyledDecl {
  return {
    localName,
    base: { kind: "intrinsic", tagName: "div" },
    styleKey: localName,
    isCssHelper: true,
    rules,
    templateExpressions: [propArrow()],
  } as StyledDecl;
}

function consumerDecl(localName: string, helperName: string, rules: CssRuleIR[]): StyledDecl {
  return {
    localName,
    base: { kind: "intrinsic", tagName: "div" },
    styleKey: localName,
    rules,
    templateExpressions: [parseExpr(helperName)],
  } as StyledDecl;
}

function rule(selector: string, declarations: CssDeclarationIR[]): CssRuleIR {
  return { selector, atRuleStack: [], declarations };
}

function interpolatedDecl(property: string, slotId: number): CssDeclarationIR {
  return {
    property,
    value: { kind: "interpolated", parts: [{ kind: "slot", slotId }] },
    important: false,
    valueRaw: `__SC_EXPR_${slotId}__`,
  };
}

function helperReferenceDecl(slotId: number): CssDeclarationIR {
  return {
    property: "",
    value: { kind: "interpolated", parts: [{ kind: "slot", slotId }] },
    important: false,
    valueRaw: `__SC_EXPR_${slotId}__`,
  };
}

function staticDecl(property: string, value: string): CssDeclarationIR {
  return { property, value: { kind: "static", value }, important: false, valueRaw: value };
}

function propArrow(): Expression {
  return parseExpr('(p) => (p.$big ? "100px" : "50px")');
}

function parseExpr(code: string): Expression {
  return j(`const __x = ${code};`).find(j.VariableDeclarator).get().node.init as Expression;
}
