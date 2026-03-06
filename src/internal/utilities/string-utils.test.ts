import { describe, it, expect } from "vitest";
import { looksLikeLength, isBackgroundImageValue, kebabToCamelCase } from "./string-utils.js";

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

  it("BUG: does not recognize CSS keyword border-widths", () => {
    // CSS border-width accepts keywords thin/medium/thick which are lengths,
    // but looksLikeLength only matches numeric patterns.
    // This means classifyBorderSlotRole in borders.ts would misclassify
    // "thin" as a color instead of a width.
    expect(looksLikeLength("thin")).toBe(false);
    expect(looksLikeLength("medium")).toBe(false);
    expect(looksLikeLength("thick")).toBe(false);
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
