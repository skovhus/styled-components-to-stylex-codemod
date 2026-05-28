import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import type { StyledDecl } from "../transform-types.js";
import { buildExtraStylexPropsExprEntries } from "./variant-condition.js";
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

    const propsArgExprs = buildExtraStylexPropsExprEntries(j, {
      entries: decl.extraStylexPropsArgs,
    });
    const result = buildInterleavedExtraStyleArgs(j, "styles", decl, propsArgExprs);

    expect(result.beforeBase.map((expr) => j(expr).toSource())).toEqual([
      "active ? conditionalSx : undefined",
      "sourceOrderedSx",
    ]);
    expect(result.afterBase).toEqual([]);
    expect(result.afterVariants).toEqual([]);
  });

  it("keeps arg metadata aligned when guarded pairs merge", () => {
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
          expr: j.identifier("activeSx") as ExpressionKind,
        },
        {
          when: "!active",
          expr: j.identifier("inactiveSx") as ExpressionKind,
        },
        {
          expr: j.identifier("afterBaseSx") as ExpressionKind,
          afterBase: true,
        },
      ],
    } satisfies StyledDecl;
    const propsArgExprs = buildExtraStylexPropsExprEntries(j, {
      entries: decl.extraStylexPropsArgs,
    });

    const result = buildInterleavedExtraStyleArgs(j, "styles", decl, propsArgExprs);

    expect(result.beforeBase.map((expr) => j(expr).toSource())).toEqual([
      "active ? activeSx : inactiveSx",
    ]);
    expect(result.afterBase.map((expr) => j(expr).toSource())).toEqual(["afterBaseSx"]);
    expect(result.afterVariants).toEqual([]);
  });
});
