import { describe, it, expect } from "vitest";
import {
  looksLikeLength,
  isBackgroundImageValue,
  isSingleBackgroundComponent,
  isJSDocBlockComment,
  isStyleSectionMarkerComment,
  kebabToCamelCase,
  camelToKebabCase,
} from "./string-utils.js";

describe("looksLikeLength", () => {
  it("matches numeric values with common CSS units", () => {
    expect(looksLikeLength("10px")).toBe(true);
    expect(looksLikeLength("1.5rem")).toBe(true);
    expect(looksLikeLength("100%")).toBe(true);
    expect(looksLikeLength("50vh")).toBe(true);
    expect(looksLikeLength("2em")).toBe(true);
  });

  it("matches unitless numbers (e.g. line-height, flex)", () => {
    expect(looksLikeLength("0")).toBe(true);
    expect(looksLikeLength("1")).toBe(true);
    expect(looksLikeLength("1.5")).toBe(true);
  });

  it("matches leading-dot decimals", () => {
    expect(looksLikeLength(".5")).toBe(true);
    expect(looksLikeLength(".5px")).toBe(true);
  });

  it("matches negative values", () => {
    expect(looksLikeLength("-10px")).toBe(true);
    expect(looksLikeLength("-1.5rem")).toBe(true);
  });

  it("rejects CSS color keywords", () => {
    expect(looksLikeLength("red")).toBe(false);
    expect(looksLikeLength("blue")).toBe(false);
    expect(looksLikeLength("transparent")).toBe(false);
  });

  it("rejects CSS non-length keywords", () => {
    expect(looksLikeLength("auto")).toBe(false);
    expect(looksLikeLength("none")).toBe(false);
    expect(looksLikeLength("inherit")).toBe(false);
  });

  it("recognizes CSS keyword border-widths", () => {
    expect(looksLikeLength("thin")).toBe(true);
    expect(looksLikeLength("medium")).toBe(true);
    expect(looksLikeLength("thick")).toBe(true);
  });

  it("matches modern CSS viewport units", () => {
    expect(looksLikeLength("100svh")).toBe(true);
    expect(looksLikeLength("50dvw")).toBe(true);
    expect(looksLikeLength("80cqw")).toBe(true);
  });
});

describe("isBackgroundImageValue", () => {
  it("detects gradient functions", () => {
    expect(isBackgroundImageValue("linear-gradient(red, blue)")).toBe(true);
    expect(isBackgroundImageValue("radial-gradient(circle, red, blue)")).toBe(true);
    expect(isBackgroundImageValue("conic-gradient(red, blue)")).toBe(true);
    expect(isBackgroundImageValue("repeating-linear-gradient(red, blue)")).toBe(true);
  });

  it("detects url() values", () => {
    expect(isBackgroundImageValue("url(image.png)")).toBe(true);
    expect(isBackgroundImageValue("url('image.png')")).toBe(true);
  });

  it("rejects plain colors", () => {
    expect(isBackgroundImageValue("#fff")).toBe(false);
    expect(isBackgroundImageValue("red")).toBe(false);
    expect(isBackgroundImageValue("rgb(255, 0, 0)")).toBe(false);
  });
});

describe("isSingleBackgroundComponent", () => {
  it("accepts values that map to one background longhand", () => {
    expect(isSingleBackgroundComponent("red")).toBe(true);
    expect(isSingleBackgroundComponent("rgb(255, 0, 0)")).toBe(true);
    expect(isSingleBackgroundComponent("linear-gradient(red, blue)")).toBe(true);
    expect(isSingleBackgroundComponent("url('image.png')")).toBe(true);
  });

  it("rejects multi-component background shorthands", () => {
    expect(isSingleBackgroundComponent("red url('image.png') no-repeat")).toBe(false);
    expect(isSingleBackgroundComponent("url('image.png') center / cover")).toBe(false);
    expect(isSingleBackgroundComponent("linear-gradient(red, blue), green")).toBe(false);
  });
});

describe("isStyleSectionMarkerComment", () => {
  it("matches comments that only mark style sections", () => {
    expect(isStyleSectionMarkerComment(" -- Styled Components")).toBe(true);
    expect(isStyleSectionMarkerComment(" - Styles")).toBe(true);
    expect(isStyleSectionMarkerComment("--- styles ---")).toBe(true);
  });

  it("rejects descriptive style comments", () => {
    expect(isStyleSectionMarkerComment("Page wrapper with padding")).toBe(false);
    expect(isStyleSectionMarkerComment("Styles depend on responsive props")).toBe(false);
  });
});

describe("isJSDocBlockComment", () => {
  it("matches block comments whose body starts with a JSDoc marker", () => {
    expect(isJSDocBlockComment({ type: "CommentBlock", value: "* Docs" })).toBe(true);
  });

  it("rejects line comments and regular block comments", () => {
    expect(isJSDocBlockComment({ type: "CommentLine", value: "Docs" })).toBe(false);
    expect(isJSDocBlockComment({ type: "CommentBlock", value: " regular block " })).toBe(false);
  });
});

describe("kebabToCamelCase", () => {
  it("converts kebab-case to camelCase", () => {
    expect(kebabToCamelCase("focus-visible")).toBe("focusVisible");
    expect(kebabToCamelCase("border-top-width")).toBe("borderTopWidth");
  });

  it("returns single-word strings unchanged", () => {
    expect(kebabToCamelCase("hover")).toBe("hover");
    expect(kebabToCamelCase("color")).toBe("color");
  });
});

describe("camelToKebabCase", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebabCase("backgroundColor")).toBe("background-color");
    expect(camelToKebabCase("borderTopWidth")).toBe("border-top-width");
  });

  it("returns single-word strings unchanged", () => {
    expect(camelToKebabCase("padding")).toBe("padding");
    expect(camelToKebabCase("color")).toBe("color");
  });

  it("treats leading uppercase as a vendor prefix marker", () => {
    expect(camelToKebabCase("WebkitAppearance")).toBe("-webkit-appearance");
    expect(camelToKebabCase("MozAppearance")).toBe("-moz-appearance");
  });

  it("preserves CSS custom property prefixes", () => {
    expect(camelToKebabCase("--my-color")).toBe("--my-color");
    expect(camelToKebabCase("--background")).toBe("--background");
  });
});
