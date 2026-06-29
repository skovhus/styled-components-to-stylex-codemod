import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import type { ExpressionKind } from "./stylex-numeric-values.js";
import { buildStylexValueWithStaticParts } from "./stylex-numeric-values.js";

const j = jscodeshift.withParser("tsx");

function parseExpr(code: string): ExpressionKind {
  const root = j(`const __x = ${code};`);
  const decl = root.find(j.VariableDeclarator).at(0);
  return (decl.get().value as { init: ExpressionKind }).init;
}

function print(expr: ExpressionKind): string {
  return j(j.expressionStatement(expr)).toSource().replace(/;$/, "");
}

// Mirrors the real template builder: wrap the expression with the static
// prefix/suffix as a template literal (the production caller passes this).
function buildTemplate(expr: ExpressionKind, prefix: string, suffix: string): ExpressionKind {
  return j.templateLiteral(
    [
      j.templateElement({ raw: prefix, cooked: prefix }, false),
      j.templateElement({ raw: suffix, cooked: suffix }, true),
    ],
    [expr],
  ) as ExpressionKind;
}

function build(code: string, prefix: string, suffix: string, prop: string, numeric: string[] = []) {
  return print(
    buildStylexValueWithStaticParts(
      j,
      parseExpr(code),
      prefix,
      suffix,
      prop,
      buildTemplate,
      false,
      {
        numericIdentifiers: new Set(numeric),
      },
    ),
  );
}

describe("buildStylexValueWithStaticParts", () => {
  it("does not append a unit suffix to a calc() branch of a conditional", () => {
    // The numeric branch keeps the `px` (not a provable numeric here); the
    // calc() branch must stay untouched — `calc(...)px` would be invalid CSS.
    expect(build("cond ? `calc(${HEADER}px + 8px)` : HEADER", "", "px", "height")).toBe(
      "cond ? `calc(${HEADER}px + 8px)` : `${HEADER}px`",
    );
  });

  it("omits px on a provable-numeric branch while leaving the calc branch intact", () => {
    expect(build("cond ? `calc(${HEADER}px + 8px)` : HEADER", "", "px", "height", ["HEADER"])).toBe(
      "cond ? `calc(${HEADER}px + 8px)` : HEADER",
    );
  });

  it("does not append a unit suffix to a calc() string-literal branch", () => {
    expect(build('cond ? "calc(100% - 40px)" : size', "", "px", "width")).toBe(
      'cond ? "calc(100% - 40px)" : `${size}px`',
    );
  });

  it("does not append a unit suffix to a percentage string-literal branch", () => {
    expect(build('cond ? "100%" : size', "", "px", "width")).toBe('cond ? "100%" : `${size}px`');
  });

  it("distributes a non-px unit suffix into branches", () => {
    // `ms` is never px-omittable, so the numeric branch keeps a template; the
    // var() branch is already a complete value and is left untouched.
    expect(build("cond ? `var(--d)` : DURATION", "", "ms", "transitionDuration")).toBe(
      "cond ? `var(--d)` : `${DURATION}ms`",
    );
  });

  it("keeps wrapping the whole conditional when no branch is a complete CSS length", () => {
    // Both branches are bare numerics — distributing is unnecessary, so the
    // original whole-expression wrapping behavior is preserved.
    expect(build("cond ? a : b", "", "px", "lineHeight")).toBe("`${cond ? a : b}px`");
  });

  it("does not append a unit suffix to a standalone calc() value", () => {
    expect(build("`calc(${x}px + 8px)`", "", "px", "height")).toBe("`calc(${x}px + 8px)`");
  });
});
