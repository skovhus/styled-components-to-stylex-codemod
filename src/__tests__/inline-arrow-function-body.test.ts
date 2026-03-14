import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { inlineArrowFunctionBody } from "../internal/lower-rules/inline-styles";

const j = jscodeshift.withParser("tsx");

function parseArrowFn(code: string) {
  const ast = j(`const x = ${code}`);
  const decl = ast.find(j.VariableDeclarator).nodes()[0];
  if (!decl?.init || decl.init.type !== "ArrowFunctionExpression") {
    throw new Error("Failed to parse arrow function");
  }
  return decl.init;
}

function inlineAndPrint(code: string): string | null {
  const expr = parseArrowFn(code);
  const result = inlineArrowFunctionBody(j, expr);
  if (!result) {
    return null;
  }
  const wrapper = j("var x = 0;");
  const decl = wrapper.find(j.VariableDeclarator);
  decl.get().node.init = result;
  const printed = wrapper.toSource();
  return printed.replace(/^var x = /, "").replace(/;$/, "");
}

describe("inlineArrowFunctionBody", () => {
  describe("simple identifier param", () => {
    it("replaces param reference with 'props'", () => {
      expect(inlineAndPrint("(p) => p.color")).toBe("props.color");
    });

    it("preserves non-computed member property keys", () => {
      // (p) => tokens.p should NOT rewrite the property key `p`
      expect(inlineAndPrint("(p) => tokens.p")).toBe("tokens.p");
    });

    it("replaces computed member property keys that reference the param", () => {
      expect(inlineAndPrint("(p) => tokens[p]")).toBe("tokens[props]");
    });

    it("preserves object literal keys that match param name", () => {
      const result = inlineAndPrint("(p) => ({ p: 123 })");
      expect(result).toContain("p:");
      expect(result).not.toContain("props:");
    });

    it("replaces computed object keys that reference the param", () => {
      const result = inlineAndPrint("(p) => ({ [p]: 123 })");
      expect(result).toContain("[props]");
    });
  });

  describe("destructured param", () => {
    it("replaces destructured binding with props.propName", () => {
      const result = inlineAndPrint('({ color }) => color || "red"');
      expect(result).toContain("props.color");
    });

    it("preserves non-computed member property keys matching binding name", () => {
      // ({ size }) => tokens.size should NOT rewrite `.size`
      expect(inlineAndPrint("({ size }) => tokens.size")).toBe("tokens.size");
    });

    it("replaces computed member property keys referencing binding", () => {
      expect(inlineAndPrint("({ size }) => tokens[size]")).toBe("tokens[props.size]");
    });

    it("preserves object literal keys matching binding name", () => {
      const result = inlineAndPrint('({ color }) => ({ color: "red" })');
      expect(result).toContain("color:");
      expect(result).not.toContain("props.color:");
    });

    it("replaces computed object literal keys referencing binding", () => {
      const result = inlineAndPrint('({ color }) => ({ [color]: "red" })');
      expect(result).toContain("[props.color]");
    });

    it("handles renamed destructured binding with member collision", () => {
      // ({ size: s }) => tokens.s should NOT rewrite `.s`
      expect(inlineAndPrint("({ size: s }) => tokens.s")).toBe("tokens.s");
    });

    it("handles default values", () => {
      const result = inlineAndPrint('({ color = "blue" }) => color');
      expect(result).toContain("props.color");
      expect(result).toContain('"blue"');
    });
  });
});
