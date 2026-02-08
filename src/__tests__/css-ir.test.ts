import { describe, it, expect } from "vitest";
import jscodeshift from "jscodeshift";
import { compile } from "stylis";
import {
  findUniversalSelectorLineOffset,
  findSelectorLineOffset,
  normalizeStylisAstToIR,
} from "../internal/css-ir.js";

describe("findUniversalSelectorLineOffset", () => {
  it("returns 0 for universal selector on first line", () => {
    const css = "& * { color: red; }";
    expect(findUniversalSelectorLineOffset(css)).toBe(0);
  });

  it("returns line offset for universal selector on later line", () => {
    const css = `display: flex;
gap: 16px;

& > * {
  flex: 1;
}`;
    // `& > *` is on line 3 (0-indexed)
    expect(findUniversalSelectorLineOffset(css)).toBe(3);
  });

  it("ignores * in calc() expressions", () => {
    const css = `width: calc(100% * 2);
height: 100px;

& > * {
  flex: 1;
}`;
    // The `*` in calc should be skipped, `& > *` is on line 3
    expect(findUniversalSelectorLineOffset(css)).toBe(3);
  });

  it("ignores * in calc() with spaces", () => {
    const css = `width: calc(100% * 2);
& * { color: red; }`;
    // Line 0 has calc, line 1 has the selector
    expect(findUniversalSelectorLineOffset(css)).toBe(1);
  });

  it("ignores * followed by digits (multiplication)", () => {
    const css = `width: calc(2 * 3px);
& * { color: red; }`;
    expect(findUniversalSelectorLineOffset(css)).toBe(1);
  });

  it("ignores * preceded by digits (multiplication)", () => {
    const css = `width: calc(2* 3px);
& * { color: red; }`;
    expect(findUniversalSelectorLineOffset(css)).toBe(1);
  });

  it("handles * at start of string", () => {
    const css = "* { margin: 0; }";
    expect(findUniversalSelectorLineOffset(css)).toBe(0);
  });

  it("handles * with combinators", () => {
    const testCases = [
      { css: "& > * { }", expected: 0 },
      { css: "& + * { }", expected: 0 },
      { css: "& ~ * { }", expected: 0 },
      { css: "& * { }", expected: 0 },
    ];
    for (const { css, expected } of testCases) {
      expect(findUniversalSelectorLineOffset(css)).toBe(expected);
    }
  });

  it("handles * followed by pseudo-class", () => {
    const css = "*:not(.skip) { color: red; }";
    expect(findUniversalSelectorLineOffset(css)).toBe(0);
  });

  it("handles * followed by attribute selector", () => {
    const css = "*[data-active] { color: red; }";
    expect(findUniversalSelectorLineOffset(css)).toBe(0);
  });

  it("returns 0 when no universal selector found", () => {
    const css = "div { color: red; }";
    expect(findUniversalSelectorLineOffset(css)).toBe(0);
  });
});

describe("findSelectorLineOffset", () => {
  it("finds direct selector match", () => {
    const css = `color: red;

&:hover {
  color: blue;
}`;
    expect(findSelectorLineOffset(css, "&:hover")).toBe(2);
  });

  it("finds pseudo-class selectors", () => {
    const css = `display: block;

&:focus {
  outline: none;
}`;
    // Stylis might normalize to "&:focus" but we search for ":focus"
    expect(findSelectorLineOffset(css, "&:focus")).toBe(2);
  });

  it("finds pseudo-element selectors", () => {
    const css = `position: relative;

&::before {
  content: '';
}`;
    expect(findSelectorLineOffset(css, "&::before")).toBe(2);
  });

  it("finds class selectors", () => {
    const css = `color: red;

&.active {
  color: blue;
}`;
    expect(findSelectorLineOffset(css, "&.active")).toBe(2);
  });

  it("finds interpolation placeholders", () => {
    const css = `color: red;

&__SC_EXPR_0__ {
  color: blue;
}`;
    expect(findSelectorLineOffset(css, "&__SC_EXPR_0__")).toBe(2);
  });

  it("falls back to pseudo-class pattern when direct match fails", () => {
    // Stylis normalizes `& :hover` to `&:hover`, so direct match fails
    const css = `color: red;
& :hover {
  color: blue;
}`;
    // The selector from Stylis might be "&:hover" but raw CSS has "& :hover"
    // We search for ":hover" as fallback
    expect(findSelectorLineOffset(css, "&:hover")).toBe(1);
  });

  it("falls back to class pattern when direct match fails", () => {
    const css = `color: red;
& .highlight {
  color: blue;
}`;
    // The selector from Stylis might be "&.highlight" but raw CSS has "& .highlight"
    // We search for ".highlight" as fallback
    expect(findSelectorLineOffset(css, "&.highlight")).toBe(1);
  });

  it("returns 0 when selector not found", () => {
    const css = "color: red;";
    expect(findSelectorLineOffset(css, "&:hover")).toBe(0);
  });

  it("handles :not() pseudo-class", () => {
    const css = `display: block;

&:not(.disabled) {
  opacity: 1;
}`;
    expect(findSelectorLineOffset(css, "&:not(.disabled)")).toBe(2);
  });

  it("handles multiple selectors and finds first match", () => {
    const css = `&:hover { color: red; }
&:focus { color: blue; }`;
    expect(findSelectorLineOffset(css, "&:hover")).toBe(0);
    expect(findSelectorLineOffset(css, "&:focus")).toBe(1);
  });
});

describe("normalizeStylisAstToIR", () => {
  it("preserves at-rule stack when recovering pseudo placeholders", () => {
    const rawCss = `@media (min-width: 600px) {
  &:hover {
    __SC_EXPR_0__;
  }
}`;
    const placeholder = "__SC_EXPR_0__";
    const startOffset = rawCss.indexOf(placeholder);
    expect(startOffset).toBeGreaterThanOrEqual(0);
    const endOffset = startOffset + placeholder.length;

    const slots = [
      {
        index: 0,
        placeholder,
        expression: jscodeshift.identifier("expr"),
        startOffset,
        endOffset,
      },
    ];

    const stylisAst = compile(rawCss);
    const rules = normalizeStylisAstToIR(stylisAst, slots, { rawCss });
    const hoverRule = rules.find((r) => r.selector === "&:hover");
    expect(hoverRule).toBeDefined();
    expect(hoverRule?.atRuleStack.some((r) => r.startsWith("@media"))).toBe(true);
    expect(
      hoverRule?.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    ).toBe(true);
  });
});
