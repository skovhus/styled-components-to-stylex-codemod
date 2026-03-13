import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { replaceIdentifierInAst } from "./finalize-decl.js";

const j = jscodeshift.withParser("tsx");

/** Parse an expression and return the AST node. */
function parseExpr(code: string): unknown {
  const root = j(`const __x = ${code}`);
  const decl = root.find(j.VariableDeclarator).get();
  return decl.node.init;
}

/** Serialize an AST node back to source via recast. */
function print(node: unknown): string {
  const root = j(`const __x = 0`);
  root.find(j.VariableDeclarator).get().node.init = node;
  return root.toSource().replace("const __x = ", "").replace(/;\s*$/, "");
}

describe("replaceIdentifierInAst", () => {
  it("replaces identifier inside a template literal", () => {
    const node = parseExpr("`${size}px`");
    replaceIdentifierInAst(j, node, "size");
    expect(print(node)).toBe("`${props.size}px`");
  });

  it("replaces identifier in a function call argument", () => {
    const node = parseExpr("clamp(size)");
    replaceIdentifierInAst(j, node, "size");
    expect(print(node)).toBe("clamp(props.size)");
  });

  it("does NOT replace non-computed MemberExpression property names", () => {
    // Math.min(min, 100) — `min` in `Math.min` should NOT be replaced
    const node = parseExpr("Math.min(min, 100)");
    replaceIdentifierInAst(j, node, "min");
    expect(print(node)).toBe("Math.min(props.min, 100)");
  });

  it("does NOT replace non-computed property access matching param name", () => {
    // obj.size should remain obj.size, not obj.props.size
    const node = parseExpr("obj.size + size");
    replaceIdentifierInAst(j, node, "size");
    expect(print(node)).toBe("obj.size + props.size");
  });

  it("DOES replace computed MemberExpression property matching param name", () => {
    // obj[size] should become obj[props.size]
    const node = parseExpr("obj[size]");
    replaceIdentifierInAst(j, node, "size");
    expect(print(node)).toBe("obj[props.size]");
  });

  it("does NOT replace nested non-computed member property", () => {
    // config.theme.color — if param is "color", only the argument should change
    const node = parseExpr("fn(config.color, color)");
    replaceIdentifierInAst(j, node, "color");
    expect(print(node)).toBe("fn(config.color, props.color)");
  });

  it("replaces in spread element", () => {
    const node = parseExpr("({ ...rest })");
    replaceIdentifierInAst(j, node, "rest");
    expect(print(node)).toContain("props.rest");
  });

  it("handles shorthand properties built by jscodeshift builders", () => {
    // Build an ObjectExpression using j.property() (which creates "Property" nodes,
    // matching what the codemod's lowering pipeline produces)
    const obj = j.objectExpression([
      j.property("init", j.identifier("color"), j.identifier("color")),
    ]);
    // Mark as shorthand (jscodeshift builder doesn't do this automatically)
    (obj.properties[0] as unknown as Record<string, unknown>).shorthand = true;
    replaceIdentifierInAst(j, obj, "color");
    const prop = obj.properties[0] as unknown as Record<string, unknown>;
    expect(prop.shorthand).toBe(false);
    expect((prop.value as unknown as { type: string }).type).toBe("MemberExpression");
  });
});
