import { describe, expect, it } from "vitest";
import {
  injectRefPropIntoTypeLiteralString,
  injectStylePropsIntoTypeLiteralString,
} from "./type-helpers.js";

describe("injectRefPropIntoTypeLiteralString", () => {
  it("injects ref into empty type literal", () => {
    const result = injectRefPropIntoTypeLiteralString("{}", "HTMLDivElement");
    expect(result).toContain("ref?: React.Ref<HTMLDivElement>");
  });

  it("skips injection when ref already present", () => {
    const input = "{ ref?: React.Ref<HTMLDivElement> }";
    const result = injectRefPropIntoTypeLiteralString(input, "HTMLDivElement");
    expect(result).toBe(input);
  });
});

describe("injectStylePropsIntoTypeLiteralString", () => {
  it("injects className into empty type literal", () => {
    const result = injectStylePropsIntoTypeLiteralString("{}", { className: true });
    expect(result).toBe("{ className?: string }");
  });

  it("injects style into empty type literal", () => {
    const result = injectStylePropsIntoTypeLiteralString("{}", { style: true });
    expect(result).toBe("{ style?: React.CSSProperties }");
  });

  it("injects both props into empty type literal", () => {
    const result = injectStylePropsIntoTypeLiteralString("{}", { className: true, style: true });
    expect(result).toBe("{ className?: string, style?: React.CSSProperties }");
  });

  it("skips injection when optional className already present", () => {
    const input = "{ className?: string }";
    const result = injectStylePropsIntoTypeLiteralString(input, { className: true });
    expect(result).toBe(input);
  });

  it("skips injection when optional style already present", () => {
    const input = "{ style?: React.CSSProperties }";
    const result = injectStylePropsIntoTypeLiteralString(input, { style: true });
    expect(result).toBe(input);
  });

  // Bug fix: Should also detect REQUIRED props, not just optional ones
  // See: https://github.com/skovhus/styled-components-to-stylex-codemod/pull/147#discussion_r2769010103
  it("skips injection when required className already present", () => {
    const input = "{ className: string }";
    const result = injectStylePropsIntoTypeLiteralString(input, { className: true });
    // Should not add duplicate className
    expect(result).toBe(input);
  });

  it("skips injection when required style already present", () => {
    const input = "{ style: React.CSSProperties }";
    const result = injectStylePropsIntoTypeLiteralString(input, { style: true });
    // Should not add duplicate style
    expect(result).toBe(input);
  });

  it("injects into type literal with other props", () => {
    const input = "{ foo: string }";
    const result = injectStylePropsIntoTypeLiteralString(input, { className: true });
    expect(result).toContain("className?: string");
    expect(result).toContain("foo: string");
  });

  it("handles intersection fallback for non-literal types", () => {
    const result = injectStylePropsIntoTypeLiteralString("SomeType", { className: true });
    expect(result).toBe("SomeType & { className?: string }");
  });
});
