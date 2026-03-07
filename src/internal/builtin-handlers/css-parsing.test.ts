import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import {
  styleFromSingleDeclaration,
  parseCssDeclarationBlock,
  parseCssDeclarationBlockWithTemplateExpr,
  UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR,
} from "./css-parsing.js";

const j = jscodeshift.withParser("tsx");
const api = { jscodeshift: j, j, stats: () => {}, report: () => {} } as any;

describe("styleFromSingleDeclaration", () => {
  it("preserves numeric value for single-property output", () => {
    const result = styleFromSingleDeclaration("opacity", 1);
    expect(result).toEqual({ opacity: 1 });
  });

  it("coerces numeric string to number via coerceStaticCss", () => {
    const result = styleFromSingleDeclaration("opacity", "0.5");
    expect(result).toEqual({ opacity: 0.5 });
  });

  it("coerces leading-dot decimals like .5 to numbers", () => {
    const result = styleFromSingleDeclaration("opacity", ".5");
    expect(result.opacity).toBe(0.5);
  });

  it("expands border shorthand to longhand properties", () => {
    const result = styleFromSingleDeclaration("border", "1px solid red");
    expect(result).toHaveProperty("borderWidth", "1px");
    expect(result).toHaveProperty("borderStyle", "solid");
    expect(result).toHaveProperty("borderColor", "red");
  });
});

describe("parseCssDeclarationBlock", () => {
  it("returns null for empty/whitespace-only input", () => {
    expect(parseCssDeclarationBlock("")).toBeNull();
    expect(parseCssDeclarationBlock("   ")).toBeNull();
    expect(parseCssDeclarationBlock(";;;")).toBeNull();
  });

  it("returns null for malformed declarations (no colon)", () => {
    expect(parseCssDeclarationBlock("invalid")).toBeNull();
  });

  it("handles CSS values containing colons (e.g. URLs)", () => {
    const result = parseCssDeclarationBlock("background-image: url(https://example.com/img.png)");
    expect(result).toBeDefined();
    expect(result!.backgroundImage).toBe("url(https://example.com/img.png)");
  });

  it("handles multiple declarations with shorthand expansion", () => {
    const result = parseCssDeclarationBlock("transform: rotate(180deg); color: red");
    expect(result).toEqual({ transform: "rotate(180deg)", color: "red" });
  });

  it("coerces leading-dot decimals to numbers", () => {
    expect(parseCssDeclarationBlock("opacity: .5")).toEqual({ opacity: 0.5 });
    expect(parseCssDeclarationBlock("opacity: -.5")).toEqual({ opacity: -0.5 });
  });

  it("coerces full decimals to numbers correctly", () => {
    expect(parseCssDeclarationBlock("opacity: 0.5")).toEqual({ opacity: 0.5 });
    expect(parseCssDeclarationBlock("opacity: 0")).toEqual({ opacity: 0 });
    expect(parseCssDeclarationBlock("opacity: -1")).toEqual({ opacity: -1 });
  });

  it("preserves non-numeric strings as strings", () => {
    expect(parseCssDeclarationBlock("display: flex")).toEqual({ display: "flex" });
  });
});

describe("parseCssDeclarationBlockWithTemplateExpr", () => {
  it("returns null for empty input", () => {
    expect(parseCssDeclarationBlockWithTemplateExpr("", api)).toBeNull();
  });

  it("handles static values without template expressions", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr("color: red", api);
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(false);
    expect(result!.styleObj).toEqual({ color: "red" });
  });

  it("creates template literal AST for values with ${...}", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr("color: ${$colors.primary}", api);
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    const tpl = result!.styleObj.color as any;
    expect(tpl.type).toBe("TemplateLiteral");
    expect(tpl.expressions).toHaveLength(1);
    expect(tpl.expressions[0].type).toBe("MemberExpression");
  });

  it("expands border shorthand with template expression for color", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "border: 1px solid ${$colors.borderColor}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj).toHaveProperty("borderWidth", "1px");
    expect(result!.styleObj).toHaveProperty("borderStyle", "solid");
    expect(result!.styleObj).toHaveProperty("borderColor");
    expect((result!.styleObj.borderColor as any).type).toBe("TemplateLiteral");
  });

  it("expands border-top direction correctly", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "border-top: 1px solid ${$colors.borderColor}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.styleObj).toHaveProperty("borderTopWidth", "1px");
    expect(result!.styleObj).toHaveProperty("borderTopStyle", "solid");
    expect(result!.styleObj).toHaveProperty("borderTopColor");
  });

  it("returns null for unsupported shorthands with template expressions", () => {
    for (const shorthand of UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR) {
      expect(parseCssDeclarationBlockWithTemplateExpr(`${shorthand}: \${spacing}`, api)).toBeNull();
    }
  });

  it("handles mixed static and template values", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "display: flex; color: ${$colors.primary}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj.display).toBe("flex");
    expect((result!.styleObj.color as any).type).toBe("TemplateLiteral");
  });

  it("builds correct member expression AST for dotted paths", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "background-color: ${theme.colors.bg}",
      api,
    );
    expect(result).toBeDefined();
    const tpl = result!.styleObj.backgroundColor as any;
    expect(tpl.type).toBe("TemplateLiteral");
    const expr = tpl.expressions[0];
    expect(expr.type).toBe("MemberExpression");
    expect(expr.object.type).toBe("MemberExpression");
    expect(expr.object.object.name).toBe("theme");
    expect(expr.object.property.name).toBe("colors");
    expect(expr.property.name).toBe("bg");
  });

  it("handles box-shadow with complex template expression", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "box-shadow: inset 0 0 0 1px ${$colors.primaryColor}",
      api,
    );
    expect(result).toBeDefined();
    const tpl = result!.styleObj.boxShadow as any;
    expect(tpl.type).toBe("TemplateLiteral");
    expect(tpl.quasis[0].value.raw).toBe("inset 0 0 0 1px ");
    expect(tpl.expressions[0].type).toBe("MemberExpression");
  });
});
