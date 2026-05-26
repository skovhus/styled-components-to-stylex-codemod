import { describe, expect, it } from "vitest";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { guardGeneratedConditionalDefaults } from "./conditional-style-defaults.js";

describe("guardGeneratedConditionalDefaults", () => {
  it("does not inherit defaults from source-ordered variants emitted after pseudo styles", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
      ["buttonActive", { backgroundColor: "#dbeafe" }],
      [
        "buttonHover",
        {
          backgroundColor: {
            default: null,
            ":hover": "#fee2e2",
          },
        },
      ],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      variantStyleKeys: { active: "buttonActive" },
      variantSourceOrder: { active: 0 },
      pseudoExpandSelectors: [{ styleKey: "buttonHover" }],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");

    expect(styles.get("buttonHover")).toEqual({
      backgroundColor: {
        default: "#ffffff",
        ":hover": "#fee2e2",
      },
    });
  });

  it("does not inherit defaults from conditional variants that may be absent at runtime", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
      ["buttonActive", { backgroundColor: "#dbeafe" }],
      [
        "buttonHover",
        {
          backgroundColor: {
            default: null,
            ":hover": "#fee2e2",
          },
        },
      ],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      variantStyleKeys: { active: "buttonActive" },
      pseudoExpandSelectors: [{ styleKey: "buttonHover" }],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");

    expect(styles.get("buttonHover")).toEqual({
      backgroundColor: {
        default: "#ffffff",
        ":hover": "#fee2e2",
      },
    });
  });

  it("inherits defaults from attr-wrapper entries emitted before pseudo styles", () => {
    const styles = new Map<string, unknown>([
      ["link", { backgroundColor: "#ffffff" }],
      ["linkExternal", { backgroundColor: "#dbeafe" }],
      [
        "linkHover",
        {
          backgroundColor: {
            default: null,
            ":hover": "#fee2e2",
          },
        },
      ],
    ]);
    const decl = {
      localName: "Link",
      styleKey: "link",
      base: { kind: "intrinsic", tagName: "a" },
      rules: [],
      templateExpressions: [],
      attrWrapper: {
        kind: "link",
        externalKey: "linkExternal",
      },
      pseudoExpandSelectors: [{ styleKey: "linkHover" }],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");

    expect(styles.get("linkHover")).toEqual({
      backgroundColor: {
        default: "#dbeafe",
        ":hover": "#fee2e2",
      },
    });
  });
});
