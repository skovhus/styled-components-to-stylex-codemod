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
  it("supports @media and @container", () => {
    expect(isSupportedAtRule("@media (min-width: 768px)")).toBe(true);
    expect(isSupportedAtRule("@container (min-width: 500px)")).toBe(true);
  });

  it("rejects @supports, @keyframes, @font-face", () => {
    expect(isSupportedAtRule("@supports (display: grid)")).toBe(false);
    expect(isSupportedAtRule("@keyframes fade")).toBe(false);
    expect(isSupportedAtRule("@font-face")).toBe(false);
  });
});

describe("findSupportedAtRule", () => {
  it("finds first supported rule, skipping unsupported ones", () => {
    expect(findSupportedAtRule(["@supports (display: grid)", "@media (min-width: 768px)"])).toBe(
      "@media (min-width: 768px)",
    );
  });

  it("returns undefined when no supported rules exist", () => {
    expect(findSupportedAtRule(["@supports (display: grid)"])).toBeUndefined();
    expect(findSupportedAtRule([])).toBeUndefined();
  });
});

describe("isStyleConditionKey", () => {
  it("identifies pseudo-classes, pseudo-elements, @media, @container", () => {
    expect(isStyleConditionKey(":hover")).toBe(true);
    expect(isStyleConditionKey("::before")).toBe(true);
    expect(isStyleConditionKey("@media (min-width: 768px)")).toBe(true);
    expect(isStyleConditionKey("@container (min-width: 500px)")).toBe(true);
  });

  it("rejects regular CSS property names", () => {
    expect(isStyleConditionKey("color")).toBe(false);
    expect(isStyleConditionKey("default")).toBe(false);
  });
});

describe("mergeMediaIntoStyles", () => {
  it("wraps base values in { default, @media } structure", () => {
    const base: Record<string, unknown> = { color: "red" };
    mergeMediaIntoStyles(base, new Map([["@media (min-width: 768px)", { color: "blue" }]]));
    expect(base.color).toEqual({
      default: "red",
      "@media (min-width: 768px)": "blue",
    });
  });

  it("uses null as default when base has no matching property", () => {
    const base: Record<string, unknown> = {};
    mergeMediaIntoStyles(base, new Map([["@media (min-width: 768px)", { color: "blue" }]]));
    expect(base.color).toEqual({ default: null, "@media (min-width: 768px)": "blue" });
  });

  it("nests multiple media queries - later queries wrap earlier ones", () => {
    const base: Record<string, unknown> = { color: "red" };
    mergeMediaIntoStyles(
      base,
      new Map([
        ["@media (min-width: 768px)", { color: "blue" }],
        ["@media (min-width: 1024px)", { color: "green" }],
      ]),
    );
    // The second media query wraps the first one inside default
    expect(base.color).toEqual({
      default: { default: "red", "@media (min-width: 768px)": "blue" },
      "@media (min-width: 1024px)": "green",
    });
  });
});

describe("mergeStyleObjects", () => {
  it("deeply merges nested objects instead of overwriting", () => {
    const target: Record<string, unknown> = { ":hover": { color: "red" } };
    mergeStyleObjects(target, { ":hover": { backgroundColor: "blue" } });
    expect(target).toEqual({
      ":hover": { color: "red", backgroundColor: "blue" },
    });
  });

  it("overwrites when source value is a primitive, not an object", () => {
    const target: Record<string, unknown> = { ":hover": { color: "red" } };
    mergeStyleObjects(target, { ":hover": "transparent" });
    expect(target).toEqual({ ":hover": "transparent" });
  });

  it("does not merge arrays - overwrites instead", () => {
    const target: Record<string, unknown> = { items: [1, 2] };
    mergeStyleObjects(target, { items: [3, 4] });
    expect(target.items).toEqual([3, 4]);
  });

  it("copies new properties from source to target", () => {
    const target: Record<string, unknown> = { a: 1 };
    mergeStyleObjects(target, { b: 2 });
    expect(target).toEqual({ a: 1, b: 2 });
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

  it("resolves literal numeric expressions in placeholders", () => {
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

  it("returns null when slot expression is unresolvable", () => {
    const result = resolveMediaAtRulePlaceholders(
      "@media (min-width: __SC_EXPR_0__px)",
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
});
