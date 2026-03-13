import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { buildEnumValueMap, resolveStaticExpressionValue } from "./jscodeshift-utils.js";

const j = jscodeshift.withParser("tsx");

function parseExpr(code: string) {
  const root = j(`const __x = ${code};`);
  const decl = root.find(j.VariableDeclarator).at(0);
  return (decl.get().value as { init: unknown }).init;
}

describe("buildEnumValueMap", () => {
  it("extracts string enum members", () => {
    const root = j(`
      enum Color { Red = "red", Green = "green", Blue = "blue" }
    `);
    const map = buildEnumValueMap(root, j);
    expect(map.get("Color")).toEqual(
      new Map([
        ["Red", "red"],
        ["Green", "green"],
        ["Blue", "blue"],
      ]),
    );
  });

  it("extracts numeric enum members with auto-increment", () => {
    const root = j(`enum Direction { Up, Down, Left, Right }`);
    const map = buildEnumValueMap(root, j);
    expect(map.get("Direction")).toEqual(
      new Map([
        ["Up", 0],
        ["Down", 1],
        ["Left", 2],
        ["Right", 3],
      ]),
    );
  });

  it("extracts numeric enum with explicit start value", () => {
    const root = j(`enum Status { Active = 10, Inactive, Deleted }`);
    const map = buildEnumValueMap(root, j);
    expect(map.get("Status")).toEqual(
      new Map([
        ["Active", 10],
        ["Inactive", 11],
        ["Deleted", 12],
      ]),
    );
  });

  it("handles multiple enums in the same file", () => {
    const root = j(`
      enum A { X = "x" }
      enum B { Y = "y" }
    `);
    const map = buildEnumValueMap(root, j);
    expect(map.has("A")).toBe(true);
    expect(map.has("B")).toBe(true);
    expect(map.get("A")?.get("X")).toBe("x");
    expect(map.get("B")?.get("Y")).toBe("y");
  });

  it("handles exported enums", () => {
    const root = j(`export enum Visibility { Visible = "visible", Hidden = "hidden" }`);
    const map = buildEnumValueMap(root, j);
    expect(map.get("Visibility")?.get("Visible")).toBe("visible");
  });

  it("returns empty map when no enums exist", () => {
    const root = j(`const x = 1;`);
    const map = buildEnumValueMap(root, j);
    expect(map.size).toBe(0);
  });

  it("skips members with non-literal initializers", () => {
    const root = j(`enum Mixed { A = "a", B = someFunction(), C = "c" }`);
    const map = buildEnumValueMap(root, j);
    const members = map.get("Mixed");
    expect(members?.get("A")).toBe("a");
    expect(members?.has("B")).toBe(false);
    expect(members?.get("C")).toBe("c");
  });
});

describe("resolveStaticExpressionValue", () => {
  it("returns literal values without enum map", () => {
    expect(resolveStaticExpressionValue(parseExpr('"hello"'), undefined)).toBe("hello");
    expect(resolveStaticExpressionValue(parseExpr("42"), undefined)).toBe(42);
    expect(resolveStaticExpressionValue(parseExpr("true"), undefined)).toBe(true);
  });

  it("resolves enum member expressions", () => {
    const enumMap = new Map([
      ["Color", new Map<string, string | number | boolean>([["Red", "red"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr("Color.Red"), enumMap)).toBe("red");
  });

  it("returns null for unknown enum names", () => {
    const enumMap = new Map([
      ["Color", new Map<string, string | number | boolean>([["Red", "red"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr("Unknown.Red"), enumMap)).toBeNull();
  });

  it("returns null for unknown enum members", () => {
    const enumMap = new Map([
      ["Color", new Map<string, string | number | boolean>([["Red", "red"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr("Color.Unknown"), enumMap)).toBeNull();
  });

  it("returns null for computed member expressions", () => {
    const enumMap = new Map([
      ["Color", new Map<string, string | number | boolean>([["Red", "red"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr('Color["Red"]'), enumMap)).toBeNull();
  });

  it("returns null for non-identifier objects", () => {
    const enumMap = new Map([
      ["Color", new Map<string, string | number | boolean>([["Red", "red"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr("a.b.Red"), enumMap)).toBeNull();
  });

  it("prefers literal value over enum lookup", () => {
    const enumMap = new Map([
      ["x", new Map<string, string | number | boolean>([["y", "enum-value"]])],
    ]);
    expect(resolveStaticExpressionValue(parseExpr('"literal"'), enumMap)).toBe("literal");
  });

  it("returns null for null/undefined input", () => {
    expect(resolveStaticExpressionValue(null, undefined)).toBeNull();
    expect(resolveStaticExpressionValue(undefined, undefined)).toBeNull();
  });
});
