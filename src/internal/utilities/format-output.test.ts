import { describe, expect, it } from "vitest";

import { formatOutput, indentMultilineTemplateLiterals } from "./format-output.js";

describe("indentMultilineTemplateLiterals", () => {
  it("indents continuation lines two spaces past the opening property line", () => {
    const input = [
      "    boxShadow: {",
      "      default: 'none',",
      "      ':is([data-state=\"active\"])': `",
      "    0 0 0 1px ${token},",
      "    0 1px 2px rgba(0, 0, 0, 0.1)`,",
      "    },",
    ].join("\n");

    const output = indentMultilineTemplateLiterals(input);

    expect(output).toBe(
      [
        "    boxShadow: {",
        "      default: 'none',",
        "      ':is([data-state=\"active\"])': `",
        "        0 0 0 1px ${token},",
        "        0 1px 2px rgba(0, 0, 0, 0.1)`,",
        "    },",
      ].join("\n"),
    );
  });

  it("leaves single-line template literals unchanged", () => {
    const input = "      color: `red`,";
    expect(indentMultilineTemplateLiterals(input)).toBe(input);
  });
});

describe("formatOutput", () => {
  it("applies multiline template literal indentation inside stylex.create", () => {
    const input = [
      "const styles = stylex.create({",
      "  tab: {",
      "    ':is([data-state=\"active\"])': `",
      "  0 0 0 1px,",
      "  0 1px`,",
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).toContain("':is([data-state=\"active\"])': `");
    expect(output).toContain("      0 0 0 1px,");
    expect(output).toContain("      0 1px`,");
  });

  it("does not reindent multiline template literals outside stylex.create", () => {
    const input = [
      "const messages = {",
      "  text: `",
      "    hello",
      "  `,",
      "};",
      "const styles = stylex.create({",
      "  tab: {",
      "    ':is([data-state=\"active\"])': `",
      "  0 0 0 1px,",
      "  0 1px`,",
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).toContain("    hello");
    expect(output).toContain("  `,");
    expect(output).toContain("      0 0 0 1px,");
  });

  it("removes blank lines between style keys", () => {
    const input = [
      "const styles = stylex.create({",
      "  banner: {",
      '    color: "red",',
      "  },",
      "",
      "  overlay: {",
      '    color: "blue",',
      "  },",
      "});",
      "",
    ].join("\n");

    expect(formatOutput(input)).not.toContain("\n\n  overlay:");
  });

  it("removes blank lines when a comment inside the block contains an apostrophe", () => {
    // The apostrophe in `base's` previously made the brace-tracking parser treat
    // the rest of the block as an unterminated string, so blank lines survived.
    const input = [
      "const styles = stylex.create({",
      "  banner: {",
      '    color: "red",',
      "  },",
      "",
      "  // the base's blue must reset here",
      "  overlay: {",
      '    color: "blue",',
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).toContain("// the base's blue must reset here");
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*\/\/ the base's/);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*overlay:/);
  });

  it("removes blank lines before computed keys and float keys", () => {
    const input = [
      "const styles = stylex.create({",
      "  0.4: {",
      "    opacity: 0.4,",
      "  },",
      "",
      "  badge: {",
      "    color: {",
      "      default: null,",
      "",
      '      [stylex.when.siblingBefore(":hover", LinkMarker)]: "yellow",',
      "    },",
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*badge:/);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*\[stylex\.when/);
  });

  it("preserves blank lines inside multiline template literal values", () => {
    const input = [
      "const styles = stylex.create({",
      "  tab: {",
      "    boxShadow: `",
      "      0 0 0 1px,",
      "",
      "      0 1px 2px`,",
      "  },",
      "",
      "  other: {",
      '    color: "red",',
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    // The blank line inside the template literal value is part of the CSS value
    // and must survive, but the blank line between style keys must not.
    expect(output).toMatch(/0 0 0 1px,\n\s*\n\s*0 1px 2px/);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*other:/);
  });

  it("ignores backticks inside comments when protecting template values", () => {
    // An unmatched backtick in a preserved comment must not flip template
    // tracking; otherwise the following real template value loses its blank line.
    const input = [
      "const styles = stylex.create({",
      "  // reference to `someToken in a note",
      "  tab: {",
      "    boxShadow: `",
      "      0 0 0 1px,",
      "",
      "      0 1px 2px`,",
      "  },",
      "",
      "  other: {",
      '    color: "red",',
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).toMatch(/0 0 0 1px,\n\s*\n\s*0 1px 2px/);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*other:/);
  });

  it("preserves blank lines inside multiline block comments", () => {
    const input = [
      "const styles = stylex.create({",
      "  /* first note",
      "",
      "     second note */",
      "  tab: {",
      '    color: "red",',
      "  },",
      "",
      "  other: {",
      '    color: "blue",',
      "  },",
      "});",
      "",
    ].join("\n");

    const output = formatOutput(input);
    expect(output).toMatch(/first note\n\s*\n\s*second note/);
    expect(output).not.toMatch(/\n[ \t]*\n[ \t]*other:/);
  });
});
