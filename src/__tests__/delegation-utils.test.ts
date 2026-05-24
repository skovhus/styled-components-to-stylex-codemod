import { describe, expect, it } from "vitest";
import type { StyledDecl } from "../internal/transform-types";
import {
  getEffectiveBaseIdent,
  needsShouldForwardPropWrapper,
} from "../internal/utilities/delegation-utils";

function styledDecl(overrides: Partial<StyledDecl> = {}): StyledDecl {
  return {
    localName: "Box",
    base: { kind: "intrinsic", tagName: "div" },
    styleKey: "box",
    rules: [],
    templateExpressions: [],
    ...overrides,
  };
}

describe("needsShouldForwardPropWrapper", () => {
  it("keeps withConfig shouldForwardProp at the wrapper boundary", () => {
    const decl = styledDecl({
      inlinedBaseComponent: {
        importSource: "./Button",
        importedName: "Button",
        baseResult: { kind: "intrinsic", tagName: "button" },
        baseStaticProps: {},
      },
      shouldForwardProp: { dropProps: ["$variant"] },
      shouldForwardPropFromWithConfig: true,
    });

    expect(needsShouldForwardPropWrapper(decl)).toBe(true);
  });

  it("lets resolver-only prop drops use JSX rewrite for inlined bases", () => {
    const decl = styledDecl({
      inlinedBaseComponent: {
        importSource: "./Button",
        importedName: "Button",
        baseResult: { kind: "intrinsic", tagName: "button" },
        baseStaticProps: {},
      },
      shouldForwardProp: { dropProps: ["$variant"] },
    });

    expect(needsShouldForwardPropWrapper(decl)).toBe(false);
  });

  it("does not require a wrapper when no shouldForwardProp rule exists", () => {
    expect(needsShouldForwardPropWrapper(styledDecl())).toBe(false);
  });
});

describe("getEffectiveBaseIdent", () => {
  it("prefers the original component base captured before flattening", () => {
    expect(
      getEffectiveBaseIdent(
        styledDecl({
          base: { kind: "intrinsic", tagName: "button" },
          originalBaseIdent: "Button",
        }),
      ),
    ).toBe("Button");
  });

  it("falls back to the current component base identifier", () => {
    expect(getEffectiveBaseIdent(styledDecl({ base: { kind: "component", ident: "Base" } }))).toBe(
      "Base",
    );
  });
});
