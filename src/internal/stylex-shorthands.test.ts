import { describe, it, expect } from "vitest";
import { isStylexShorthandCamelCase, splitDirectionalProperty } from "./stylex-shorthands.js";

describe("isStylexShorthandCamelCase", () => {
  it("detects camelCase shorthands that map to kebab-case entries", () => {
    expect(isStylexShorthandCamelCase("borderTop")).toBe(true);
    expect(isStylexShorthandCamelCase("scrollMargin")).toBe(true);
    expect(isStylexShorthandCamelCase("scrollPadding")).toBe(true);
  });

  it("rejects longhand properties that are NOT shorthand-only", () => {
    expect(isStylexShorthandCamelCase("borderTopWidth")).toBe(false);
    expect(isStylexShorthandCamelCase("marginTop")).toBe(false);
    expect(isStylexShorthandCamelCase("paddingInline")).toBe(false);
  });

  it("rejects plain CSS properties", () => {
    expect(isStylexShorthandCamelCase("color")).toBe(false);
    expect(isStylexShorthandCamelCase("fontSize")).toBe(false);
  });
});

describe("splitDirectionalProperty", () => {
  it("returns single entry for uniform single value", () => {
    expect(splitDirectionalProperty({ prop: "padding", rawValue: "8px" })).toEqual([
      { prop: "padding", value: "8px" },
    ]);
  });

  it("uses block/inline for two-value shorthand", () => {
    expect(splitDirectionalProperty({ prop: "padding", rawValue: "4px 8px" })).toEqual([
      { prop: "paddingBlock", value: "4px" },
      { prop: "paddingInline", value: "8px" },
    ]);
  });

  it("expands three-value shorthand with CSS spec rules (top, left=right, bottom)", () => {
    const result = splitDirectionalProperty({
      prop: "margin",
      rawValue: "4px 8px 12px",
    });
    expect(result).toEqual([
      { prop: "marginTop", value: "4px" },
      { prop: "marginRight", value: "8px" },
      { prop: "marginBottom", value: "12px" },
      { prop: "marginLeft", value: "8px" },
    ]);
  });

  it("collapses identical four values back to single entry", () => {
    expect(splitDirectionalProperty({ prop: "padding", rawValue: "8px 8px 8px 8px" })).toEqual([
      { prop: "padding", value: "8px" },
    ]);
  });

  it("forces expansion with important even for single values", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "8px",
      important: true,
    });
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ prop: "paddingTop", value: "8px !important" });
  });

  it("forces expansion with alwaysExpand even for single values", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "8px",
      alwaysExpand: true,
    });
    expect(result).toHaveLength(4);
    expect(result.every((e) => e.value === "8px")).toBe(true);
  });

  it("uses inline directional props with preferInline", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "1px 2px 3px 4px",
      preferInline: true,
    });
    expect(result[1]!.prop).toBe("paddingInlineEnd");
    expect(result[3]!.prop).toBe("paddingInlineStart");
  });

  it("handles CSS functions like calc() as single values", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "calc(100% - 20px)",
    });
    expect(result).toEqual([{ prop: "padding", value: "calc(100% - 20px)" }]);
  });

  it("handles calc() in multi-value shorthand", () => {
    const result = splitDirectionalProperty({
      prop: "margin",
      rawValue: "calc(100% - 20px) 10px",
    });
    expect(result).toEqual([
      { prop: "marginBlock", value: "calc(100% - 20px)" },
      { prop: "marginInline", value: "10px" },
    ]);
  });

  it("handles numeric 0 input", () => {
    const result = splitDirectionalProperty({
      prop: "margin",
      rawValue: 0,
    });
    expect(result).toEqual([{ prop: "margin", value: "0" }]);
  });
});
