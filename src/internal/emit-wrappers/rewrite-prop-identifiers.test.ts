import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";

import { rewriteBarePropIdentifiersToPropsAccess } from "./rewrite-prop-identifiers.js";

const j = jscodeshift.withParser("tsx");

function rewriteExpression(source: string, propNames: string[]): string {
  const expression = j(`const value = ${source};`).find(j.VariableDeclarator).nodes()[0]!.init!;
  rewriteBarePropIdentifiersToPropsAccess({
    j,
    node: expression,
    propNames: new Set(propNames),
  });
  return j(expression).toSource();
}

describe("rewriteBarePropIdentifiersToPropsAccess", () => {
  it("does not rewrite identifiers shadowed by nested function parameters", () => {
    expect(
      rewriteExpression("items.map((windowHeight) => windowHeight + offset + gutter)", [
        "windowHeight",
        "offset",
        "gutter",
      ]),
    ).toBe("items.map((windowHeight) => windowHeight + props.offset + props.gutter)");
  });

  it("does not rewrite object property keys or existing member properties", () => {
    expect(rewriteExpression("({ gutter, value: gutter, nested: props.gutter })", ["gutter"]))
      .toMatchInlineSnapshot(`
        "({
          gutter: props.gutter,
          value: props.gutter,
          nested: props.gutter
        })"
      `);
  });

  it("renames nested props bindings before rewriting to outer props access", () => {
    expect(rewriteExpression("items.map((props) => props.label + gutter)", ["gutter"])).toBe(
      "items.map((propsArg) => propsArg.label + props.gutter)",
    );
  });
});
