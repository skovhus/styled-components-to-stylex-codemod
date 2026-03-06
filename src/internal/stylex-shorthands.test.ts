import { describe, it, expect } from "vitest";
import {
  isStylexLonghandOnlyShorthand,
  isStylexShorthandCamelCase,
  splitDirectionalProperty,
} from "./stylex-shorthands.js";

describe("isStylexLonghandOnlyShorthand", () => {
  it("returns true for border", () => {
    expect(isStylexLonghandOnlyShorthand("border")).toBe(true);
  });

  it("returns true for directional border", () => {
    expect(isStylexLonghandOnlyShorthand("border-top")).toBe(true);
    expect(isStylexLonghandOnlyShorthand("border-right")).toBe(true);
    expect(isStylexLonghandOnlyShorthand("border-bottom")).toBe(true);
    expect(isStylexLonghandOnlyShorthand("border-left")).toBe(true);
  });

  it("returns true for margin and padding", () => {
    expect(isStylexLonghandOnlyShorthand("margin")).toBe(true);
    expect(isStylexLonghandOnlyShorthand("padding")).toBe(true);
  });

  it("returns true for scroll-margin and scroll-padding", () => {
    expect(isStylexLonghandOnlyShorthand("scroll-margin")).toBe(true);
    expect(isStylexLonghandOnlyShorthand("scroll-padding")).toBe(true);
  });

  it("returns false for non-shorthand properties", () => {
    expect(isStylexLonghandOnlyShorthand("color")).toBe(false);
    expect(isStylexLonghandOnlyShorthand("font-size")).toBe(false);
    expect(isStylexLonghandOnlyShorthand("margin-top")).toBe(false);
  });
});

describe("isStylexShorthandCamelCase", () => {
  it("returns true for camelCase shorthand", () => {
    expect(isStylexShorthandCamelCase("borderTop")).toBe(true);
    expect(isStylexShorthandCamelCase("scrollMargin")).toBe(true);
    expect(isStylexShorthandCamelCase("scrollPadding")).toBe(true);
  });

  it("returns false for non-shorthand camelCase", () => {
    expect(isStylexShorthandCamelCase("color")).toBe(false);
    expect(isStylexShorthandCamelCase("fontSize")).toBe(false);
    expect(isStylexShorthandCamelCase("marginTop")).toBe(false);
  });
});

describe("splitDirectionalProperty", () => {
  it("returns single entry for one-value shorthand", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "8px",
    });
    expect(result).toEqual([{ prop: "padding", value: "8px" }]);
  });

  it("splits two-value shorthand into block and inline", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "4px 8px",
    });
    expect(result).toEqual([
      { prop: "paddingBlock", value: "4px" },
      { prop: "paddingInline", value: "8px" },
    ]);
  });

  it("splits three-value shorthand into four directions", () => {
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

  it("splits four-value shorthand into four directions", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "1px 2px 3px 4px",
    });
    expect(result).toEqual([
      { prop: "paddingTop", value: "1px" },
      { prop: "paddingRight", value: "2px" },
      { prop: "paddingBottom", value: "3px" },
      { prop: "paddingLeft", value: "4px" },
    ]);
  });

  it("adds !important to each direction when important is true", () => {
    const result = splitDirectionalProperty({
      prop: "margin",
      rawValue: "4px 8px",
      important: true,
    });
    expect(result).toEqual([
      { prop: "marginTop", value: "4px !important" },
      { prop: "marginRight", value: "8px !important" },
      { prop: "marginBottom", value: "4px !important" },
      { prop: "marginLeft", value: "8px !important" },
    ]);
  });

  it("uses inline directional props with preferInline", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "1px 2px 3px 4px",
      preferInline: true,
    });
    expect(result).toEqual([
      { prop: "paddingTop", value: "1px" },
      { prop: "paddingInlineEnd", value: "2px" },
      { prop: "paddingBottom", value: "3px" },
      { prop: "paddingInlineStart", value: "4px" },
    ]);
  });

  it("handles numeric values", () => {
    const result = splitDirectionalProperty({
      prop: "margin",
      rawValue: 0,
    });
    expect(result).toEqual([{ prop: "margin", value: "0" }]);
  });

  it("always expands with alwaysExpand even for single value", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "8px",
      alwaysExpand: true,
    });
    expect(result).toEqual([
      { prop: "paddingTop", value: "8px" },
      { prop: "paddingRight", value: "8px" },
      { prop: "paddingBottom", value: "8px" },
      { prop: "paddingLeft", value: "8px" },
    ]);
  });

  it("handles scrollMargin", () => {
    const result = splitDirectionalProperty({
      prop: "scrollMargin",
      rawValue: "4px 8px",
    });
    expect(result).toEqual([
      { prop: "scrollMarginBlock", value: "4px" },
      { prop: "scrollMarginInline", value: "8px" },
    ]);
  });

  it("handles scrollPadding", () => {
    const result = splitDirectionalProperty({
      prop: "scrollPadding",
      rawValue: "4px 8px",
    });
    expect(result).toEqual([
      { prop: "scrollPaddingBlock", value: "4px" },
      { prop: "scrollPaddingInline", value: "8px" },
    ]);
  });

  it("collapses identical values to single entry", () => {
    const result = splitDirectionalProperty({
      prop: "padding",
      rawValue: "8px 8px 8px 8px",
    });
    expect(result).toEqual([{ prop: "padding", value: "8px" }]);
  });
});
