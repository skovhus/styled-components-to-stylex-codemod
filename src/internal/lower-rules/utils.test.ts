import { describe, it, expect } from "vitest";
import type { ImportSpec } from "../../adapter.js";
import {
  isSupportedAtRule,
  findSupportedAtRule,
  hasUnsupportedAtRule,
  isStyleConditionKey,
  mergeMediaIntoStyles,
  mergeStyleObjects,
  resolveMediaAtRulePlaceholders,
} from "./utils.js";

describe("isSupportedAtRule", () => {
  it("supports StyleX condition at-rules", () => {
    expect(isSupportedAtRule("@media (min-width: 768px)")).toBe(true);
    expect(isSupportedAtRule("@container (min-width: 500px)")).toBe(true);
    expect(isSupportedAtRule("@supports (display: grid)")).toBe(true);
  });

  it("rejects unsupported at-rules", () => {
    expect(isSupportedAtRule("@keyframes fade")).toBe(false);
    expect(isSupportedAtRule("@font-face")).toBe(false);
  });
});

describe("findSupportedAtRule", () => {
  it("returns a single supported condition", () => {
    expect(findSupportedAtRule(["@media (min-width: 768px)"])).toBe("@media (min-width: 768px)");
  });

  it("combines nested @supports conditions", () => {
    expect(
      findSupportedAtRule([
        "@supports (interpolate-size: allow-keywords)",
        "@supports (height: calc-size(auto, size))",
      ]),
    ).toBe("@supports (interpolate-size: allow-keywords) and (height: calc-size(auto, size))");
  });

  it("returns undefined when no supported rules exist", () => {
    expect(findSupportedAtRule(["@keyframes fade"])).toBeUndefined();
    expect(
      findSupportedAtRule(["@supports (display: grid)", "@media (min-width: 768px)"]),
    ).toBeUndefined();
    expect(findSupportedAtRule([])).toBeUndefined();
  });
});

describe("hasUnsupportedAtRule", () => {
  it("returns false for empty and supported stacks", () => {
    expect(hasUnsupportedAtRule([])).toBe(false);
    expect(hasUnsupportedAtRule(["@supports (display: grid)"])).toBe(false);
  });

  it("returns true for unsupported or unsafe mixed stacks", () => {
    expect(hasUnsupportedAtRule(["@keyframes fade"])).toBe(true);
    expect(hasUnsupportedAtRule(["@supports (display: grid)", "@media (min-width: 768px)"])).toBe(
      true,
    );
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
  const screenSizeBreakpointPhoneExpr = {
    type: "MemberExpression",
    object: { type: "Identifier", name: "screenSizeBreakPoints" },
    property: { type: "Identifier", name: "phone" },
    computed: false,
  };

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

  it("passes structured media-query context to resolveSelector for defineConsts media keys", () => {
    const resolverImports = new Map<string, ImportSpec>();
    const keyExpr = { type: "MemberExpression" };
    const imports: ImportSpec[] = [
      {
        from: { kind: "specifier", value: "./lib/breakpoints.stylex" },
        names: [{ imported: "breakpoints" }],
      },
    ];

    const result = resolveMediaAtRulePlaceholders(
      "@media (min-width: __SC_EXPR_0__px)",
      () => screenSizeBreakpointPhoneExpr,
      {
        lookupImport: (localName) =>
          localName === "screenSizeBreakPoints"
            ? {
                importedName: "screenSizeBreakPoints",
                source: { kind: "specifier", value: "./lib/helpers" },
              }
            : null,
        resolveValue: () => undefined,
        resolveSelector: (ctx) => {
          expect(ctx).toMatchObject({
            kind: "mediaQueryInterpolation",
            mediaQuery: {
              atRule: "@media (min-width: __SC_EXPR_0__px)",
              slotId: 0,
              before: "@media (min-width: ",
              after: "px)",
              feature: { modifier: "min", name: "width", unit: "px" },
            },
          });
          return { kind: "media", expr: "breakpoints.phoneMin", imports };
        },
        parseExpr: (expr) => {
          expect(expr).toBe("breakpoints.phoneMin");
          return keyExpr;
        },
        filePath: "test.tsx",
        resolverImports,
      },
    );

    expect(result).toEqual({ kind: "computed", keyExpr, imports });
    expect([...resolverImports.values()]).toEqual(imports);
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

  it("returns null when an imported media placeholder only resolves to an expression", () => {
    const resolverImports = new Map<string, ImportSpec>();
    const imports: ImportSpec[] = [
      {
        from: { kind: "specifier", value: "./lib/breakpoints.stylex" },
        names: [{ imported: "breakpointValues" }],
      },
    ];

    const result = resolveMediaAtRulePlaceholders(
      "@media (min-width: __SC_EXPR_0__px)",
      () => screenSizeBreakpointPhoneExpr,
      {
        lookupImport: (localName) =>
          localName === "screenSizeBreakPoints"
            ? {
                importedName: "screenSizeBreakPoints",
                source: { kind: "specifier", value: "./lib/helpers" },
              }
            : null,
        resolveValue: (ctx) =>
          ctx.kind === "importedValue" &&
          ctx.importedName === "screenSizeBreakPoints" &&
          ctx.path === "phone"
            ? { expr: "breakpointValues.phone", imports }
            : undefined,
        parseExpr: () => {
          throw new Error("template-literal media keys must not be parsed");
        },
        filePath: "test.tsx",
        resolverImports,
      },
    );

    expect(result).toBeNull();
    expect([...resolverImports.values()]).toEqual([]);
  });
});
