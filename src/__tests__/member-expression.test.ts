import { describe, it, expect } from "vitest";
import jscodeshift, { type ArrowFunctionExpression, type Expression } from "jscodeshift";
import {
  extractRootAndPath,
  getArrowFnParamBindings,
  getMemberPathFromIdentifier,
  resolveIdentifierToPropName,
} from "../internal/utilities/jscodeshift-utils";

const j = jscodeshift.withParser("tsx");

function parseExpr(code: string): Expression {
  const ast = j(`const x = ${code}`);
  const decl = ast.find(j.VariableDeclarator).nodes()[0];
  if (!decl?.init) {
    throw new Error("Failed to parse expression");
  }
  return decl.init as Expression;
}

function parseArrowFn(code: string): ArrowFunctionExpression {
  const ast = j(`const x = ${code}`);
  const fn = ast.find(j.ArrowFunctionExpression).nodes()[0];
  if (!fn) {
    throw new Error("Expected arrow function expression");
  }
  return fn;
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

describe("getArrowFnParamBindings", () => {
  it("handles simple identifier param", () => {
    const fn = parseArrowFn("(props) => props.color");
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({ kind: "simple", paramName: "props" });
  });

  it("handles shorthand destructured param", () => {
    const fn = parseArrowFn("({ color }) => color");
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({
      kind: "destructured",
      bindings: new Map([["color", "color"]]),
    });
  });

  it("handles renamed destructured param", () => {
    const fn = parseArrowFn("({ color: color_ }) => color_");
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({
      kind: "destructured",
      bindings: new Map([["color_", "color"]]),
    });
  });

  it("handles destructured param with default value", () => {
    const fn = parseArrowFn('({ color = "red" }) => color');
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({
      kind: "destructured",
      bindings: new Map([["color", "color"]]),
    });
  });

  it("handles renamed destructured param with default value", () => {
    const fn = parseArrowFn('({ color: c = "red" }) => c');
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({
      kind: "destructured",
      bindings: new Map([["c", "color"]]),
    });
  });

  it("handles multiple destructured props", () => {
    const fn = parseArrowFn("({ color, size: s }) => color");
    const result = getArrowFnParamBindings(fn);
    expect(result).toEqual({
      kind: "destructured",
      bindings: new Map([
        ["color", "color"],
        ["s", "size"],
      ]),
    });
  });

  it("returns null for rest elements", () => {
    const fn = parseArrowFn("({ color, ...rest }) => color");
    const result = getArrowFnParamBindings(fn);
    expect(result).toBeNull();
  });

  it("returns null for multiple params", () => {
    const fn = parseArrowFn("(a, b) => a");
    const result = getArrowFnParamBindings(fn);
    expect(result).toBeNull();
  });

  it("returns null for no params", () => {
    const fn = parseArrowFn("() => 42");
    const result = getArrowFnParamBindings(fn);
    expect(result).toBeNull();
  });
});

describe("resolveIdentifierToPropName", () => {
  it("resolves renamed destructured prop", () => {
    const fn = parseArrowFn("({ color: color_ }) => color_");
    const bindings = getArrowFnParamBindings(fn);
    expect(bindings).not.toBeNull();
    const result = resolveIdentifierToPropName(fn.body, bindings!);
    expect(result).toBe("color");
  });

  it("resolves shorthand destructured prop", () => {
    const fn = parseArrowFn("({ color }) => color");
    const bindings = getArrowFnParamBindings(fn);
    expect(bindings).not.toBeNull();
    const result = resolveIdentifierToPropName(fn.body, bindings!);
    expect(result).toBe("color");
  });

  it("returns null for simple param bindings", () => {
    const fn = parseArrowFn("(props) => props");
    const bindings = getArrowFnParamBindings(fn);
    expect(bindings).not.toBeNull();
    const result = resolveIdentifierToPropName(fn.body, bindings!);
    expect(result).toBeNull();
  });

  it("returns null for unbound identifier", () => {
    const fn = parseArrowFn("({ color }) => size");
    const bindings = getArrowFnParamBindings(fn);
    expect(bindings).not.toBeNull();
    const result = resolveIdentifierToPropName(fn.body, bindings!);
    expect(result).toBeNull();
  });

  it("returns null for non-identifier node", () => {
    const fn = parseArrowFn("({ color }) => color + 1");
    const bindings = getArrowFnParamBindings(fn);
    expect(bindings).not.toBeNull();
    const result = resolveIdentifierToPropName(fn.body, bindings!);
    expect(result).toBeNull();
  });
});
