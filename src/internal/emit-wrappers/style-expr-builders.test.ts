import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { buildInterleavedExtraStyleArgs } from "./style-expr-builders.js";
import type { ExpressionKind } from "./types.js";

const j = jscodeshift.withParser("tsx");

describe("buildInterleavedExtraStyleArgs", () => {
  it("does not let conditional props args consume mixinOrder propsArg markers", () => {
    const orderedExpr = j.identifier("sourceOrderedSx") as ExpressionKind;
    const decl = {
      localName: "Button",
      styleKey: "button",
      base: { kind: "intrinsic", tagName: "button" },
      rules: [],
      templateExpressions: [],
      mixinOrder: ["propsArg"],
      extraStylexPropsArgs: [
        {
          when: "active",
          expr: j.identifier("conditionalSx") as ExpressionKind,
        },
        { expr: orderedExpr },
      ],
    } satisfies StyledDecl;

    const result = buildInterleavedExtraStyleArgs(j, "styles", decl, [orderedExpr]);

    expect(result.beforeBase.map((expr) => j(expr).toSource())).toEqual(["sourceOrderedSx"]);
    expect(result.afterBase).toEqual([]);
    expect(result.afterVariants).toEqual([]);
  });
});
