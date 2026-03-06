import { describe, it, expect } from "vitest";
import type { WarningLog } from "../logger.js";
import { parseSwitchReturningCssTemplates } from "./switch-variants.js";

function isCssHelperTaggedTemplate(expr: any): expr is { quasi: any } {
  return (
    expr &&
    typeof expr === "object" &&
    expr.type === "TaggedTemplateExpression" &&
    expr.tag?.name === "css"
  );
}

function makeSwitchStmt(args: {
  discriminant: string;
  cases: Array<{
    test: { type: string; value: string } | null;
    consequent: any[];
  }>;
}) {
  return {
    type: "SwitchStatement",
    discriminant: { type: "Identifier", name: args.discriminant },
    cases: args.cases.map((c) => ({
      test: c.test,
      consequent: c.consequent,
    })),
  };
}

function makeCssReturnStmt(content: string) {
  return {
    type: "ReturnStatement",
    argument: {
      type: "TaggedTemplateExpression",
      tag: { name: "css" },
      quasi: { content },
    },
  };
}

describe("parseSwitchReturningCssTemplates", () => {
  it("returns null for non-switch statement", () => {
    const warnings: WarningLog[] = [];
    const result = parseSwitchReturningCssTemplates({
      switchStmt: { type: "IfStatement" },
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
  });

  it("returns null for null input", () => {
    const warnings: WarningLog[] = [];
    const result = parseSwitchReturningCssTemplates({
      switchStmt: null,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when discriminant does not match expected identifier", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "otherVar",
      cases: [],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
  });

  it("returns null for non-string case labels with warning", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "Identifier", name: "SOME_CONST" } as any,
          consequent: [makeCssReturnStmt("color: red")],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: blue")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: { line: 5, column: 0 },
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.context).toEqual({ reason: "non-string-switch-case" });
  });

  it("returns null when case has no return with warning", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [{ type: "ExpressionStatement" }],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: blue")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.context).toEqual({ reason: "missing-return" });
  });

  it("returns null when return is not a css template with warning", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [
            {
              type: "ReturnStatement",
              argument: { type: "Literal", value: "not-a-css-template" },
            },
          ],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: blue")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.context).toEqual({ reason: "return-not-css-template" });
  });

  it("returns null when default case is missing with warning", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [makeCssReturnStmt("color: blue")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.context).toEqual({ reason: "missing-default" });
  });

  it("parses valid switch with cases and default", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [makeCssReturnStmt("color: blue")],
        },
        {
          test: { type: "StringLiteral", value: "secondary" },
          consequent: [makeCssReturnStmt("color: green")],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: gray")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.caseCssTemplates.size).toBe(2);
    expect(result!.caseCssTemplates.has("primary")).toBe(true);
    expect(result!.caseCssTemplates.has("secondary")).toBe(true);
    expect(result!.defaultCssTemplate).toBeDefined();
    expect(warnings).toHaveLength(0);
  });

  it("handles fall-through cases", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [],
        },
        {
          test: { type: "StringLiteral", value: "info" },
          consequent: [makeCssReturnStmt("color: blue")],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: gray")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.caseCssTemplates.size).toBe(2);
    expect(result!.caseCssTemplates.get("primary")).toBe(result!.caseCssTemplates.get("info"));
    expect(warnings).toHaveLength(0);
  });

  it("handles case with block statement return", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = makeSwitchStmt({
      discriminant: "variant",
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [
            {
              type: "BlockStatement",
              body: [makeCssReturnStmt("color: blue")],
            },
          ],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: gray")],
        },
      ],
    });
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).not.toBeNull();
    expect(result!.caseCssTemplates.has("primary")).toBe(true);
  });

  it("returns null for dangling fall-through at end with warning", () => {
    const warnings: WarningLog[] = [];
    const switchStmt = {
      type: "SwitchStatement",
      discriminant: { type: "Identifier", name: "variant" },
      cases: [
        {
          test: { type: "StringLiteral", value: "primary" },
          consequent: [makeCssReturnStmt("color: blue")],
        },
        {
          test: null,
          consequent: [makeCssReturnStmt("color: gray")],
        },
        {
          test: { type: "StringLiteral", value: "trailing" },
          consequent: [],
        },
      ],
    };
    const result = parseSwitchReturningCssTemplates({
      switchStmt,
      expectedDiscriminantIdent: "variant",
      isCssHelperTaggedTemplate,
      warnings,
      loc: null,
    });
    expect(result).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.context).toEqual({ reason: "dangling-fallthrough" });
  });
});
