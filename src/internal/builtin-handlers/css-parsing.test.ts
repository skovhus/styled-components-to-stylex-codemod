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
  it("maps a simple CSS property to a StyleX property", () => {
    const result = styleFromSingleDeclaration("color", "red");
    expect(result).toEqual({ color: "red" });
  });

  it("keeps numeric values as numbers", () => {
    const result = styleFromSingleDeclaration("opacity", 1);
    expect(result).toEqual({ opacity: 1 });
  });

  it("expands shorthand border to longhand properties", () => {
    const result = styleFromSingleDeclaration("border", "1px solid red");
    expect(result).toHaveProperty("borderWidth");
    expect(result).toHaveProperty("borderStyle");
    expect(result).toHaveProperty("borderColor");
  });

  it("converts numeric string values to numbers", () => {
    const result = styleFromSingleDeclaration("opacity", "0.5");
    expect(result).toEqual({ opacity: 0.5 });
  });

  it("handles padding shorthand expansion", () => {
    const result = styleFromSingleDeclaration("padding", "4px 8px");
    expect(result).toHaveProperty("paddingBlock");
    expect(result).toHaveProperty("paddingInline");
  });
});

describe("parseCssDeclarationBlock", () => {
  it("parses a single declaration", () => {
    const result = parseCssDeclarationBlock("color: red");
    expect(result).toEqual({ color: "red" });
  });

  it("parses multiple declarations separated by semicolons", () => {
    const result = parseCssDeclarationBlock("color: red; font-size: 16px");
    expect(result).toEqual({ color: "red", fontSize: "16px" });
  });

  it("returns null for empty input", () => {
    expect(parseCssDeclarationBlock("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(parseCssDeclarationBlock("   ")).toBeNull();
  });

  it("returns null for semicolons-only input", () => {
    expect(parseCssDeclarationBlock(";;;")).toBeNull();
  });

  it("returns null for malformed input (no colon)", () => {
    expect(parseCssDeclarationBlock("invalid")).toBeNull();
  });

  it("handles trailing semicolons", () => {
    const result = parseCssDeclarationBlock("color: red;");
    expect(result).toEqual({ color: "red" });
  });

  it("handles transform with complex value", () => {
    const result = parseCssDeclarationBlock("transform: rotate(180deg)");
    expect(result).toEqual({ transform: "rotate(180deg)" });
  });

  it("coerces numeric string values to numbers", () => {
    const result = parseCssDeclarationBlock("opacity: 0.5");
    expect(result).toEqual({ opacity: 0.5 });
  });

  it("expands shorthand properties", () => {
    const result = parseCssDeclarationBlock("border: 1px solid red");
    expect(result).toBeDefined();
    expect(result).toHaveProperty("borderWidth");
    expect(result).toHaveProperty("borderStyle");
    expect(result).toHaveProperty("borderColor");
  });
});

describe("parseCssDeclarationBlockWithTemplateExpr", () => {
  it("returns null for empty input", () => {
    expect(parseCssDeclarationBlockWithTemplateExpr("", api)).toBeNull();
  });

  it("returns null for semicolons-only input", () => {
    expect(parseCssDeclarationBlockWithTemplateExpr(";;;", api)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseCssDeclarationBlockWithTemplateExpr("invalid", api)).toBeNull();
  });

  it("handles static values (no template expressions)", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr("color: red", api);
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(false);
    expect(result!.styleObj).toEqual({ color: "red" });
  });

  it("handles values with template expressions", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr("color: ${$colors.primary}", api);
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj.color).toBeDefined();
    expect((result!.styleObj.color as any).type).toBe("TemplateLiteral");
  });

  it("handles box-shadow with template expressions", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "box-shadow: inset 0 0 0 1px ${$colors.primaryColor}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj.boxShadow).toBeDefined();
    const tpl = result!.styleObj.boxShadow as any;
    expect(tpl.type).toBe("TemplateLiteral");
  });

  it("handles border shorthand with template expression for color", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "border: 1px solid ${$colors.borderColor}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj).toHaveProperty("borderWidth");
    expect(result!.styleObj).toHaveProperty("borderStyle");
    expect(result!.styleObj).toHaveProperty("borderColor");
  });

  it("handles border-top shorthand with template expression", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "border-top: 1px solid ${$colors.borderColor}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj).toHaveProperty("borderTopWidth");
    expect(result!.styleObj).toHaveProperty("borderTopStyle");
    expect(result!.styleObj).toHaveProperty("borderTopColor");
  });

  it("returns null for unsupported shorthands with template expressions", () => {
    for (const shorthand of UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR) {
      const result = parseCssDeclarationBlockWithTemplateExpr(`${shorthand}: \${spacing}`, api);
      expect(result).toBeNull();
    }
  });

  it("handles mixed static and template expression values", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "display: flex; color: ${$colors.primary}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    expect(result!.styleObj.display).toBe("flex");
    expect((result!.styleObj.color as any).type).toBe("TemplateLiteral");
  });

  it("handles template expressions with member access", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "background-color: ${theme.colors.bg}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
    const tpl = result!.styleObj.backgroundColor as any;
    expect(tpl.type).toBe("TemplateLiteral");
    expect(tpl.expressions).toHaveLength(1);
    expect(tpl.expressions[0].type).toBe("MemberExpression");
  });

  it("handles template expression with surrounding static text", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr("content: '${label}'", api);
    expect(result).toBeDefined();
    expect(result!.hasTemplateValues).toBe(true);
  });

  it("coerces numeric static values", () => {
    const result = parseCssDeclarationBlockWithTemplateExpr(
      "opacity: 0.5; color: ${$colors.text}",
      api,
    );
    expect(result).toBeDefined();
    expect(result!.styleObj.opacity).toBe(0.5);
  });
});

describe("UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR", () => {
  it("contains the expected shorthands", () => {
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("margin")).toBe(true);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("padding")).toBe(true);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("background")).toBe(true);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("scroll-margin")).toBe(true);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("scroll-padding")).toBe(true);
  });

  it("does not include non-shorthand properties", () => {
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("color")).toBe(false);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("font-size")).toBe(false);
    expect(UNSUPPORTED_SHORTHANDS_FOR_TEMPLATE_EXPR.has("border")).toBe(false);
  });
});
