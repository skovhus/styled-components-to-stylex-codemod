import { describe, expect, it } from "vitest";
import type { StyledDecl } from "../transform-types.js";
import type { TransformContext } from "../transform-context.js";
import { buildStyleKeySequence } from "./style-composition-plan.js";

describe("buildStyleKeySequence", () => {
  it("orders core contributors in emitted cascade order", () => {
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      extraStyleKeys: ["mixinBefore", "mixinAfter"],
      extraStyleKeysAfterBase: ["mixinAfter"],
      extraStylexPropsArgs: [{ expr: { type: "Identifier", name: "externalSx" } as never }],
      needsUseThemeHook: [{ themeProp: "isDark", trueStyleKey: "buttonDark", falseStyleKey: null }],
      attrWrapper: { kind: "link", externalKey: "buttonExternal" },
      pseudoExpandSelectors: [{ styleKey: "buttonHover" }],
      variantStyleKeys: { active: "buttonActive" },
      variantSourceOrder: { active: 1 },
      styleFnFromProps: [{ fnKey: "buttonTone", jsxProp: "tone", sourceOrder: 0 }],
      variantDimensions: [
        {
          propName: "size",
          variantObjectName: "sizeVariants",
          sourceOrder: 2,
          variants: { large: { fontSize: 20 } },
        },
      ],
    } satisfies StyledDecl;
    const ctx = { resolvedStyleObjects: new Map() } as unknown as TransformContext;

    expect(
      buildStyleKeySequence(ctx, decl).map((entry) => ({
        key: entry.styleKey,
        source: entry.source,
        dynamic: entry.contributesDynamic === true,
      })),
    ).toEqual([
      { key: "mixinBefore", source: "mixin", dynamic: false },
      { key: "button", source: "base", dynamic: false },
      { key: "mixinAfter", source: "mixin", dynamic: false },
      { key: "buttonExtraStylexPropsArg0", source: "propsArg", dynamic: true },
      { key: "buttonDark", source: "theme", dynamic: false },
      { key: "buttonExternal", source: "attr", dynamic: false },
      { key: "buttonHover", source: "pseudo", dynamic: false },
      { key: "buttonTone", source: "styleFn", dynamic: false },
      { key: "buttonActive", source: "variant", dynamic: false },
      { key: "sizeVariants.large", source: "variant", dynamic: false },
    ]);
  });
});
