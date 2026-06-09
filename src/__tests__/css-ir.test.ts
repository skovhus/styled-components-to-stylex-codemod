import { describe, it, expect } from "vitest";
import { compile } from "stylis";
import {
  findUniversalSelectorLineOffset,
  findSelectorLineOffset,
  normalizeStylisAstToIR,
} from "../internal/css-ir.js";
import type { StyledInterpolationSlot } from "../internal/styled-css.js";

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

  it("finds element selectors (Stylis '& svg' → raw 'svg {')", () => {
    const css = `padding: 16px;

  svg {
    fill: blue;
  }`;
    expect(findSelectorLineOffset(css, "& svg")).toBe(2);
  });

  it("finds child combinator element selectors (Stylis '& > button' → raw '> button {')", () => {
    const css = `color: red;

  > button {
    opacity: 0.5;
  }`;
    expect(findSelectorLineOffset(css, "& > button")).toBe(2);
  });

  it("finds adjacent sibling selectors (Stylis '&+span' → raw '+ span {')", () => {
    const css = `color: red;

  & + span {
    margin-left: 8px;
  }`;
    expect(findSelectorLineOffset(css, "&+span")).toBe(2);
  });

  it("finds general sibling selectors (Stylis '&~div' → raw '~ div {')", () => {
    const css = `color: red;

  & ~ div {
    opacity: 0.5;
  }`;
    expect(findSelectorLineOffset(css, "&~div")).toBe(2);
  });

  it("finds sibling selectors written without & (Stylis '&+span' → raw '+ span {')", () => {
    const css = `color: red;

  + span {
    margin-left: 8px;
  }`;
    expect(findSelectorLineOffset(css, "&+span")).toBe(2);
  });

  it("finds child combinator with Stylis-normalized spaces (Stylis '&>button' → raw '> button {')", () => {
    const css = `color: red;

  > button {
    opacity: 0.5;
  }`;
    expect(findSelectorLineOffset(css, "&>button")).toBe(2);
  });
});

/** Helper to create a minimal slot for testing (expression is unused by the IR). */
function makeSlot(index: number): StyledInterpolationSlot {
  return {
    index,
    placeholder: `__SC_EXPR_${index}__`,
    expression: null as never,
    startOffset: 0,
    endOffset: 0,
  };
}

function makeIdentifierSlot(index: number): StyledInterpolationSlot {
  return {
    ...makeSlot(index),
    expression: {
      type: "Identifier",
      name: "focusOutline",
    } as StyledInterpolationSlot["expression"],
  };
}

describe("normalizeStylisAstToIR – placeholders inside CSS functions are not recovered as standalone", () => {
  it("placeholder inside min() is not recovered as a property-less declaration", () => {
    // Simulates: max-width: min(calc(50cqw - __SC_EXPR_0__), __SC_EXPR_1__);
    const rawCss = `& {
  display: flex;
  max-width: min(
    calc(50cqw - __SC_EXPR_0__),
    __SC_EXPR_1__
  );
}`;
    const slots = [makeSlot(0), makeSlot(1)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    // There should be NO property-less recovered declarations — both placeholders
    // are part of the max-width value, not standalone mixin interpolations.
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toHaveLength(0);
  });

  it("placeholder inside calc() is not recovered as a property-less declaration", () => {
    const rawCss = `& {
  width: calc(100% - __SC_EXPR_0__);
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toHaveLength(0);
  });

  it("placeholder inside linear-gradient() is not recovered as a property-less declaration", () => {
    const rawCss = `& {
  background: linear-gradient(
    __SC_EXPR_0__,
    __SC_EXPR_1__
  );
}`;
    const slots = [makeSlot(0), makeSlot(1)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toHaveLength(0);
  });

  it("standalone placeholder outside parens is still recovered", () => {
    const rawCss = `& {
  __SC_EXPR_0__;
  max-width: min(100px, __SC_EXPR_1__);
}`;
    const slots = [makeSlot(0), makeSlot(1)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    // Only slot 0 should be recovered as standalone; slot 1 is inside min()
    expect(recovered).toHaveLength(1);
    const decl = recovered[0]!.declarations.find(
      (d) => d.property === "" && d.value.kind === "interpolated",
    )!;
    const slotPart = (decl.value as { parts: Array<{ kind: string; slotId?: number }> }).parts[0];
    expect(slotPart?.slotId).toBe(0);
  });

  it("placeholder in multi-value shorthand (outside parens) is not double-recovered", () => {
    // Simulates: background: linear-gradient(__SC_EXPR_0__, __SC_EXPR_0__), __SC_EXPR_1__;
    // Stylis correctly places __SC_EXPR_1__ in the background declaration.
    // The recovery pass must not create a duplicate property-less declaration for it.
    const rawCss = `& {
  background:
    linear-gradient(
      __SC_EXPR_0__,
      __SC_EXPR_0__
    ),
    __SC_EXPR_1__;
}`;
    const slots = [makeSlot(0), makeSlot(1)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    // Neither slot should be recovered as standalone — both are part of the background value
    expect(recovered).toHaveLength(0);
    // Verify slot 1 IS present in the background declaration
    const bgDecl = rules.flatMap((r) => r.declarations).find((d) => d.property === "background");
    expect(bgDecl).toBeDefined();
    const bgParts = (bgDecl!.value as { parts: Array<{ kind: string; slotId?: number }> }).parts;
    expect(bgParts.some((p) => p.kind === "slot" && p.slotId === 1)).toBe(true);
  });

  it("parentheses inside quoted strings do not affect parenDepth", () => {
    // content: "(" should not bump parenDepth, so the standalone placeholder is still recovered
    const rawCss = `& {
  content: "(";
  __SC_EXPR_0__;
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toHaveLength(1);
  });

  it("parentheses inside CSS comments do not affect parenDepth", () => {
    // /* TODO: use min( */ should not bump parenDepth
    const rawCss = `& {
  /* TODO: use min( */
  __SC_EXPR_0__;
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.filter((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toHaveLength(1);
  });
});

describe("normalizeStylisAstToIR – line comment placement", () => {
  it("keeps standalone // comments as leading comments for the next declaration", () => {
    const rawCss = `& {
  width: 20px !important;
  height: 20px !important;

  // aligns due to empty space around the icon
  margin: 0 -1px;
}`;
    const rules = normalizeStylisAstToIR(compile(rawCss), [], { rawCss });
    const declarations = rules.find((rule) => rule.selector === "&")?.declarations ?? [];
    const height = declarations.find((decl) => decl.property === "height");
    const margin = declarations.find((decl) => decl.property === "margin");

    expect(height?.trailingLineComment).toBeUndefined();
    expect(margin?.leadingLineComment).toBe("aligns due to empty space around the icon");
  });

  it("keeps inline // comments as trailing comments on the current declaration", () => {
    const rawCss = `& {
  color: red; // document the color
  margin: 0 -1px;
}`;
    const rules = normalizeStylisAstToIR(compile(rawCss), [], { rawCss });
    const declarations = rules.find((rule) => rule.selector === "&")?.declarations ?? [];
    const color = declarations.find((decl) => decl.property === "color");
    const margin = declarations.find((decl) => decl.property === "margin");

    expect(color?.trailingLineComment).toBe("document the color");
    expect(margin?.leadingLineComment).toBeUndefined();
  });
});

describe("normalizeStylisAstToIR – recovered placeholders preserve @media scope", () => {
  it("preserves recovered placeholder order in multiline selector lists", () => {
    const rawCss = `& {
  &:hover,
  &:focus {
    outline-color: red;
    __SC_EXPR_0__;
    outline-color: green;
  }
}`;
    const slots = [makeIdentifierSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const rule = rules.find((r) => r.selector === "&:hover,&:focus");

    expect(rule).toBeDefined();
    expect(rule!.declarations.map((d) => d.property)).toEqual([
      "outline-color",
      "",
      "outline-color",
    ]);
  });

  it("placeholder inside @media + selector gets the @media at-rule", () => {
    const rawCss = `& {
@media (min-width: 600px) {
  &[data-state="active"] {
    __SC_EXPR_0__;
  }
}
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.find((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toBeDefined();
    expect(recovered!.atRuleStack).toEqual(["@media (min-width: 600px)"]);
  });

  it("placeholder at top level inside @media (no selector) gets @media scope", () => {
    const rawCss = `& {
@media (min-width: 600px) {
  __SC_EXPR_0__;
}
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.find((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toBeDefined();
    expect(recovered!.atRuleStack).toEqual(["@media (min-width: 600px)"]);
  });

  it("placeholder outside @media has empty at-rule stack", () => {
    const rawCss = `& {
  __SC_EXPR_0__;
}`;
    const slots = [makeSlot(0)];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const recovered = rules.find((r) =>
      r.declarations.some((d) => d.property === "" && d.value.kind === "interpolated"),
    );
    expect(recovered).toBeDefined();
    expect(recovered!.atRuleStack).toEqual([]);
  });
});
