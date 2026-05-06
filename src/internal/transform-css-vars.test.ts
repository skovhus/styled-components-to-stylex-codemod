import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import type { ResolveValueContext } from "../adapter.js";
import { rewriteCssVarsInStyleObject } from "./transform-css-vars.js";

describe("rewriteCssVarsInStyleObject", () => {
  it("preserves non-string local StyleX variable defaults", () => {
    const obj: Record<string, unknown> = {
      "--offset": 0,
    };
    const defaults: unknown[] = [];

    rewriteCssVarsInStyleObject({
      obj,
      filePath: "test.tsx",
      definedVars: new Map(),
      varsToDrop: new Set(),
      resolveValue: (_ctx: ResolveValueContext) => undefined,
      addImport: () => {},
      parseExpr: () => null,
      j: jscodeshift,
      getOrCreateLocalStylexVar: (cssName, defaultValue) => {
        defaults.push(defaultValue);
        return {
          cssName,
          groupName: "testVariables",
          keyName: cssName,
          defaultValue,
          sourceOrder: 0,
          sidecarFileName: "test.stylex",
        };
      },
    });

    expect(defaults).toEqual([0]);
  });
});
