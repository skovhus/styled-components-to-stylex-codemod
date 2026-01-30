import { describe, it, expect } from "vitest";
import jscodeshift, { type Expression } from "jscodeshift";
import {
  extractRootAndPath,
  getMemberPathFromIdentifier,
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
