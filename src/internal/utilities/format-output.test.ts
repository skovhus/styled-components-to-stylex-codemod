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
  it("applies multiline template literal indentation", () => {
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
});
