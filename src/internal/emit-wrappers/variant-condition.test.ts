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

  it("parses call-expression guards without collecting the callee as a prop", () => {
    const parsed = parseVariantWhenToAst(j, "showProperty(width)");
    expect(j(parsed.cond).toSource()).toContain("showProperty(width)");
    expect(parsed.props).toEqual(["width"]);
    expect(parsed.isBoolean).toBe(true);
  });
});

describe("collectConditionProps", () => {
  it("adds dotted root props to destructure list", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, { when: "$layer.isTop && $zIndex", destructureProps });
    expect(destructureProps).toEqual(["$layer", "$zIndex"]);
  });

  it("adds only guard argument props to destructure list for call-expression guards", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, { when: "showProperty(width)", destructureProps });
    expect(destructureProps).toEqual(["width"]);
  });

  it("adds method-call receiver props to destructure list", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, { when: 'size.startsWith("l")', destructureProps });
    expect(destructureProps).toEqual(["size"]);
  });

  it("does not add guard constants when known props are available", () => {
    const destructureProps: string[] = [];
    collectConditionProps(j, {
      when: "isLarge(size, LIMIT) && size > MIN_SIZE",
      destructureProps,
      knownProps: new Set(["size"]),
    });
    expect(destructureProps).toEqual(["size"]);
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

  it("does not merge overlapping logical OR guards", () => {
    const styles = j.identifier("styles");
    const firstCondition = j("const x = kind === 'a' || kind === 'b';")
      .find(j.LogicalExpression)
      .nodes()[0];
    const secondCondition = j("const x = kind !== 'a' || kind === 'b';")
      .find(j.LogicalExpression)
      .nodes()[0];
    if (!firstCondition || !secondCondition) {
      throw new Error("Expected test conditions to parse");
    }

    const merged = mergeAdjacentComplementaryStyleExprs(j, [
      j.logicalExpression("&&", firstCondition, j.memberExpression(styles, j.identifier("first"))),
      j.logicalExpression(
        "&&",
        secondCondition,
        j.memberExpression(styles, j.identifier("second")),
      ),
    ]);

    expect(merged).toHaveLength(2);
  });

  it("preserves string literal whitespace when checking inverse comparisons", () => {
    const styles = j.identifier("styles");
    const firstCondition = j("const x = kind === 'a b';").find(j.BinaryExpression).nodes()[0];
    const secondCondition = j("const x = kind !== 'ab';").find(j.BinaryExpression).nodes()[0];
    if (!firstCondition || !secondCondition) {
      throw new Error("Expected test conditions to parse");
    }

    const merged = mergeAdjacentComplementaryStyleExprs(j, [
      j.logicalExpression("&&", firstCondition, j.memberExpression(styles, j.identifier("spaced"))),
      j.logicalExpression(
        "&&",
        secondCondition,
        j.memberExpression(styles, j.identifier("unspaced")),
      ),
    ]);

    expect(merged).toHaveLength(2);
  });
});
