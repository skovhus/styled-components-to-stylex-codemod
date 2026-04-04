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
  it("builds lookup key from importedName.path and returns media result", () => {
    const mapping: SelectorMapping = [
      ["screenSize.*", { kind: "media", expr: "breakpoints.{property}", imports: [] }],
    ];
    const result = resolveSelectorFromMapping(mapping, makeCtx({ path: "phone" }));
    expect(result).toEqual({ kind: "media", expr: "breakpoints.phone", imports: [] });
  });

  it("uses importedName alone when path is undefined (pseudoAlias)", () => {
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

  it("returns SELECTOR_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: SelectorMapping = [
      ["screenSize.*", { kind: "media", expr: "bp.{property}", imports: [] }],
    ];
    expect(
      resolveSelectorFromMapping(mapping, makeCtx({ importedName: "theme", path: "dark" })),
    ).toBe(SELECTOR_MAPPING_NO_MATCH);
  });
});
