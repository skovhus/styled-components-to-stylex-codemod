import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";
import {
  coerceStylexPxStyleFnParamValue,
  emitStylexPxNumericValue,
  makePxAwareCssProperty,
} from "../internal/lower-rules/inline-styles";

const j = jscodeshift.withParser("tsx");

function emit(exprCode: string, prefix = ""): string {
  const ast = j(`const x = ${exprCode}`);
  const expr = ast.find(jscodeshift.VariableDeclarator).nodes()[0]?.init;
  if (!expr) {
    throw new Error("Failed to parse expression");
  }
  const result = emitStylexPxNumericValue(j, expr, prefix);
  const wrapper = j(`const x = 0;`);
  wrapper.find(jscodeshift.VariableDeclarator).get().node.init = result;
  return wrapper
    .toSource()
    .replace(/^const x = /, "")
    .replace(/;$/, "");
}

describe("emitStylexPxNumericValue", () => {
  it("emits bare dynamic expressions without Number()", () => {
    expect(emit("props.$size")).toBe("props.$size");
    expect(emit("props.$size ?? 44")).toBe("props.$size ?? 44");
    expect(emit("props.$size", "-")).toBe("-props.$size");
  });

  it("emits numeric literals directly", () => {
    expect(emit("44")).toBe("44");
    expect(emit("44", "-")).toBe("-44");
    expect(emit('"8"')).toBe("8");
  });
});

describe("makePxAwareCssProperty", () => {
  it("skips Number() coercion when important px values include CSS text", () => {
    const prop = makePxAwareCssProperty(j, "width", "width", "", "px", {
      skipPxCoercion: true,
    }) as { value?: { type?: string; name?: string } };
    expect(prop.value?.type).toBe("Identifier");
    expect(prop.value?.name).toBe("width");
  });
});

describe("coerceStylexPxStyleFnParamValue", () => {
  it("wraps style-function params with Number()", () => {
    const result = coerceStylexPxStyleFnParamValue(j, "width");
    const wrapper = j(`const x = 0;`);
    wrapper.find(jscodeshift.VariableDeclarator).get().node.init = result;
    expect(
      wrapper
        .toSource()
        .replace(/^const x = /, "")
        .replace(/;$/, ""),
    ).toBe("Number(width)");
  });
});
