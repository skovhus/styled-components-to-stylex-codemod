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
    expect(styles.get("linkOverride")).toBeUndefined();
    expect(styles.get("linkLinkOverride")).toBeUndefined();
    expect(decl.extraStyleKeys).toEqual([]);
    expect(decl.extraStyleKeysAfterBase).toEqual([]);
  });

  it("clones shared flat mixins before lifting caller-specific conditional states", () => {
    const styles = new Map<string, unknown>([
      ["button", { color: { default: "base", ":hover": "hover" } }],
      ["sharedColor", { color: "muted" }],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["sharedColor"],
      extraStyleKeysAfterBase: ["sharedColor"],
    } satisfies StyledDecl;
    const otherDecl = {
      localName: "OtherButton",
      styleKey: "otherButton",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["sharedColor"],
      extraStyleKeysAfterBase: ["sharedColor"],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl, otherDecl])).toBe("ok");
    expect(styles.get("sharedColor")).toEqual({ color: "muted" });
    expect(styles.get("buttonSharedColor")).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
    expect(decl.extraStyleKeys).toEqual(["buttonSharedColor"]);
    expect(decl.extraStyleKeysAfterBase).toEqual(["buttonSharedColor"]);
    expect(otherDecl.extraStyleKeys).toEqual(["sharedColor"]);
  });

  it("keeps using cloned mixins for contribution inference after lifting one property", () => {
    const styles = new Map<string, unknown>([
      ["button", { color: { default: "base", ":hover": "hover" } }],
      ["sharedColor", { color: "muted", opacity: 0.8 }],
      ["buttonOverride", { color: "final" }],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["sharedColor", "buttonOverride"],
      extraStyleKeysAfterBase: ["sharedColor", "buttonOverride"],
    } satisfies StyledDecl;
    const otherDecl = {
      localName: "OtherButton",
      styleKey: "otherButton",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["sharedColor"],
      extraStyleKeysAfterBase: ["sharedColor"],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl, otherDecl])).toBe("ok");
    expect(styles.get("sharedColor")).toEqual({ color: "muted", opacity: 0.8 });
    expect(styles.get("buttonSharedColor")).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
      opacity: 0.8,
    });
    expect(styles.get("buttonButtonOverride")).toEqual({
      color: {
        default: "final",
        ":hover": "hover",
      },
    });
    expect(decl.extraStyleKeys).toEqual(["buttonSharedColor", "buttonButtonOverride"]);
    expect(otherDecl.extraStyleKeys).toEqual(["sharedColor"]);
  });

  it("clones only the current occurrence when the same mixin is used multiple times", () => {
    const styles = new Map<string, unknown>([
      ["button", { color: { default: "base", ":hover": "hover" } }],
      ["sharedColor", { color: "muted" }],
      [
        "focusColor",
        {
          color: {
            default: null,
            ":focus": "focus",
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
      extraStyleKeys: ["sharedColor", "focusColor", "sharedColor"],
      extraStyleKeysAfterBase: ["sharedColor", "focusColor", "sharedColor"],
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("sharedColor")).toBeUndefined();
    expect(styles.get("buttonSharedColor")).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
    expect(styles.get("focusColor")).toEqual({
      color: {
        default: "muted",
        ":focus": "focus",
      },
    });
    expect(styles.get("buttonSharedColor2")).toBeUndefined();
    expect(decl.extraStyleKeys).toEqual(["buttonSharedColor", "focusColor"]);
  });

  it("preserves shared flat mixins that are also referenced by css helper rewrites", () => {
    const styles = new Map<string, unknown>([
      ["button", { color: { default: "base", ":hover": "hover" } }],
      ["sharedColor", { color: "muted" }],
    ]);
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["sharedColor"],
      extraStyleKeysAfterBase: ["sharedColor"],
    } satisfies StyledDecl;
    const ctx = {
      cssHelpers: {
        cssHelperReplacements: [{ localName: "sharedColorCss", styleKey: "sharedColor" }],
        cssHelperTemplateReplacements: [{ node: {}, styleKey: "sharedColor" }],
      },
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("sharedColor")).toEqual({ color: "muted" });
    expect(styles.get("buttonSharedColor")).toEqual({
      color: {
        default: "muted",
        ":hover": "hover",
      },
    });
    expect(decl.extraStyleKeys).toEqual(["buttonSharedColor"]);
    expect(decl.extraStyleKeysAfterBase).toEqual(["buttonSharedColor"]);
  });

  it("does not lift same-specificity attribute states into later attribute wrappers", () => {
    const styles = new Map<string, unknown>([
      ["input", { backgroundColor: { default: null, ":disabled": "#f5f5f5" } }],
      ["inputReadonly", { backgroundColor: "#fafafa" }],
    ]);
    const decl = {
      localName: "Input",
      styleKey: "input",
      base: { kind: "intrinsic", tagName: "input" },
      rules: [],
      templateExpressions: [],
      attrWrapper: {
        kind: "input",
        readonlyKey: "inputReadonly",
      },
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("inputReadonly")).toEqual({ backgroundColor: "#fafafa" });
  });

  it("does not over-count functional pseudo specificity for later attribute wrappers", () => {
    const styles = new Map<string, unknown>([
      [
        "input",
        {
          backgroundColor: {
            default: null,
            ":where(:hover)": "#f5f5f5",
            ":is(:hover, :focus)": "#eeeeee",
          },
        },
      ],
      ["inputReadonly", { backgroundColor: "#fafafa" }],
    ]);
    const decl = {
      localName: "Input",
      styleKey: "input",
      base: { kind: "intrinsic", tagName: "input" },
      rules: [],
      templateExpressions: [],
      attrWrapper: {
        kind: "input",
        readonlyKey: "inputReadonly",
      },
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("inputReadonly")).toEqual({ backgroundColor: "#fafafa" });
  });

  it("counts class selectors inside functional pseudo specificity", () => {
    const styles = new Map<string, unknown>([
      ["link", { color: { default: null, ":is(.active)": "active" } }],
      ["linkOverride", { color: "muted" }],
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
    expect(styles.get("linkLinkOverride")).toEqual({
      color: {
        default: "muted",
        ":is(.active)": "active",
      },
    });
  });

  it("counts id selectors inside functional pseudo specificity", () => {
    const styles = new Map<string, unknown>([
      ["input", { backgroundColor: { default: null, ":has(#selected)": "#f5f5f5" } }],
      ["inputReadonly", { backgroundColor: "#fafafa" }],
    ]);
    const decl = {
      localName: "Input",
      styleKey: "input",
      base: { kind: "intrinsic", tagName: "input" },
      rules: [],
      templateExpressions: [],
      attrWrapper: {
        kind: "input",
        readonlyKey: "inputReadonly",
      },
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("inputReadonly")).toEqual({
      backgroundColor: {
        default: "#fafafa",
        ":has(#selected)": "#f5f5f5",
      },
    });
  });

  it("lifts higher-specificity states into later attribute wrappers", () => {
    const styles = new Map<string, unknown>([
      [
        "input",
        {
          backgroundColor: {
            default: null,
            ":focus:disabled": "#f5f5f5",
          },
        },
      ],
      ["inputReadonly", { backgroundColor: "#fafafa" }],
    ]);
    const decl = {
      localName: "Input",
      styleKey: "input",
      base: { kind: "intrinsic", tagName: "input" },
      rules: [],
      templateExpressions: [],
      attrWrapper: {
        kind: "input",
        readonlyKey: "inputReadonly",
      },
    } satisfies StyledDecl;
    const ctx = {
      resolvedStyleObjects: styles,
      warnings: [],
    } as unknown as TransformContext;

    expect(guardGeneratedConditionalDefaults(ctx, [decl])).toBe("ok");
    expect(styles.get("inputReadonly")).toEqual({
      backgroundColor: {
        default: "#fafafa",
        ":focus:disabled": "#f5f5f5",
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
