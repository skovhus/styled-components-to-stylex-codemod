import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { createPropTestHelpers } from "./variant-utils.js";
import type { ArrowFnParamBindings } from "../utilities/jscodeshift-utils.js";

const j = jscodeshift.withParser("tsx");

function parseExpr(code: string) {
  const ast = j(`(${code})`);
  const stmt = ast.find(j.ExpressionStatement).get();
  return stmt.node.expression;
}

function makeDestructuredBindings(...names: string[]): ArrowFnParamBindings {
  const bindings = new Map<string, string>();
  for (const n of names) {
    bindings.set(n, n);
  }
  return { kind: "destructured", bindings };
}

describe("parseChainedTestInfo", () => {
  it("handles simple boolean prop", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(makeDestructuredBindings("$active"));
    const result = parseChainedTestInfo(parseExpr("$active"));
    expect(result).toEqual({ when: "$active", propName: "$active" });
  });

  it("handles chained && conditions", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(makeDestructuredBindings("$a", "$b"));
    const result = parseChainedTestInfo(parseExpr("$a && $b"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$a && $b");
    expect(result!.allPropNames).toEqual(["$a", "$b"]);
  });

  it("handles simple || conditions", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$active", "$completed"),
    );
    const result = parseChainedTestInfo(parseExpr("$active || $completed"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$active || $completed");
    expect(result!.allPropNames).toEqual(["$active", "$completed"]);
  });

  it("handles triple || chain", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c"),
    );
    const result = parseChainedTestInfo(parseExpr("$a || $b || $c"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$a || $b || $c");
    expect(result!.allPropNames).toEqual(["$a", "$b", "$c"]);
  });

  it("handles && wrapping || on the right: $a && ($b || $c)", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c"),
    );
    // Safe: "$a && $b || $c" is reparsed as $a && ($b || $c) because
    // parseVariantWhenToAst splits on && first
    const result = parseChainedTestInfo(parseExpr("$a && ($b || $c)"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$a && $b || $c");
    expect(result!.allPropNames).toEqual(["$a", "$b", "$c"]);
  });

  it("handles || on left of && chain: ($a || $b) && $c", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c"),
    );
    // Safe: "$a || $b && $c" is reparsed as ($a || $b) && $c because
    // parseVariantWhenToAst splits on && first, keeping "$a || $b" intact
    const result = parseChainedTestInfo(parseExpr("($a || $b) && $c"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$a || $b && $c");
    expect(result!.allPropNames).toEqual(["$a", "$b", "$c"]);
  });

  it("handles || on both sides of &&: ($a || $b) && ($c || $d)", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c", "$d"),
    );
    const result = parseChainedTestInfo(parseExpr("($a || $b) && ($c || $d)"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("$a || $b && $c || $d");
    expect(result!.allPropNames).toEqual(["$a", "$b", "$c", "$d"]);
  });

  it("handles negated || compound: !($a || $b)", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(makeDestructuredBindings("$a", "$b"));
    const result = parseChainedTestInfo(parseExpr("!($a || $b)"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("!($a || $b)");
    expect(result!.allPropNames).toEqual(["$a", "$b"]);
  });

  it("handles negated && compound: !($a && $b)", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(makeDestructuredBindings("$a", "$b"));
    const result = parseChainedTestInfo(parseExpr("!($a && $b)"));
    expect(result).not.toBeNull();
    expect(result!.when).toBe("!($a && $b)");
    expect(result!.allPropNames).toEqual(["$a", "$b"]);
  });

  it("bails on || wrapping && to prevent ambiguous when strings", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c"),
    );
    // ($a && $b) || $c — serializing as "$a && $b || $c" would be reparsed
    // by parseVariantWhenToAst as $a && ($b || $c) due to && splitting first
    const result = parseChainedTestInfo(parseExpr("($a && $b) || $c"));
    expect(result).toBeNull();
  });

  it("bails on || wrapping && on the right side", () => {
    const { parseChainedTestInfo } = createPropTestHelpers(
      makeDestructuredBindings("$a", "$b", "$c"),
    );
    const result = parseChainedTestInfo(parseExpr("$a || ($b && $c)"));
    expect(result).toBeNull();
  });
});
