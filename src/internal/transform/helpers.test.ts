import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import {
  objectToAst,
  literalToAst,
  cssValueToJs,
  buildUnsupportedCssWarnings,
  toStyleKey,
  stripStyledPrefix,
} from "./helpers.js";

const j = jscodeshift.withParser("tsx");

describe("toStyleKey", () => {
  it("lowercases the first character", () => {
    expect(toStyleKey("Button")).toBe("button");
    expect(toStyleKey("NormalName")).toBe("normalName");
    expect(toStyleKey("StyledButton")).toBe("styledButton");
  });
});

describe("stripStyledPrefix", () => {
  it("strips 'Styled' prefix (uppercase S) followed by uppercase letter", () => {
    expect(stripStyledPrefix("StyledButton")).toBe("Button");
    expect(stripStyledPrefix("StyledCanvas")).toBe("Canvas");
    expect(stripStyledPrefix("StyledSection")).toBe("Section");
  });

  it("strips 'styled' prefix (lowercase s) followed by uppercase letter", () => {
    expect(stripStyledPrefix("styledButton")).toBe("Button");
    expect(stripStyledPrefix("styledCanvas")).toBe("Canvas");
  });

  it("does not strip when not followed by an uppercase letter", () => {
    expect(stripStyledPrefix("styled")).toBe("styled");
    expect(stripStyledPrefix("Styled")).toBe("Styled");
    expect(stripStyledPrefix("styledcanvas")).toBe("styledcanvas");
  });

  it("does not strip partial matches", () => {
    expect(stripStyledPrefix("Style")).toBe("Style");
    expect(stripStyledPrefix("StyleButton")).toBe("StyleButton");
    expect(stripStyledPrefix("Stylish")).toBe("Stylish");
  });
});

describe("literalToAst", () => {
  it("passes through AST nodes unchanged", () => {
    const node = j.identifier("test");
    expect(literalToAst(j, node)).toBe(node);
  });

  it("handles all JS primitive types", () => {
    expect(literalToAst(j, null).value).toBeNull();
    expect(literalToAst(j, "hello").value).toBe("hello");
    expect(literalToAst(j, 42).value).toBe(42);
    expect(literalToAst(j, true).value).toBe(true);
    expect(literalToAst(j, undefined).name).toBe("undefined");
  });

  it("handles exotic types without crashing", () => {
    expect(literalToAst(j, BigInt(42)).value).toBe("42");
    expect(literalToAst(j, Symbol("test")).value).toBe("test");
    expect(literalToAst(j, Symbol()).value).toBe("");
    expect(literalToAst(j, () => {}).value).toBe("[Function]");
  });

  it("handles circular objects gracefully", () => {
    const obj: any = {};
    obj.self = obj;
    expect(literalToAst(j, obj).value).toBe("[Object]");
  });
});

describe("objectToAst", () => {
  it("uses string literal keys for pseudo-selectors and at-rules", () => {
    const hover = objectToAst(j, { ":hover": { color: "blue" } });
    expect(hover.properties[0].key.type).toBe("Literal");

    const media = objectToAst(j, { "@media (min-width: 768px)": { color: "blue" } });
    expect(media.properties[0].key.type).toBe("Literal");

    const pseudo = objectToAst(j, { "::before": { content: "''" } });
    expect(pseudo.properties[0].key.type).toBe("Literal");
  });

  it("uses identifier keys for regular JS property names", () => {
    const result = objectToAst(j, { color: "red" });
    expect(result.properties[0].key.type).toBe("Identifier");
  });

  it("handles __spreads by emitting SpreadElements", () => {
    const result = objectToAst(j, { __spreads: ["baseStyles"], color: "red" });
    expect(result.properties[0].type).toBe("SpreadElement");
    expect(result.properties[0].argument.name).toBe("baseStyles");
  });

  it("handles __computedKeys with computed: true flag", () => {
    const keyExpr = j.memberExpression(j.identifier("bp"), j.identifier("phone"));
    const result = objectToAst(j, {
      __computedKeys: [{ keyExpr, value: { fontSize: 14 } }],
    });
    const lastProp = result.properties[result.properties.length - 1];
    expect(lastProp.computed).toBe(true);
  });

  it("attaches comments from __propComments", () => {
    const result = objectToAst(j, {
      __propComments: { color: { leading: "fallback", trailingLine: "override" } },
      color: "red",
    });
    const colorProp = result.properties.find((p: any) => p.key?.name === "color");
    expect(colorProp.comments).toHaveLength(2);
    expect(colorProp.comments[0].type).toBe("CommentBlock");
    expect(colorProp.comments[1].type).toBe("CommentLine");
  });

  it("skips empty/whitespace-only comments", () => {
    const result = objectToAst(j, {
      __propComments: { color: { leading: "  ", trailingLine: "" } },
      color: "red",
    });
    const colorProp = result.properties.find((p: any) => p.key?.name === "color");
    // No comments array should be set (jscodeshift nodes default comments to null)
    expect(colorProp.comments).toBeFalsy();
  });
});

describe("cssValueToJs", () => {
  it("coerces integer strings to numbers", () => {
    expect(cssValueToJs({ kind: "static", value: "42" })).toBe(42);
    expect(cssValueToJs({ kind: "static", value: "0" })).toBe(0);
    expect(cssValueToJs({ kind: "static", value: "-3" })).toBe(-3);
  });

  it("coerces decimal strings to numbers", () => {
    expect(cssValueToJs({ kind: "static", value: "0.5" })).toBe(0.5);
    expect(cssValueToJs({ kind: "static", value: "-3.5" })).toBe(-3.5);
  });

  it("coerces leading-dot decimals (.5) to numbers", () => {
    expect(cssValueToJs({ kind: "static", value: ".5" })).toBe(0.5);
    expect(cssValueToJs({ kind: "static", value: "-.5" })).toBe(-0.5);
  });

  it("strips px suffix and returns bare numbers", () => {
    expect(cssValueToJs({ kind: "static", value: "26px" })).toBe(26);
    expect(cssValueToJs({ kind: "static", value: "12px" })).toBe(12);
    expect(cssValueToJs({ kind: "static", value: "1px" })).toBe(1);
    expect(cssValueToJs({ kind: "static", value: "0px" })).toBe(0);
    expect(cssValueToJs({ kind: "static", value: "0.5px" })).toBe(0.5);
    expect(cssValueToJs({ kind: "static", value: "-10px" })).toBe(-10);
    expect(cssValueToJs({ kind: "static", value: "8px" })).toBe(8);
  });

  it("preserves non-px unit strings", () => {
    expect(cssValueToJs({ kind: "static", value: "1rem" })).toBe("1rem");
    expect(cssValueToJs({ kind: "static", value: "100%" })).toBe("100%");
    expect(cssValueToJs({ kind: "static", value: "2em" })).toBe("2em");
    expect(cssValueToJs({ kind: "static", value: "50vh" })).toBe("50vh");
  });

  it("keeps custom property values as strings", () => {
    expect(cssValueToJs({ kind: "static", value: "16px" }, false, "--base-size")).toBe("16px");
    expect(cssValueToJs({ kind: "static", value: "42" }, false, "--count")).toBe("42");
    expect(cssValueToJs({ kind: "static", value: "0.5" }, false, "--opacity")).toBe("0.5");
    expect(cssValueToJs({ kind: "static", value: "red" }, false, "--color")).toBe("red");
  });

  it("keeps flex values as strings even when numeric", () => {
    expect(cssValueToJs({ kind: "static", value: "1" }, false, "flex")).toBe("1");
    expect(cssValueToJs({ kind: "static", value: "0" }, false, "flex")).toBe("0");
  });

  it("appends !important and avoids double-adding", () => {
    expect(cssValueToJs({ kind: "static", value: "red" }, true)).toBe("red !important");
    expect(cssValueToJs({ kind: "static", value: "red !important" }, true)).toBe("red !important");
  });

  it("returns empty string for non-static (interpolated) values", () => {
    expect(cssValueToJs({ kind: "interpolated" })).toBe("");
  });
});

describe("buildUnsupportedCssWarnings", () => {
  it("maps reason to human-readable warning types", () => {
    const callExpr = buildUnsupportedCssWarnings([
      { reason: "call-expression", loc: { line: 1, column: 0 } },
    ]);
    expect(callExpr[0]!.type).toContain("function call");

    const closure = buildUnsupportedCssWarnings([
      { reason: "closure-variable", closureVariable: "myVar", loc: { line: 2, column: 0 } },
    ]);
    expect(closure[0]!.type).toContain("closure variable");
    expect(closure[0]!.context).toEqual({ variable: "myVar" });

    const outside = buildUnsupportedCssWarnings([
      { reason: "outside-styled-template", loc: { line: 3, column: 0 } },
    ]);
    expect(outside[0]!.type).toContain("outside of a styled component");
  });

  it("converts null loc to undefined", () => {
    const result = buildUnsupportedCssWarnings([{ reason: "call-expression", loc: null }]);
    expect(result[0]!.loc).toBeUndefined();
  });
});
