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
  it("matches exact function name and interpolates {arg0}", () => {
    const mapping: CallMapping = [["color", { expr: "$colors.{arg0}", imports: [] }]];
    const result = resolveCallFromMapping(
      mapping,
      makeCtx({ args: [{ kind: "literal", value: "red" }] }),
    );
    expect(result).toEqual({ expr: "$colors.red", imports: [] });
  });

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

  it("returns extraClassNames entry", () => {
    const classNames = [{ expr: "styles.foo", imports: [] }];
    const mapping: CallMapping = [["draggable", { extraClassNames: classNames }]];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "draggable" }));
    expect(result).toEqual({ extraClassNames: classNames });
  });

  it("passes through all resolve entry fields", () => {
    const mapping: CallMapping = [
      [
        "truncate",
        {
          expr: "helpers.truncate",
          imports: [],
          usage: "props",
          dynamicArgUsage: "memberAccess",
          cssText: "overflow: hidden;",
          preserveRuntimeCall: true,
        },
      ],
    ];
    const result = resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "truncate" }));
    expect(result).toEqual({
      expr: "helpers.truncate",
      imports: [],
      usage: "props",
      dynamicArgUsage: "memberAccess",
      cssText: "overflow: hidden;",
      preserveRuntimeCall: true,
    });
  });

  it("returns CALL_MAPPING_NO_MATCH when nothing matches", () => {
    const mapping: CallMapping = [["fontWeight", { expr: "fw.{arg0}", imports: [] }]];
    expect(resolveCallFromMapping(mapping, makeCtx({ calleeImportedName: "other" }))).toBe(
      CALL_MAPPING_NO_MATCH,
    );
  });
});
