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
    // The var() branch is already a complete value and is left untouched; the
    // numeric branch keeps the authored `rem`.
    expect(build("cond ? `var(--w)` : SIZE", "", "rem", "width")).toBe(
      "cond ? `var(--w)` : `${SIZE}rem`",
    );
  });

  it("treats a non-px length unit branch as already complete", () => {
    expect(build('cond ? "10vh" : size', "", "px", "height")).toBe('cond ? "10vh" : `${size}px`');
  });

  it("keeps wrapping the whole conditional when no branch is a complete CSS length", () => {
    // Both branches are bare numerics — distributing is unnecessary, so the
    // original whole-expression wrapping behavior is preserved.
    expect(build("cond ? a : b", "", "px", "height")).toBe("`${cond ? a : b}px`");
  });

  it("does not append a unit suffix to a standalone calc() value", () => {
    expect(build("`calc(${x}px + 8px)`", "", "px", "height")).toBe("`calc(${x}px + 8px)`");
  });

  it("does not split the suffix on identifier-valued properties", () => {
    // `animation-name` is not length-valued: the trailing `in` is part of the
    // identifier, so the whole conditional stays wrapped (`fade-1pxin` /
    // `slide-in`) rather than `in` being treated as a CSS unit.
    expect(build('cond ? "fade-1px" : "slide-"', "", "in", "animationName")).toBe(
      '`${cond ? "fade-1px" : "slide-"}in`',
    );
  });

  it("leaves non-length properties whole so a partial unit still completes", () => {
    // `transition-duration` is not a gated length property, so the whole
    // conditional is wrapped and the `s` still completes `200m` to `200ms`.
    expect(build('cond ? "200m" : delay', "", "s", "transitionDuration")).toBe(
      '`${cond ? "200m" : delay}s`',
    );
  });
});
