import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { evaluateLocalCallValueTransform } from "./static-evaluator.js";

const j = jscodeshift.withParser("tsx");

describe("evaluateLocalCallValueTransform", () => {
  it("evaluates a single local helper", () => {
    const root = j('const format = (value: number): string => value + "px";');

    expect(
      evaluateLocalCallValueTransform({
        j,
        root,
        calleeName: "format",
        argValue: 4,
      }),
    ).toBe("4px");
  });

  it("bails when helper name resolution is ambiguous across scopes", () => {
    const root = j(`
const format = (value: number): string => value + "px";
function render() {
  const format = (value: number): string => value + "rem";
  return format(4);
}
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
