import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { buildStaticClassNameExpr } from "../internal/emit-wrappers/style-expr-builders.js";

const j = jscodeshift.withParser("tsx");

/**
 * Helper: build the expression AST, wrap it in a variable declaration,
 * and print it via jscodeshift/recast to get the actual emitted source.
 */
function printExpr(
  staticClassName: string | undefined,
  bridgeClassVar: string | undefined,
): string | undefined {
  const expr = buildStaticClassNameExpr(j, staticClassName, bridgeClassVar);
  if (!expr) {
    return undefined;
  }

  // Wrap in `const x = <expr>;` so we can print it
  const decl = j.variableDeclaration("const", [j.variableDeclarator(j.identifier("x"), expr)]);
  const root = j("");
  root.find(j.Program).get().node.body.push(decl);
  const printed = root.toSource();
  // Extract just the expression part after "const x = "
  const match = printed.match(/const x = ([\s\S]+);/);
  return match?.[1];
}

describe("buildStaticClassNameExpr", () => {
  it("returns undefined when neither className nor bridgeClassVar", () => {
    expect(buildStaticClassNameExpr(j, undefined, undefined)).toBeUndefined();
  });

  it("returns a string literal for className only", () => {
    const result = printExpr("my-class", undefined);
    expect(result).toBe('"my-class"');
  });

  it("returns an identifier for bridgeClassVar only", () => {
    const result = printExpr(undefined, "fooBridgeClass");
    expect(result).toBe("fooBridgeClass");
  });

  it("returns a template literal combining both", () => {
    const result = printExpr("my-class", "fooBridgeClass");
    expect(result).toBe("`my-class ${fooBridgeClass}`");
  });

  // --- Template-sensitive character escaping ---

  it("escapes backslashes in className within template literal", () => {
    // className "foo\\bar" contains a literal backslash
    // The emitted template raw must escape it so \\b is not interpreted as \b (backspace)
    const result = printExpr("foo\\bar", "fooBridgeClass");
    expect(result).toBe("`foo\\\\bar ${fooBridgeClass}`");
  });

  it("escapes backticks in className within template literal", () => {
    const result = printExpr("foo`bar", "fooBridgeClass");
    expect(result).toBe("`foo\\`bar ${fooBridgeClass}`");
  });

  it("escapes ${ in className within template literal", () => {
    // className "foo${bar}" must not create an unintended interpolation
    const result = printExpr("foo${bar}", "fooBridgeClass");
    expect(result).toBe("`foo\\${bar} ${fooBridgeClass}`");
  });

  it("escapes multiple special characters together", () => {
    const result = printExpr("a\\b`c${d}", "fooBridgeClass");
    expect(result).toBe("`a\\\\b\\`c\\${d} ${fooBridgeClass}`");
  });
});
