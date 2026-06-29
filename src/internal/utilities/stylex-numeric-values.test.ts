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

  it("does not append a unit suffix to a min() math-function branch", () => {
    expect(build('cond ? "min(100%, 200px)" : size', "", "px", "width")).toBe(
      'cond ? "min(100%, 200px)" : `${size}px`',
    );
  });

  it("distributes a non-px unit suffix into branches", () => {
    // The var() branch is already a complete value and is left untouched; the
    // numeric branch keeps the authored `rem`.
    expect(build("cond ? `var(--w)` : SIZE", "", "rem", "width")).toBe(
      "cond ? `var(--w)` : `${SIZE}rem`",
    );
  });

  it("fixes a calc() branch on a length prop excluded from the px-implicit set", () => {
    // `line-height` accepts lengths but is not px-implicit (a bare number is a
    // unitless multiplier). The math-function trigger still applies, so the
    // calc() branch is preserved instead of becoming invalid `calc(...)px`.
    expect(build("cond ? `calc(${h}px + 4px)` : h", "", "px", "lineHeight")).toBe(
      "cond ? `calc(${h}px + 4px)` : `${h}px`",
    );
  });

  it("keeps wrapping the whole conditional when no branch is a CSS math function", () => {
    // Neither branch is a calc()/min()/var() function, so the original
    // whole-expression wrapping behavior is preserved.
    expect(build("cond ? a : b", "", "px", "height")).toBe("`${cond ? a : b}px`");
  });

  it("does not append a unit suffix to a standalone calc() value", () => {
    expect(build("`calc(${x}px + 8px)`", "", "px", "height")).toBe("`calc(${x}px + 8px)`");
  });

  it("does not split the suffix on identifier values with no math-function branch", () => {
    // Neither `fade-1px` nor `slide-` is a CSS math function, so the whole
    // conditional stays wrapped (`animation-name` yields `fade-1pxin` /
    // `slide-in`) rather than `in` being mistaken for a CSS unit.
    expect(build('cond ? "fade-1px" : "slide-"', "", "in", "animationName")).toBe(
      '`${cond ? "fade-1px" : "slide-"}in`',
    );
  });

  it("leaves plain-string branches whole so a partial unit still completes", () => {
    // `200m` is not a math function, so the whole conditional is wrapped and the
    // `s` still completes it to `200ms`.
    expect(build('cond ? "200m" : delay', "", "s", "transitionDuration")).toBe(
      '`${cond ? "200m" : delay}s`',
    );
  });

  it("keeps the suffix on custom properties even past a var() branch", () => {
    // A custom property is an opaque token stream: `var(--prefix)in` may be an
    // intentional value (e.g. resolving to `slide-in`), so the `in` must stay.
    expect(build('cond ? "var(--prefix)" : "slide-"', "", "in", "--token")).toBe(
      '`${cond ? "var(--prefix)" : "slide-"}in`',
    );
  });
});
