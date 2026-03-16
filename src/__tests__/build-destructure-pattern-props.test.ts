import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { buildDestructurePatternProps } from "../internal/emit-wrappers/jsx-builders.js";
import { patternProp } from "../internal/transform-utils.js";

const j = jscodeshift.withParser("tsx");
const pp = (name: string) => patternProp(j, name);

describe("buildDestructurePatternProps", () => {
  it("skips destructureProps that already exist in baseProps", () => {
    // Simulates the link emitter where baseProps already has "href" and "target"
    // and pseudoGuardProps also contains "href" from a guard condition.
    const baseProps = [pp("href"), pp("target"), pp("children")];

    const result = buildDestructurePatternProps(j, pp, {
      baseProps,
      destructureProps: ["href", "newProp"],
      includeRest: true,
      restId: j.identifier("rest"),
    });

    const names = result.map((p) => {
      if (p.type === "RestElement") {
        return "...rest";
      }
      const key = (p as { key?: { name?: string } }).key;
      return key?.name ?? "?";
    });

    // "href" should NOT be duplicated; "newProp" should be added
    expect(names).toEqual(["href", "target", "children", "newProp", "...rest"]);
  });

  it("skips destructureProps that match 'as' prop with AssignmentPattern value", () => {
    // The "as" prop in baseProps uses j.property.from() with an AssignmentPattern value
    const asProp = j.property.from({
      kind: "init",
      key: j.identifier("as"),
      value: j.assignmentPattern(j.identifier("Component"), j.literal("div")),
      shorthand: false,
    });
    const baseProps = [asProp, pp("className")];

    const result = buildDestructurePatternProps(j, pp, {
      baseProps,
      destructureProps: ["as", "extraProp"],
    });

    const names = result.map((p) => {
      const key = (p as { key?: { name?: string } }).key;
      return key?.name ?? "?";
    });

    expect(names).toEqual(["as", "className", "extraProp"]);
  });
});
