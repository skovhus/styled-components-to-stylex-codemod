import { describe, it, expect } from "vitest";
import jscodeshift, { type Expression } from "jscodeshift";
import {
  extractRootAndPath,
  getMemberPathFromIdentifier,
  staticValueToLiteral,
  literalToStaticValue,
} from "../internal/utilities/jscodeshift-utils";

const j = jscodeshift.withParser("tsx");

function parseExpr(code: string): Expression {
  const ast = j(`const x = ${code}`);
  const decl = ast.find(j.VariableDeclarator).nodes()[0];
  if (!decl?.init) {
    throw new Error("Failed to parse expression");
  }
  return decl.init;
}

describe("extractRootAndPath", () => {
  it("extracts simple identifier", () => {
    const expr = parseExpr("zIndex");
    const result = extractRootAndPath(expr);
    expect(result).toEqual({
      rootName: "zIndex",
      rootNode: expect.objectContaining({ type: "Identifier", name: "zIndex" }),
      path: [],
    });
  });

  it("extracts single-level member expression", () => {
    const expr = parseExpr("zIndex.modal");
    const result = extractRootAndPath(expr);
    expect(result).toEqual({
      rootName: "zIndex",
      rootNode: expect.objectContaining({ type: "Identifier", name: "zIndex" }),
      path: ["modal"],
    });
  });

  it("extracts deeply nested member expression", () => {
    const expr = parseExpr("config.ui.spacing.small");
    const result = extractRootAndPath(expr);
    expect(result).toEqual({
      rootName: "config",
      rootNode: expect.objectContaining({ type: "Identifier", name: "config" }),
      path: ["ui", "spacing", "small"],
    });
  });

  it("handles optional chaining", () => {
    const expr = parseExpr("obj?.prop?.nested");
    const result = extractRootAndPath(expr);
    expect(result).toEqual({
      rootName: "obj",
      rootNode: expect.objectContaining({ type: "Identifier", name: "obj" }),
      path: ["prop", "nested"],
    });
  });

  it("returns null for computed properties", () => {
    const expr = parseExpr("obj[prop]");
    expect(extractRootAndPath(expr)).toBeNull();
  });

  it("returns null for computed properties in chain", () => {
    const expr = parseExpr("obj.foo[bar].baz");
    expect(extractRootAndPath(expr)).toBeNull();
  });

  it("returns null for call expressions", () => {
    const expr = parseExpr("fn()");
    expect(extractRootAndPath(expr)).toBeNull();
  });

  it("returns null for member on call expression", () => {
    const expr = parseExpr("fn().prop");
    expect(extractRootAndPath(expr)).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(extractRootAndPath(null)).toBeNull();
    expect(extractRootAndPath(undefined)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(extractRootAndPath("string")).toBeNull();
    expect(extractRootAndPath(123)).toBeNull();
  });
});

describe("getMemberPathFromIdentifier", () => {
  it("returns path when root matches", () => {
    const expr = parseExpr("props.theme.color.primary");
    const result = getMemberPathFromIdentifier(expr, "props");
    expect(result).toEqual(["theme", "color", "primary"]);
  });

  it("returns empty array for exact root match", () => {
    const expr = parseExpr("props");
    const result = getMemberPathFromIdentifier(expr, "props");
    expect(result).toEqual([]);
  });

  it("returns null when root doesn't match", () => {
    const expr = parseExpr("other.theme");
    const result = getMemberPathFromIdentifier(expr, "props");
    expect(result).toBeNull();
  });

  it("returns null for computed properties", () => {
    const expr = parseExpr("props[key]");
    const result = getMemberPathFromIdentifier(expr, "props");
    expect(result).toBeNull();
  });
});

describe("staticValueToLiteral", () => {
  it("creates string literal from string value", () => {
    const node = staticValueToLiteral(j, "hello");
    expect(node.type).toBe("StringLiteral");
    expect(literalToStaticValue(node)).toBe("hello");
  });

  it("creates numeric literal from number value", () => {
    const node = staticValueToLiteral(j, 42);
    expect(node.type).toBe("NumericLiteral");
    expect(literalToStaticValue(node)).toBe(42);
  });

  it("creates numeric literal from zero", () => {
    const node = staticValueToLiteral(j, 0);
    expect(node.type).toBe("NumericLiteral");
    expect(literalToStaticValue(node)).toBe(0);
  });

  it("creates numeric literal from negative number", () => {
    const node = staticValueToLiteral(j, -10);
    expect(node.type).toBe("NumericLiteral");
    expect(literalToStaticValue(node)).toBe(-10);
  });

  it("creates boolean literal from true", () => {
    const node = staticValueToLiteral(j, true);
    expect(node.type).toBe("BooleanLiteral");
    expect(literalToStaticValue(node)).toBe(true);
  });

  it("creates boolean literal from false", () => {
    const node = staticValueToLiteral(j, false);
    expect(node.type).toBe("BooleanLiteral");
    expect(literalToStaticValue(node)).toBe(false);
  });

  it("round-trips with literalToStaticValue", () => {
    const values: Array<string | number | boolean> = ["test", 123, -5.5, true, false, ""];
    for (const value of values) {
      const node = staticValueToLiteral(j, value);
      expect(literalToStaticValue(node)).toBe(value);
    }
  });
});
