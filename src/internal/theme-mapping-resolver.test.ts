import { describe, expect, it } from "vitest";
import { resolveThemeFromMapping, THEME_MAPPING_NO_MATCH } from "./theme-mapping-resolver.js";
import type { ThemeMapping } from "../adapter.js";

describe("resolveThemeFromMapping", () => {
  // ── Exact match ──────────────────────────────────────────────────────

  it("returns resolve entry on exact path match", () => {
    const imports = [
      {
        from: { kind: "specifier" as const, value: "./tokens.stylex" },
        names: [{ imported: "$colors" }],
      },
    ];
    const mapping: ThemeMapping = [["color", { expr: "$colors", imports }]];
    const result = resolveThemeFromMapping(mapping, { path: "color" });
    expect(result).toEqual({ expr: "$colors", imports });
  });

  it("does not match exact pattern against longer path", () => {
    const mapping: ThemeMapping = [["color", { expr: "$colors", imports: [] }]];
    expect(resolveThemeFromMapping(mapping, { path: "color.labelBase" })).toBe(
      THEME_MAPPING_NO_MATCH,
    );
  });

  // ── Prefix match ─────────────────────────────────────────────────────

  it("matches prefix pattern and interpolates {property}", () => {
    const mapping: ThemeMapping = [["color.*", { expr: "$colors.{property}", imports: [] }]];
    const result = resolveThemeFromMapping(mapping, { path: "color.labelBase" });
    expect(result).toEqual({ expr: "$colors.labelBase", imports: [] });
  });

  it("matches prefix pattern against exact prefix (empty property)", () => {
    const mapping: ThemeMapping = [["color.*", { expr: "$colors.{property}", imports: [] }]];
    const result = resolveThemeFromMapping(mapping, { path: "color" });
    expect(result).toEqual({ expr: "$colors.", imports: [] });
  });

  it("does not match prefix pattern against unrelated path", () => {
    const mapping: ThemeMapping = [["color.*", { expr: "$colors.{property}", imports: [] }]];
    expect(resolveThemeFromMapping(mapping, { path: "spacing.sm" })).toBe(THEME_MAPPING_NO_MATCH);
  });

  // ── Wildcard match ───────────────────────────────────────────────────

  it("matches wildcard pattern and uses last segment as property", () => {
    const mapping: ThemeMapping = [["*", { expr: "$tokens.{property}", imports: [] }]];
    expect(resolveThemeFromMapping(mapping, { path: "color.labelBase" })).toEqual({
      expr: "$tokens.labelBase",
      imports: [],
    });
  });

  it("wildcard with no dots uses full path as property", () => {
    const mapping: ThemeMapping = [["*", { expr: "$tokens.{property}", imports: [] }]];
    expect(resolveThemeFromMapping(mapping, { path: "primary" })).toEqual({
      expr: "$tokens.primary",
      imports: [],
    });
  });

  // ── First match wins ─────────────────────────────────────────────────

  it("returns first matching entry", () => {
    const mapping: ThemeMapping = [
      ["color", { expr: "FIRST", imports: [] }],
      ["color", { expr: "SECOND", imports: [] }],
    ];
    const result = resolveThemeFromMapping(mapping, { path: "color" });
    expect(result).toEqual({ expr: "FIRST", imports: [] });
  });

  // ── Bail entry ───────────────────────────────────────────────────────

  it("returns undefined for bail entry", () => {
    const mapping: ThemeMapping = [
      ["baseTheme.*", { bail: true }],
      ["*", { expr: "$tokens.{property}", imports: [] }],
    ];
    expect(resolveThemeFromMapping(mapping, { path: "baseTheme.foo" })).toBeUndefined();
  });

  // ── Indexed guard ────────────────────────────────────────────────────

  it("skips indexed entry when ctx.indexedLookup is false", () => {
    const mapping: ThemeMapping = [
      ["color", { indexed: true, expr: "$mixin.{cssProperty}", imports: [] }],
      ["color", { expr: "$colors", imports: [] }],
    ];
    const result = resolveThemeFromMapping(mapping, { path: "color", indexedLookup: false });
    expect(result).toEqual({ expr: "$colors", imports: [] });
  });

  it("matches indexed entry when ctx.indexedLookup is true", () => {
    const mapping: ThemeMapping = [
      [
        "color",
        {
          indexed: true,
          usage: "props",
          dynamicArgUsage: "memberAccess",
          expr: "$mixin.{cssProperty}",
          imports: [],
        },
      ],
      ["color", { expr: "$colors", imports: [] }],
    ];
    const result = resolveThemeFromMapping(mapping, {
      path: "color",
      indexedLookup: true,
      cssProperty: "background-color",
    });
    expect(result).toEqual({
      expr: "$mixin.backgroundColor",
      imports: [],
      usage: "props",
      dynamicArgUsage: "memberAccess",
    });
  });

  // ── Directional entry ────────────────────────────────────────────────

  it("returns directional result", () => {
    const directional = [
      { prop: "paddingBlock", expr: "$spacing.block", imports: [] },
      { prop: "paddingInline", expr: "$spacing.inline", imports: [] },
    ];
    const mapping: ThemeMapping = [["inputPadding", { directional, cssProperties: ["padding"] }]];
    const result = resolveThemeFromMapping(mapping, {
      path: "inputPadding",
      cssProperty: "padding",
    });
    expect(result).toEqual({ directional });
  });

  it("skips directional entry when cssProperty does not match", () => {
    const mapping: ThemeMapping = [
      ["inputPadding", { directional: [], cssProperties: ["padding"] }],
    ];
    expect(resolveThemeFromMapping(mapping, { path: "inputPadding", cssProperty: "margin" })).toBe(
      THEME_MAPPING_NO_MATCH,
    );
  });

  it("skips directional entry when cssProperty is absent and cssProperties is set", () => {
    const mapping: ThemeMapping = [
      ["inputPadding", { directional: [], cssProperties: ["padding"] }],
    ];
    expect(resolveThemeFromMapping(mapping, { path: "inputPadding" })).toBe(THEME_MAPPING_NO_MATCH);
  });

  // ── Placeholder interpolation ────────────────────────────────────────

  it("interpolates {cssProperty} with camelCase conversion", () => {
    const mapping: ThemeMapping = [["*", { expr: "$m.{cssProperty}", imports: [] }]];
    const result = resolveThemeFromMapping(mapping, {
      path: "color.x",
      cssProperty: "border-top-color",
    });
    expect(result).toEqual({ expr: "$m.borderTopColor", imports: [] });
  });

  it("interpolates {cssProperty} as empty string when absent", () => {
    const mapping: ThemeMapping = [["*", { expr: "$m.{cssProperty}", imports: [] }]];
    const result = resolveThemeFromMapping(mapping, { path: "foo" });
    expect(result).toEqual({ expr: "$m.", imports: [] });
  });

  // ── No match ─────────────────────────────────────────────────────────

  it("returns THEME_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: ThemeMapping = [["color", { expr: "$colors", imports: [] }]];
    expect(resolveThemeFromMapping(mapping, { path: "spacing" })).toBe(THEME_MAPPING_NO_MATCH);
  });

  it("returns THEME_MAPPING_NO_MATCH for empty mapping", () => {
    expect(resolveThemeFromMapping([], { path: "anything" })).toBe(THEME_MAPPING_NO_MATCH);
  });

  // ── Usage and dynamicArgUsage passthrough ────────────────────────────

  it("passes through usage field", () => {
    const mapping: ThemeMapping = [["color", { expr: "$c", imports: [], usage: "props" }]];
    const result = resolveThemeFromMapping(mapping, { path: "color" });
    expect(result).toHaveProperty("usage", "props");
  });

  it("passes through dynamicArgUsage field", () => {
    const mapping: ThemeMapping = [
      ["color", { expr: "$c", imports: [], dynamicArgUsage: "memberAccess" }],
    ];
    const result = resolveThemeFromMapping(mapping, { path: "color" });
    expect(result).toHaveProperty("dynamicArgUsage", "memberAccess");
  });
});
