import { describe, it, expect } from "vitest";
import {
  isSupportedAtRule,
  findSupportedAtRule,
  isStyleConditionKey,
  mergeMediaIntoStyles,
  mergeStyleObjects,
  resolveMediaAtRulePlaceholders,
} from "./utils.js";

describe("isSupportedAtRule", () => {
  it("returns true for @media", () => {
    expect(isSupportedAtRule("@media (min-width: 768px)")).toBe(true);
  });

  it("returns true for @container", () => {
    expect(isSupportedAtRule("@container (min-width: 500px)")).toBe(true);
  });

  it("returns false for @supports", () => {
    expect(isSupportedAtRule("@supports (display: grid)")).toBe(false);
  });

  it("returns false for @keyframes", () => {
    expect(isSupportedAtRule("@keyframes fade")).toBe(false);
  });

  it("returns false for @font-face", () => {
    expect(isSupportedAtRule("@font-face")).toBe(false);
  });
});

describe("findSupportedAtRule", () => {
  it("returns the first @media rule", () => {
    const result = findSupportedAtRule(["@supports (display: grid)", "@media (min-width: 768px)"]);
    expect(result).toBe("@media (min-width: 768px)");
  });

  it("returns the first @container rule", () => {
    const result = findSupportedAtRule(["@container (min-width: 500px)"]);
    expect(result).toBe("@container (min-width: 500px)");
  });

  it("returns undefined when no supported rules exist", () => {
    const result = findSupportedAtRule(["@supports (display: grid)", "@keyframes fade"]);
    expect(result).toBeUndefined();
  });

  it("returns undefined for empty array", () => {
    expect(findSupportedAtRule([])).toBeUndefined();
  });
});

describe("isStyleConditionKey", () => {
  it("returns true for pseudo-class selectors", () => {
    expect(isStyleConditionKey(":hover")).toBe(true);
    expect(isStyleConditionKey(":focus")).toBe(true);
    expect(isStyleConditionKey(":active")).toBe(true);
  });

  it("returns true for pseudo-element selectors", () => {
    expect(isStyleConditionKey("::before")).toBe(true);
    expect(isStyleConditionKey("::after")).toBe(true);
  });

  it("returns true for @media queries", () => {
    expect(isStyleConditionKey("@media (min-width: 768px)")).toBe(true);
  });

  it("returns true for @container queries", () => {
    expect(isStyleConditionKey("@container (min-width: 500px)")).toBe(true);
  });

  it("returns false for regular property names", () => {
    expect(isStyleConditionKey("color")).toBe(false);
    expect(isStyleConditionKey("fontSize")).toBe(false);
    expect(isStyleConditionKey("default")).toBe(false);
  });
});

describe("mergeMediaIntoStyles", () => {
  it("merges media styles into base with default fallback", () => {
    const base: Record<string, unknown> = { color: "red" };
    const mediaStyles = new Map([["@media (min-width: 768px)", { color: "blue" }]]);
    mergeMediaIntoStyles(base, mediaStyles);
    expect(base.color).toEqual({
      default: "red",
      "@media (min-width: 768px)": "blue",
    });
  });

  it("uses null as default when base has no matching property", () => {
    const base: Record<string, unknown> = {};
    const mediaStyles = new Map([["@media (min-width: 768px)", { color: "blue" }]]);
    mergeMediaIntoStyles(base, mediaStyles);
    expect(base.color).toEqual({
      default: null,
      "@media (min-width: 768px)": "blue",
    });
  });

  it("handles multiple media queries", () => {
    const base: Record<string, unknown> = { color: "red" };
    const mediaStyles = new Map([
      ["@media (min-width: 768px)", { color: "blue" }],
      ["@media (min-width: 1024px)", { color: "green" }],
    ]);
    mergeMediaIntoStyles(base, mediaStyles);
    expect(base.color).toEqual({
      default: {
        default: "red",
        "@media (min-width: 768px)": "blue",
      },
      "@media (min-width: 1024px)": "green",
    });
  });

  it("handles multiple properties across media queries", () => {
    const base: Record<string, unknown> = { color: "red", fontSize: "16px" };
    const mediaStyles = new Map([
      ["@media (min-width: 768px)", { color: "blue", fontSize: "20px" }],
    ]);
    mergeMediaIntoStyles(base, mediaStyles);
    expect(base.color).toEqual({
      default: "red",
      "@media (min-width: 768px)": "blue",
    });
    expect(base.fontSize).toEqual({
      default: "16px",
      "@media (min-width: 768px)": "20px",
    });
  });
});

describe("mergeStyleObjects", () => {
  it("copies simple properties from source to target", () => {
    const target: Record<string, unknown> = { a: 1 };
    const source: Record<string, unknown> = { b: 2 };
    mergeStyleObjects(target, source);
    expect(target).toEqual({ a: 1, b: 2 });
  });

  it("overwrites existing primitive values", () => {
    const target: Record<string, unknown> = { color: "red" };
    const source: Record<string, unknown> = { color: "blue" };
    mergeStyleObjects(target, source);
    expect(target).toEqual({ color: "blue" });
  });

  it("deeply merges nested objects", () => {
    const target: Record<string, unknown> = {
      ":hover": { color: "red" },
    };
    const source: Record<string, unknown> = {
      ":hover": { backgroundColor: "blue" },
    };
    mergeStyleObjects(target, source);
    expect(target).toEqual({
      ":hover": { color: "red", backgroundColor: "blue" },
    });
  });

  it("overwrites when source value is not a plain object", () => {
    const target: Record<string, unknown> = {
      ":hover": { color: "red" },
    };
    const source: Record<string, unknown> = {
      ":hover": "transparent",
    };
    mergeStyleObjects(target, source);
    expect(target).toEqual({ ":hover": "transparent" });
  });

  it("overwrites when target value is not a plain object", () => {
    const target: Record<string, unknown> = {
      color: "red",
    };
    const source: Record<string, unknown> = {
      color: { default: "red", ":hover": "blue" },
    };
    mergeStyleObjects(target, source);
    expect(target.color).toEqual({ default: "red", ":hover": "blue" });
  });

  it("does not merge arrays", () => {
    const target: Record<string, unknown> = { items: [1, 2] };
    const source: Record<string, unknown> = { items: [3, 4] };
    mergeStyleObjects(target, source);
    expect(target.items).toEqual([3, 4]);
  });
});

describe("resolveMediaAtRulePlaceholders", () => {
  it("returns static value for media without placeholders", () => {
    const result = resolveMediaAtRulePlaceholders("@media (min-width: 768px)", () => null, {
      lookupImport: () => null,
      resolveValue: () => undefined,
      filePath: "test.tsx",
      resolverImports: new Map(),
    });
    expect(result).toEqual({ kind: "static", value: "@media (min-width: 768px)" });
  });

  it("returns null when placeholder cannot be resolved", () => {
    const result = resolveMediaAtRulePlaceholders(
      "@media (min-width: __SC_EXPR_0__)px",
      () => null,
      {
        lookupImport: () => null,
        resolveValue: () => undefined,
        filePath: "test.tsx",
        resolverImports: new Map(),
      },
    );
    expect(result).toBeNull();
  });

  it("resolves a single placeholder to a static value via literal", () => {
    const result = resolveMediaAtRulePlaceholders(
      "@media (min-width: __SC_EXPR_0__px)",
      () => ({ type: "NumericLiteral", value: 768 }),
      {
        lookupImport: () => null,
        resolveValue: () => undefined,
        filePath: "test.tsx",
        resolverImports: new Map(),
      },
    );
    expect(result).toEqual({ kind: "static", value: "@media (min-width: 768px)" });
  });
});
