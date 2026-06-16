import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";
import type { CssDeclarationIR, CssRuleIR } from "../css-ir.js";
import type { Expression } from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { inlinePropConditionalCssHelpersStep } from "./inline-prop-conditional-css-helpers.js";

const j = jscodeshift.withParser("tsx");

describe("inlinePropConditionalCssHelpersStep", () => {
  it("inlines a top-level prop-conditional helper and empties (but keeps) the helper decl", () => {
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
    // freshly appended consumer template expression (slot 1).
    const declarations = consumer.rules[0]!.declarations;
    expect(declarations.map((d) => d.property)).toEqual(["width", "color"]);
    expect(declarations[0]!.value).toEqual({
      kind: "interpolated",
      parts: [{ kind: "slot", slotId: 1 }],
    });
    expect(declarations[0]!.valueRaw).toBe("__SC_EXPR_1__");
    expect(consumer.templateExpressions).toHaveLength(2);
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
