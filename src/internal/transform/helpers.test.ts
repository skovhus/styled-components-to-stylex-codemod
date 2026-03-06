import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import {
  toStyleKey,
  objectToAst,
  literalToAst,
  cssValueToJs,
  buildUnsupportedCssWarnings,
} from "./helpers.js";

const j = jscodeshift.withParser("tsx");

describe("toStyleKey", () => {
  it("lowercases the first character", () => {
    expect(toStyleKey("Box")).toBe("box");
    expect(toStyleKey("Container")).toBe("container");
  });

  it("keeps already-lowercase first character", () => {
    expect(toStyleKey("box")).toBe("box");
    expect(toStyleKey("container")).toBe("container");
  });

  it("handles single-character strings", () => {
    expect(toStyleKey("A")).toBe("a");
    expect(toStyleKey("z")).toBe("z");
  });
});

describe("literalToAst", () => {
  it("returns AST node for null", () => {
    const result = literalToAst(j, null);
    expect(result.type).toBe("Literal");
    expect(result.value).toBeNull();
  });

  it("returns AST node for string", () => {
    const result = literalToAst(j, "hello");
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("hello");
  });

  it("returns AST node for number", () => {
    const result = literalToAst(j, 42);
    expect(result.type).toBe("Literal");
    expect(result.value).toBe(42);
  });

  it("returns AST node for boolean", () => {
    const result = literalToAst(j, true);
    expect(result.type).toBe("Literal");
    expect(result.value).toBe(true);
  });

  it("returns identifier 'undefined' for undefined", () => {
    const result = literalToAst(j, undefined);
    expect(result.type).toBe("Identifier");
    expect(result.name).toBe("undefined");
  });

  it("returns string literal for bigint", () => {
    const result = literalToAst(j, BigInt(42));
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("42");
  });

  it("returns literal for symbol", () => {
    const result = literalToAst(j, Symbol("test"));
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("test");
  });

  it("returns literal for symbol without description", () => {
    const result = literalToAst(j, Symbol());
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("");
  });

  it("returns [Function] literal for function", () => {
    const result = literalToAst(j, () => {});
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("[Function]");
  });

  it("returns JSON string for objects", () => {
    const result = literalToAst(j, { a: 1 });
    expect(result.type).toBe("Literal");
    expect(result.value).toBe('{"a":1}');
  });

  it("returns [Object] for circular objects", () => {
    const obj: any = {};
    obj.self = obj;
    const result = literalToAst(j, obj);
    expect(result.type).toBe("Literal");
    expect(result.value).toBe("[Object]");
  });

  it("passes through AST nodes unchanged", () => {
    const node = j.identifier("test");
    const result = literalToAst(j, node);
    expect(result).toBe(node);
  });
});

describe("objectToAst", () => {
  it("creates an object expression for simple properties", () => {
    const result = objectToAst(j, { color: "red", fontSize: 16 });
    expect(result.type).toBe("ObjectExpression");
    expect(result.properties).toHaveLength(2);
  });

  it("uses identifier keys for valid JS identifiers", () => {
    const result = objectToAst(j, { color: "red" });
    const prop = result.properties[0];
    expect(prop.key.type).toBe("Identifier");
    expect(prop.key.name).toBe("color");
  });

  it("uses string literal keys for pseudo-class selectors", () => {
    const result = objectToAst(j, { ":hover": { color: "blue" } });
    const prop = result.properties[0];
    expect(prop.key.type).toBe("Literal");
    expect(prop.key.value).toBe(":hover");
  });

  it("uses string literal keys for @media queries", () => {
    const result = objectToAst(j, { "@media (min-width: 768px)": { color: "blue" } });
    const prop = result.properties[0];
    expect(prop.key.type).toBe("Literal");
    expect(prop.key.value).toBe("@media (min-width: 768px)");
  });

  it("handles nested objects recursively", () => {
    const result = objectToAst(j, {
      ":hover": { color: "blue", ":focus": { outline: "none" } },
    });
    expect(result.type).toBe("ObjectExpression");
    const hoverProp = result.properties[0];
    expect(hoverProp.value.type).toBe("ObjectExpression");
    expect(hoverProp.value.properties).toHaveLength(2);
  });

  it("handles __spreads", () => {
    const result = objectToAst(j, {
      __spreads: ["baseStyles"],
      color: "red",
    });
    expect(result.properties).toHaveLength(2);
    expect(result.properties[0].type).toBe("SpreadElement");
    expect(result.properties[0].argument.name).toBe("baseStyles");
  });

  it("skips __spreads, __propComments, __computedKeys in output properties", () => {
    const result = objectToAst(j, {
      __spreads: [],
      __propComments: {},
      __computedKeys: [],
      color: "red",
    });
    const propKeys = result.properties.map((p: any) => p.key?.name ?? p.key?.value);
    expect(propKeys).toEqual(["color"]);
  });

  it("handles __computedKeys", () => {
    const keyExpr = j.memberExpression(j.identifier("breakpoints"), j.identifier("phone"));
    const result = objectToAst(j, {
      color: "red",
      __computedKeys: [{ keyExpr, value: { fontSize: 14 } }],
    });
    const lastProp = result.properties[result.properties.length - 1];
    expect(lastProp.computed).toBe(true);
  });

  it("handles __propComments with string comment", () => {
    const result = objectToAst(j, {
      __propComments: { color: "fallback color" },
      color: "red",
    });
    const colorProp = result.properties.find((p: any) => p.key?.name === "color");
    expect(colorProp.comments).toHaveLength(1);
    expect(colorProp.comments[0].type).toBe("CommentBlock");
  });

  it("handles __propComments with leading and trailingLine", () => {
    const result = objectToAst(j, {
      __propComments: {
        color: { leading: "fallback", trailingLine: "override" },
      },
      color: "red",
    });
    const colorProp = result.properties.find((p: any) => p.key?.name === "color");
    expect(colorProp.comments).toHaveLength(2);
    expect(colorProp.comments[0].type).toBe("CommentBlock");
    expect(colorProp.comments[1].type).toBe("CommentLine");
  });
});

describe("cssValueToJs", () => {
  it("returns string for static string values", () => {
    expect(cssValueToJs({ kind: "static", value: "red" })).toBe("red");
  });

  it("returns number for numeric static values", () => {
    expect(cssValueToJs({ kind: "static", value: "42" })).toBe(42);
  });

  it("returns negative number for negative numeric values", () => {
    expect(cssValueToJs({ kind: "static", value: "-3.5" })).toBe(-3.5);
  });

  it("returns string for flex numeric values", () => {
    expect(cssValueToJs({ kind: "static", value: "1" }, false, "flex")).toBe("1");
  });

  it("appends !important when important flag is set", () => {
    expect(cssValueToJs({ kind: "static", value: "red" }, true)).toBe("red !important");
  });

  it("does not double-add !important", () => {
    expect(cssValueToJs({ kind: "static", value: "red !important" }, true)).toBe("red !important");
  });

  it("returns empty string for non-static values", () => {
    expect(cssValueToJs({ kind: "interpolated" })).toBe("");
  });
});

describe("buildUnsupportedCssWarnings", () => {
  it("creates warning for call-expression usage", () => {
    const result = buildUnsupportedCssWarnings([
      { reason: "call-expression", loc: { line: 1, column: 0 } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toContain("function call");
    expect(result[0]!.severity).toBe("warning");
  });

  it("creates warning for closure-variable usage", () => {
    const result = buildUnsupportedCssWarnings([
      { reason: "closure-variable", closureVariable: "myVar", loc: { line: 2, column: 0 } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toContain("closure variable");
    expect(result[0]!.context).toEqual({ variable: "myVar" });
  });

  it("creates warning for outside-styled-template usage", () => {
    const result = buildUnsupportedCssWarnings([
      { reason: "outside-styled-template", loc: { line: 3, column: 0 } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toContain("outside of a styled component");
  });

  it("handles multiple usages", () => {
    const result = buildUnsupportedCssWarnings([
      { reason: "call-expression", loc: { line: 1, column: 0 } },
      { reason: "outside-styled-template", loc: { line: 2, column: 0 } },
    ]);
    expect(result).toHaveLength(2);
  });

  it("includes loc when provided", () => {
    const loc = { line: 5, column: 10 };
    const result = buildUnsupportedCssWarnings([{ reason: "call-expression", loc }]);
    expect(result[0]!.loc).toEqual(loc);
  });

  it("handles null loc", () => {
    const result = buildUnsupportedCssWarnings([{ reason: "call-expression", loc: null }]);
    expect(result[0]!.loc).toBeUndefined();
  });
});
