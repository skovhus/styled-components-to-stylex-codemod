import { describe, expect, it } from "vitest";
import { wrapExprWithStaticParts } from "../internal/lower-rules/interpolations";

describe("wrapExprWithStaticParts", () => {
  it("parenthesizes negated non-atomic px expressions", () => {
    expect(wrapExprWithStaticParts("props.$large ? 12 : 8", "-", "px", "marginBottom")).toBe(
      "-(props.$large ? 12 : 8)",
    );
    expect(
      wrapExprWithStaticParts("props.$gutter ?? DEFAULT_GUTTER", "-", "px", "marginBottom"),
    ).toBe("-(props.$gutter ?? DEFAULT_GUTTER)");
  });

  it("negates static numeric px literals", () => {
    expect(wrapExprWithStaticParts("44", "-", "px", "marginBottom")).toBe("-44");
  });

  it("emits bare numbers for positive px expressions", () => {
    expect(wrapExprWithStaticParts("props.$size ?? 44", "", "px", "height")).toBe(
      "props.$size ?? 44",
    );
  });
});
