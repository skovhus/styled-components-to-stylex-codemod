import { describe, expect, it } from "vitest";
import { formatOutput } from "../internal/utilities/format-output";

describe("formatOutput", () => {
  describe("props destructure blank line removal", () => {
    it("removes blank line after `} = props;` in function body", () => {
      const input = [
        "function Foo(props) {",
        "  const { a, b } = props;",
        "",
        "  return <div />;",
        "}",
        "",
      ].join("\n");

      const result = formatOutput(input);

      expect(result).toBe(
        ["function Foo(props) {", "  const { a, b } = props;", "  return <div />;", "}", ""].join(
          "\n",
        ),
      );
    });

    it("does not modify `} = props;` pattern inside a string literal", () => {
      const input = ['const code = "const { a } = props;\\n\\n  return 1";', ""].join("\n");

      const result = formatOutput(input);

      // The string content must remain unchanged
      expect(result).toBe(input);
    });

    it("does not modify `} = props;` pattern inside a template literal", () => {
      const input = ["const code = `", "  const { a } = props;", "", "  return 1;", "`;", ""].join(
        "\n",
      );

      const result = formatOutput(input);

      expect(result).toBe(input);
    });

    it("does not modify `} = props;` pattern inside a block comment", () => {
      const input = ["/*", "  const { a } = props;", "", "  return 1;", "*/", ""].join("\n");

      const result = formatOutput(input);

      expect(result).toBe(input);
    });

    it("handles multiple destructure sites correctly", () => {
      const input = [
        "function Foo(props) {",
        "  const { a } = props;",
        "",
        "  return <div />;",
        "}",
        "",
        "function Bar(props) {",
        "  const { b } = props;",
        "",
        "  return <span />;",
        "}",
        "",
      ].join("\n");

      const result = formatOutput(input);

      expect(result).toBe(
        [
          "function Foo(props) {",
          "  const { a } = props;",
          "  return <div />;",
          "}",
          "",
          "function Bar(props) {",
          "  const { b } = props;",
          "  return <span />;",
          "}",
          "",
        ].join("\n"),
      );
    });
  });
});
