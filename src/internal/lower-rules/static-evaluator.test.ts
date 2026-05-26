import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { evaluateLocalCallValueTransform } from "./static-evaluator.js";

const j = jscodeshift.withParser("tsx");

describe("evaluateLocalCallValueTransform", () => {
  it("bails on directly recursive local helpers", () => {
    const root = j("const format = (value: number): string => format(value);");

    expect(
      evaluateLocalCallValueTransform({
        j,
        root,
        calleeName: "format",
        argValue: 4,
      }),
    ).toBeNull();
  });

  it("bails on mutually recursive local helpers", () => {
    const root = j(`
const format = (value: number): string => decorate(value);
const decorate = (value: number): string => format(value);
`);

    expect(
      evaluateLocalCallValueTransform({
        j,
        root,
        calleeName: "format",
        argValue: 4,
      }),
    ).toBeNull();
  });
});
