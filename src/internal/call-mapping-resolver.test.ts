import { describe, expect, it } from "vitest";
import { resolveCallFromMapping, CALL_MAPPING_NO_MATCH } from "./call-mapping-resolver.js";
import type { CallMapping, CallResolveContext } from "../adapter.js";

function makeCtx(overrides: Partial<CallResolveContext> = {}): CallResolveContext {
  return {
    callSiteFilePath: "/test.tsx",
    calleeImportedName: "color",
    calleeSource: { kind: "specifier", value: "./helpers" },
    args: [],
    ...overrides,
  };
}

describe("resolveCallFromMapping", () => {
  // ── Exact match ──────────────────────────────────────────────────────

  it("matches exact function name", () => {
    const mapping: CallMapping = [["color", { expr: "$colors.{arg0}", imports: [] }]];
    const result = resolveCallFromMapping(
      mapping,
      makeCtx({ args: [{ kind: "literal", value: "red" }] }),
    );
    expect(result).toEqual({ expr: "$colors.red", imports: [] });
  });

  it("does not match different function name", () => {
    const mapping: CallMapping = [["color", { expr: "$colors.{arg0}", imports: [] }]];
    expect(resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "spacing" }))).toBe(
      CALL_MAPPING_NO_MATCH,
    );
  });

  // ── Qualified match (member path) ────────────────────────────────────

  it("matches qualified name with member path", () => {
    const mapping: CallMapping = [["ColorConverter.cssWithAlpha", { preserveRuntimeCall: true }]];
    const result = resolveCallFromMapping(
      mapping,
      makeCtx({
        calleeImportedName: "ColorConverter",
        calleeMemberPath: ["cssWithAlpha"],
      }),
    );
    expect(result).toEqual({ preserveRuntimeCall: true });
  });

  it("does not match qualified pattern against unqualified call", () => {
    const mapping: CallMapping = [["ColorConverter.cssWithAlpha", { preserveRuntimeCall: true }]];
    expect(resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "ColorConverter" }))).toBe(
      CALL_MAPPING_NO_MATCH,
    );
  });

  // ── {arg0} interpolation ─────────────────────────────────────────────

  it("interpolates {arg0} with first literal string argument", () => {
    const mapping: CallMapping = [["fontWeight", { expr: "fontWeightVars.{arg0}", imports: [] }]];
    const result = resolveCallFromMapping(
      mapping,
      makeCtx({
        calleeImportedName: "fontWeight",
        args: [{ kind: "literal", value: "bold" }],
      }),
    );
    expect(result).toEqual({ expr: "fontWeightVars.bold", imports: [] });
  });

  it("strips .{arg0} suffix when no literal arg is present", () => {
    const mapping: CallMapping = [["shadow", { expr: "$shadow.{arg0}", imports: [] }]];
    const result = resolveCallFromMapping(
      mapping,
      makeCtx({
        calleeImportedName: "shadow",
        args: [{ kind: "unknown" }],
      }),
    );
    expect(result).toEqual({ expr: "$shadow", imports: [] });
  });

  it("returns template as-is when {arg0} not in expr", () => {
    const mapping: CallMapping = [["thinPixel", { expr: "pixelVars.thin", imports: [] }]];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "thinPixel" }));
    expect(result).toEqual({ expr: "pixelVars.thin", imports: [] });
  });

  // ── Entry types ──────────────────────────────────────────────────────

  it("returns preserveRuntimeCall entry", () => {
    const mapping: CallMapping = [["getColor", { preserveRuntimeCall: true }]];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "getColor" }));
    expect(result).toEqual({ preserveRuntimeCall: true });
  });

  it("returns extraClassNames entry", () => {
    const classNames = [{ expr: "styles.foo", imports: [] }];
    const mapping: CallMapping = [["draggable", { extraClassNames: classNames }]];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "draggable" }));
    expect(result).toEqual({ extraClassNames: classNames });
  });

  it("passes through usage and dynamicArgUsage fields", () => {
    const mapping: CallMapping = [
      [
        "truncate",
        {
          expr: "helpers.truncate",
          imports: [],
          usage: "props",
          dynamicArgUsage: "memberAccess",
        },
      ],
    ];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "truncate" }));
    expect(result).toHaveProperty("usage", "props");
    expect(result).toHaveProperty("dynamicArgUsage", "memberAccess");
  });

  it("passes through cssText field", () => {
    const mapping: CallMapping = [
      [
        "flexCenter",
        {
          expr: "helpers.flexCenter",
          imports: [],
          cssText: "display: flex; align-items: center;",
        },
      ],
    ];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "flexCenter" }));
    expect(result).toHaveProperty("cssText", "display: flex; align-items: center;");
  });

  // ── First match wins ─────────────────────────────────────────────────

  it("returns first matching entry", () => {
    const mapping: CallMapping = [
      ["color", { expr: "FIRST", imports: [] }],
      ["color", { expr: "SECOND", imports: [] }],
    ];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "color" }));
    expect(result).toEqual({ expr: "FIRST", imports: [] });
  });

  // ── No match ─────────────────────────────────────────────────────────

  it("returns CALL_MAPPING_NO_MATCH for empty mapping", () => {
    expect(resolveCallFromMapping([], makeCtx())).toBe(CALL_MAPPING_NO_MATCH);
  });

  it("returns CALL_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: CallMapping = [["fontWeight", { expr: "fw.{arg0}", imports: [] }]];
    expect(resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "color" }))).toBe(
      CALL_MAPPING_NO_MATCH,
    );
  });

  // ── Resolve entry with preserveRuntimeCall flag ──────────────────────

  it("includes preserveRuntimeCall on resolve entry when set", () => {
    const mapping: CallMapping = [
      [
        "compute",
        {
          expr: "helpers.compute",
          imports: [],
          preserveRuntimeCall: true,
        },
      ],
    ];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "compute" }));
    expect(result).toEqual({
      expr: "helpers.compute",
      imports: [],
      preserveRuntimeCall: true,
    });
  });
});
