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
    const consumer = consumerDecl("Tile", [
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

  it("does not inline when the consumer authored a rule matching the helper's nested selector", () => {
    const helper = cssHelperDecl("interactive", [
      rule("&", [interpolatedDecl("opacity", 0)]),
      rule("&:hover", [staticDecl("background-color", "gold")]),
    ]);
    const consumerReference = helperReferenceDecl(0);
    const consumer = consumerDecl("Card", [
      rule("&", [consumerReference, staticDecl("padding", "8px")]),
      rule("&:hover", [staticDecl("background-color", "green")]),
    ]);
    const ctx = createContext([consumer, helper]);

    inlinePropConditionalCssHelpersStep(ctx);

    // Comment #2: appending the helper's `&:hover` into the consumer's authored `&:hover`
    // would flip cascade order, so the reference is left intact for the existing mixin bail.
    expect(helper.rules).toHaveLength(2);
    expect(consumer.rules[0]!.declarations).toContain(consumerReference);
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

function consumerDecl(localName: string, rules: CssRuleIR[]): StyledDecl {
  return {
    localName,
    base: { kind: "intrinsic", tagName: "div" },
    styleKey: localName,
    rules,
    templateExpressions: [parseExpr("sizing")],
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
