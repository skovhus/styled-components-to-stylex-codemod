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

  it("treats prior extra stylex props args as dynamic contributors", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
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
      extraStylexPropsArgs: [
        {
          expr: { type: "Identifier", name: "externalStyles" } as never,
          afterBase: true,
        },
      ],
      pseudoExpandSelectors: [{ styleKey: "buttonHover" }],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("bail");
    expect(ctx.warnings.map((warning) => warning.type)).toContain(
      "Conditional StyleX default would override an unproven earlier style for the same property",
    );
  });

  it("treats source-ordered props args before base as dynamic contributors", () => {
    const styles = new Map<string, unknown>([
      [
        "badge",
        {
          borderColor: {
            default: null,
            ":hover": "#fee2e2",
          },
        },
      ],
    ]);
    const decl = {
      localName: "Badge",
      styleKey: "badge",
      base: { kind: "intrinsic", tagName: "span" },
      rules: [],
      templateExpressions: [],
      mixinOrder: ["propsArg"],
      extraStylexPropsArgs: [
        {
          expr: { type: "MemberExpression" } as never,
        },
      ],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("bail");
    expect(ctx.warnings.map((warning) => warning.type)).toContain(
      "Conditional StyleX default would override an unproven earlier style for the same property",
    );
  });

  it("orders variant dimensions with source-ordered variant entries", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
      [
        "buttonActive",
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
      variantDimensions: [
        {
          propName: "tone",
          variantObjectName: "toneVariants",
          sourceOrder: 10,
          variants: {
            warm: { backgroundColor: "#dbeafe" },
          },
        },
      ],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");

    expect(styles.get("buttonActive")).toEqual({
      backgroundColor: {
        default: "#ffffff",
        ":hover": "#fee2e2",
      },
    });
  });

  it("orders source-ordered variant dimensions with dynamic style functions", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
      [
        "buttonDynamicBackground",
        {
          type: "ArrowFunctionExpression",
          body: {
            type: "ObjectExpression",
            properties: [
              {
                type: "Property",
                key: { type: "Identifier", name: "backgroundColor" },
                value: { type: "Identifier", name: "backgroundColor" },
              },
            ],
          },
        },
      ],
      [
        "buttonTone.warm",
        {
          backgroundColor: {
            default: null,
            ":hover": "#dbeafe",
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
      styleFnFromProps: [
        {
          fnKey: "buttonDynamicBackground",
          jsxProp: "backgroundColor",
          sourceOrder: 0,
        },
      ],
      variantDimensions: [
        {
          propName: "tone",
          variantObjectName: "buttonTone",
          sourceOrder: 10,
          variants: {
            warm: styles.get("buttonTone.warm") as Record<string, unknown>,
          },
        },
      ],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("bail");
    expect(ctx.warnings.map((warning) => warning.type)).toContain(
      "Conditional StyleX default would override an unproven earlier style for the same property",
    );
  });

  it("detects nested null defaults returned from dynamic style functions", () => {
    const styles = new Map<string, unknown>([
      ["button", { backgroundColor: "#ffffff" }],
      [
        "buttonHover",
        {
          type: "ArrowFunctionExpression",
          body: {
            type: "ObjectExpression",
            properties: [
              {
                type: "Property",
                key: { type: "Identifier", name: "backgroundColor" },
                value: {
                  type: "ObjectExpression",
                  properties: [
                    {
                      type: "Property",
                      key: { type: "Literal", value: ":hover" },
                      value: {
                        type: "ObjectExpression",
                        properties: [
                          {
                            type: "Property",
                            key: { type: "Identifier", name: "default" },
                            value: { type: "Literal", value: null },
                          },
                          {
                            type: "Property",
                            key: { type: "Literal", value: "@media (hover: hover)" },
                            value: { type: "Identifier", name: "backgroundColor" },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
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
      styleFnFromProps: [
        {
          fnKey: "buttonHover",
          jsxProp: "backgroundColor",
        },
      ],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("bail");
    expect(ctx.warnings.map((warning) => warning.type)).toContain(
      "Conditional StyleX default would override an unproven earlier style for the same property",
    );
  });

  it("lifts a later flat value into an earlier conditional map when states are static", () => {
    const styles = new Map<string, unknown>([
      [
        "link",
        {
          transitionDuration: {
            default: "120ms",
            ":highlightMixin": "80ms",
          },
        },
      ],
      ["linkOverride", { transitionDuration: "120ms" }],
    ]);
    const decl = {
      localName: "Link",
      styleKey: "link",
      base: { kind: "intrinsic", tagName: "a" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["linkOverride"],
      extraStyleKeysAfterBase: ["linkOverride"],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("linkOverride")).toEqual({
      transitionDuration: {
        default: "120ms",
        ":highlightMixin": "80ms",
      },
    });
  });

  it("bails when a later flat value would erase dynamic conditional map states", () => {
    const styles = new Map<string, unknown>([
      [
        "button",
        {
          opacity: {
            default: 1,
            ":hover": { type: "Identifier", name: "hoverOpacity" },
          },
        },
      ],
      ["buttonOverride", { opacity: 0.8 }],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["buttonOverride"],
      extraStyleKeysAfterBase: ["buttonOverride"],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("bail");
    expect(ctx.warnings.map((warning) => warning.type)).toContain(
      "Flat StyleX value would erase earlier conditional property states",
    );
    expect(ctx.warnings[0]?.context?.example).toContain("opacity: value");
    expect(ctx.warnings[0]?.context?.example).toContain('":hover"');
  });
});
