import { describe, it, expect } from "vitest";
import { wrapExprWithStaticParts } from "./interpolations.js";

describe("wrapExprWithStaticParts", () => {
  it("appends a unit suffix to a plain string-literal value", () => {
    expect(wrapExprWithStaticParts('"40"', "", "px", "height")).toBe('"40px"');
  });

  it("drops a unit suffix on a calc() value for a length property", () => {
    // `calc(40px + 8px)` is already a complete length; appending `px` would be
    // invalid CSS.
    expect(wrapExprWithStaticParts('"calc(40px + 8px)"', "", "px", "height")).toBe(
      '"calc(40px + 8px)"',
    );
  });

  it("keeps the suffix on a calc() value for a custom property", () => {
    // A custom property's value is an opaque token stream, so the trailing token
    // must be preserved rather than treated as a CSS unit.
    expect(wrapExprWithStaticParts('"var(--prefix)"', "", "in", "--token")).toBe(
      '"var(--prefix)in"',
    );
  });

  it("keeps the suffix when the property is unknown", () => {
    // Without the property, the helper cannot prove the suffix is a CSS unit, so
    // it conservatively preserves it.
    expect(wrapExprWithStaticParts('"calc(40px + 8px)"', "", "px")).toBe('"calc(40px + 8px)px"');
  });

  it("drops the suffix for any unit-shaped token, not just a fixed list", () => {
    // `svmin` (and other viewport units) need no whitelist entry — the suffix is
    // dropped because the value is a complete CSS math function.
    expect(wrapExprWithStaticParts('"calc(100% - 1rem)"', "", "svmin", "width")).toBe(
      '"calc(100% - 1rem)"',
    );
  });

  it("keeps a template-literal calc source as-is instead of appending the suffix", () => {
    expect(wrapExprWithStaticParts("`calc(${x}px + 8px)`", "", "px", "height")).toBe(
      "`calc(${x}px + 8px)`",
    );
  });
});
