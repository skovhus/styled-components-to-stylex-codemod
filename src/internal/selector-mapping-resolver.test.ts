import { describe, expect, it } from "vitest";
import {
  resolveSelectorFromMapping,
  SELECTOR_MAPPING_NO_MATCH,
} from "./selector-mapping-resolver.js";
import type { SelectorMapping, SelectorResolveContext } from "../adapter.js";

function makeCtx(overrides: Partial<SelectorResolveContext> = {}): SelectorResolveContext {
  return {
    kind: "selectorInterpolation",
    importedName: "screenSize",
    source: { kind: "specifier", value: "./breakpoints" },
    filePath: "/test.tsx",
    ...overrides,
  };
}

describe("resolveSelectorFromMapping", () => {
  // ── Prefix match (media) ─────────────────────────────────────────────

  it("matches prefix pattern and returns media result", () => {
    const mapping: SelectorMapping = [
      [
        "screenSize.*",
        {
          kind: "media",
          expr: "breakpoints.{property}",
          imports: [
            {
              from: { kind: "specifier", value: "./breakpoints.stylex" },
              names: [{ imported: "breakpoints" }],
            },
          ],
        },
      ],
    ];
    const result = resolveSelectorFromMapping(mapping, makeCtx({ path: "phone" }));
    expect(result).toEqual({
      kind: "media",
      expr: "breakpoints.phone",
      imports: [
        {
          from: { kind: "specifier", value: "./breakpoints.stylex" },
          names: [{ imported: "breakpoints" }],
        },
      ],
    });
  });

  it("does not match prefix pattern against unrelated name", () => {
    const mapping: SelectorMapping = [
      ["screenSize.*", { kind: "media", expr: "bp.{property}", imports: [] }],
    ];
    expect(resolveSelectorFromMapping(mapping, makeCtx({ importedName: "other", path: "x" }))).toBe(
      SELECTOR_MAPPING_NO_MATCH,
    );
  });

  // ── Exact match (pseudoAlias) ────────────────────────────────────────

  it("matches exact pattern and returns pseudoAlias result", () => {
    const mapping: SelectorMapping = [
      [
        "highlight",
        {
          kind: "pseudoAlias",
          values: ["active", "hover"],
          styleSelectorExpr: "highlightStyles",
          imports: [],
        },
      ],
    ];
    const result = resolveSelectorFromMapping(
      mapping,
      makeCtx({ importedName: "highlight", path: undefined }),
    );
    expect(result).toEqual({
      kind: "pseudoAlias",
      values: ["active", "hover"],
      styleSelectorExpr: "highlightStyles",
      imports: [],
    });
  });

  // ── pseudoExpand ─────────────────────────────────────────────────────

  it("returns pseudoExpand result", () => {
    const expansions = [{ pseudo: "active" }, { pseudo: "hover" }];
    const mapping: SelectorMapping = [
      ["highlightExpand", { kind: "pseudoExpand", expansions, imports: [] }],
    ];
    const result = resolveSelectorFromMapping(
      mapping,
      makeCtx({ importedName: "highlightExpand", path: undefined }),
    );
    expect(result).toEqual({ kind: "pseudoExpand", expansions, imports: [] });
  });

  // ── Wildcard match ───────────────────────────────────────────────────

  it("matches wildcard pattern", () => {
    const mapping: SelectorMapping = [
      ["*", { kind: "media", expr: "media.{property}", imports: [] }],
    ];
    const result = resolveSelectorFromMapping(
      mapping,
      makeCtx({ importedName: "screenSize", path: "tablet" }),
    );
    expect(result).toEqual({ kind: "media", expr: "media.tablet", imports: [] });
  });

  // ── First match wins ─────────────────────────────────────────────────

  it("returns first matching entry", () => {
    const mapping: SelectorMapping = [
      ["screenSize.*", { kind: "media", expr: "FIRST.{property}", imports: [] }],
      ["screenSize.*", { kind: "media", expr: "SECOND.{property}", imports: [] }],
    ];
    const result = resolveSelectorFromMapping(mapping, makeCtx({ path: "phone" }));
    expect(result).toEqual({ kind: "media", expr: "FIRST.phone", imports: [] });
  });

  // ── No match ─────────────────────────────────────────────────────────

  it("returns SELECTOR_MAPPING_NO_MATCH for empty mapping", () => {
    expect(resolveSelectorFromMapping([], makeCtx())).toBe(SELECTOR_MAPPING_NO_MATCH);
  });

  it("returns SELECTOR_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: SelectorMapping = [
      ["screenSize.*", { kind: "media", expr: "bp.{property}", imports: [] }],
    ];
    expect(
      resolveSelectorFromMapping(mapping, makeCtx({ importedName: "theme", path: "dark" })),
    ).toBe(SELECTOR_MAPPING_NO_MATCH);
  });

  // ── Path handling ────────────────────────────────────────────────────

  it("uses importedName alone when path is undefined", () => {
    const mapping: SelectorMapping = [
      [
        "highlight",
        { kind: "pseudoAlias", values: ["hover"], styleSelectorExpr: "hl", imports: [] },
      ],
    ];
    const result = resolveSelectorFromMapping(
      mapping,
      makeCtx({ importedName: "highlight", path: undefined }),
    );
    expect(result).toHaveProperty("kind", "pseudoAlias");
  });

  it("combines importedName and path for lookup key", () => {
    const mapping: SelectorMapping = [
      ["bp.phone", { kind: "media", expr: "breakpoints.phone", imports: [] }],
    ];
    const result = resolveSelectorFromMapping(
      mapping,
      makeCtx({ importedName: "bp", path: "phone" }),
    );
    expect(result).toEqual({ kind: "media", expr: "breakpoints.phone", imports: [] });
  });
});
