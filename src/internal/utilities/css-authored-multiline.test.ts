import { compile } from "stylis";
import jscodeshift from "jscodeshift";
import { describe, expect, it } from "vitest";

import { normalizeStylisAstToIR } from "../css-ir.js";
import {
  applyAuthoredMultilineTemplateFormatting,
  findAuthoredDeclarationValue,
  maybeApplyAuthoredMultilineTemplateFormatting,
} from "./css-authored-multiline.js";

const j = jscodeshift.withParser("tsx");

describe("findAuthoredDeclarationValue", () => {
  it("recovers multiline values from raw CSS while matching stylis-normalized text", () => {
    const rawCss = `
  &[data-state="active"] {
    box-shadow: 0 0 0 1px __SC_EXPR_0__,
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`;
    const stylisValueRaw = "0 0 0 1px __SC_EXPR_0__,0 1px 2px rgba(0, 0, 0, 0.1)";
    expect(findAuthoredDeclarationValue(rawCss, "box-shadow", stylisValueRaw)).toBe(
      "0 0 0 1px __SC_EXPR_0__,\n      0 1px 2px rgba(0, 0, 0, 0.1)",
    );
  });

  it("recovers values when the property and value are on separate lines", () => {
    const rawCss = `
  box-shadow:
    0 0 0 1px __SC_EXPR_0__,
    0 0 0 2px __SC_EXPR_1__;
`;
    const stylisValueRaw = "0 0 0 1px __SC_EXPR_0__,0 0 0 2px __SC_EXPR_1__";
    expect(findAuthoredDeclarationValue(rawCss, "box-shadow", stylisValueRaw)).toBe(
      "0 0 0 1px __SC_EXPR_0__,\n    0 0 0 2px __SC_EXPR_1__",
    );
  });
});

describe("applyAuthoredMultilineTemplateFormatting", () => {
  it("formats template literal quasis with a leading newline and four-space indent", () => {
    const templateLiteral = j.templateLiteral(
      [
        j.templateElement({ raw: "0 0 0 1px ", cooked: "0 0 0 1px " }, false),
        j.templateElement(
          { raw: ",0 1px 2px rgba(0, 0, 0, 0.1)", cooked: ",0 1px 2px rgba(0, 0, 0, 0.1)" },
          true,
        ),
      ],
      [j.identifier("colorToken")],
    );
    const authoredValue = "0 0 0 1px __SC_EXPR_0__,\n      0 1px 2px rgba(0, 0, 0, 0.1)";
    const formatted = applyAuthoredMultilineTemplateFormatting(j, templateLiteral, authoredValue);
    expect(formatted.quasis[0]?.value.raw).toBe("\n  0 0 0 1px ");
    expect(formatted.quasis[1]?.value.raw).toBe(",\n  0 1px 2px rgba(0, 0, 0, 0.1)");
  });
});

describe("maybeApplyAuthoredMultilineTemplateFormatting", () => {
  it("leaves single-line authored values unchanged", () => {
    const templateLiteral = j.templateLiteral(
      [
        j.templateElement({ raw: "0 2px 4px ", cooked: "0 2px 4px " }, false),
        j.templateElement({ raw: "", cooked: "" }, true),
      ],
      [j.identifier("colorToken")],
    );
    const rawCss = "box-shadow: 0 2px 4px __SC_EXPR_0__;";
    const formatted = maybeApplyAuthoredMultilineTemplateFormatting({
      j,
      templateLiteral,
      rawCss,
      property: "box-shadow",
      stylisValueRaw: "0 2px 4px __SC_EXPR_0__",
    });
    expect(formatted).toBe(templateLiteral);
  });
});

describe("findAuthoredDeclarationValue integration", () => {
  it("matches stylis IR box-shadow values from nested selectors", () => {
    const rawCss = `
  box-shadow: none;

  &[data-state="active"] {
    box-shadow: 0 0 0 1px __SC_EXPR_0__,
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`;
    const slots = [
      {
        index: 0,
        placeholder: "__SC_EXPR_0__",
        expression: {} as never,
        startOffset: 0,
        endOffset: 0,
      },
    ];
    const rules = normalizeStylisAstToIR(compile(rawCss), slots, { rawCss });
    const activeRule = rules.find((rule) => rule.selector.includes("active"));
    const boxDecl = activeRule?.declarations.find((decl) => decl.property === "box-shadow");
    expect(boxDecl?.valueRaw).toBe("0 0 0 1px __SC_EXPR_0__,0 1px 2px rgba(0, 0, 0, 0.1)");
    expect(findAuthoredDeclarationValue(rawCss, "box-shadow", boxDecl?.valueRaw ?? "")).toContain(
      "\n",
    );
  });
});

describe("maybeApplyAuthoredMultilineTemplateFormatting end-to-end", () => {
  it("formats a theme-resolved box-shadow template literal", () => {
    const rawCss = `
  box-shadow: none;

  &[data-state="active"] {
    box-shadow: 0 0 0 1px __SC_EXPR_0__,
      0 1px 2px rgba(0, 0, 0, 0.1);
  }
`;
    const templateLiteral = j.templateLiteral(
      [
        j.templateElement({ raw: "0 0 0 1px ", cooked: "0 0 0 1px " }, false),
        j.templateElement(
          { raw: ",0 1px 2px rgba(0, 0, 0, 0.1)", cooked: ",0 1px 2px rgba(0, 0, 0, 0.1)" },
          true,
        ),
      ],
      [j.identifier("$colors")],
    );
    const formatted = maybeApplyAuthoredMultilineTemplateFormatting({
      j,
      templateLiteral,
      rawCss,
      property: "box-shadow",
      stylisValueRaw: "0 0 0 1px __SC_EXPR_0__,0 1px 2px rgba(0, 0, 0, 0.1)",
    });
    expect(formatted.quasis[0]?.value.raw).toBe("\n  0 0 0 1px ");
    expect(formatted.quasis[1]?.value.raw).toBe(",\n  0 1px 2px rgba(0, 0, 0, 0.1)");
  });
});
