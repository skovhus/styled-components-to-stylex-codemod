import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import {
  collectConditionProps,
  mergeAdjacentComplementaryStyleExprs,
  parseVariantWhenToAst,
} from "./variant-condition.js";

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

  it("marks simple identifiers as boolean when in booleanProps set", () => {
    const booleanProps = new Set(["disabled"]);
    const parsed = parseVariantWhenToAst(j, "disabled", booleanProps);
    expect(parsed.isBoolean).toBe(true);
  });

  it("keeps simple identifiers as non-boolean when not in booleanProps set", () => {
    const parsed = parseVariantWhenToAst(j, "fill");
    expect(parsed.isBoolean).toBe(false);
  });

  it("marks simple identifiers as non-boolean when booleanProps is not provided", () => {
    const parsed = parseVariantWhenToAst(j, "disabled");
    expect(parsed.isBoolean).toBe(false);
  });
});

describe("collectConditionProps", () => {
  it("adds dotted root props to destructure list", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, { when: "$layer.isTop && $zIndex", destructureProps });
    expect(destructureProps).toEqual(["$layer", "$zIndex"]);
  });
});

describe("mergeAdjacentComplementaryStyleExprs", () => {
  it("merges adjacent identifier and negated identifier conditions into a ternary", () => {
    const styles = j.identifier("styles");
    const merged = mergeAdjacentComplementaryStyleExprs(j, [
      j.logicalExpression(
        "&&",
        j.identifier("isAnimated"),
        j.memberExpression(styles, j.identifier("animated")),
      ),
      j.logicalExpression(
        "&&",
        j.unaryExpression("!", j.identifier("isAnimated")),
        j.memberExpression(styles, j.identifier("notAnimated")),
      ),
    ]);

    expect(merged).toHaveLength(1);
    const mergedExpr = merged[0];
    expect(mergedExpr).toBeDefined();
    if (!mergedExpr) {
      throw new Error("Expected complementary style args to merge");
    }
    expect(j(mergedExpr).toSource()).toBe("isAnimated ? styles.animated : styles.notAnimated");
  });

  it("preserves style ordering when complementary conditions are not adjacent", () => {
    const styles = j.identifier("styles");
    const merged = mergeAdjacentComplementaryStyleExprs(j, [
      j.logicalExpression(
        "&&",
        j.identifier("active"),
        j.memberExpression(styles, j.identifier("active")),
      ),
      j.memberExpression(styles, j.identifier("base")),
      j.logicalExpression(
        "&&",
        j.unaryExpression("!", j.identifier("active")),
        j.memberExpression(styles, j.identifier("inactive")),
      ),
    ]);

    expect(merged).toHaveLength(3);
  });
});
