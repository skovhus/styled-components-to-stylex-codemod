import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { collectConditionProps, parseVariantWhenToAst } from "./variant-condition.js";

const j = jscodeshift.withParser("tsx");

describe("parseVariantWhenToAst", () => {
  it("collects root prop for dotted member conditions", () => {
    const parsed = parseVariantWhenToAst(j, "$layer.isTop");
    expect(parsed.props).toEqual(["$layer"]);
    expect(parsed.isBoolean).toBe(false);
  });

  it("collects root prop for dotted comparisons", () => {
    const parsed = parseVariantWhenToAst(j, "user.role === Role.admin");
    expect(parsed.props).toEqual(["user"]);
    expect(parsed.isBoolean).toBe(true);
  });

  it("does not collect theme root from theme conditions", () => {
    const parsedSimple = parseVariantWhenToAst(j, "theme.isDark");
    expect(parsedSimple.props).toEqual([]);

    const parsedComparison = parseVariantWhenToAst(j, 'theme.mode === "dark"');
    expect(parsedComparison.props).toEqual([]);
  });
});

describe("collectConditionProps", () => {
  it("adds dotted root props to destructure list", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, { when: "$layer.isTop && $zIndex", destructureProps });
    expect(destructureProps).toEqual(["$layer", "$zIndex"]);
  });
});
