import { describe, expect, it } from "vitest";
import {
  collectDynamicWarnings,
  findDynamicContexts,
  runDynamicPlugins,
  type DynamicContext,
  type DynamicPlugin,
  type DynamicToken,
  type ParsedDeclaration,
  type ParsedTemplateLiteral,
} from "./transform.js";

function createSyntheticParsed(): { parsed: ParsedTemplateLiteral; token: DynamicToken } {
  const token: DynamicToken = { id: 0, placeholder: "var(--__dyn_0__)", expression: null };
  const declaration: ParsedDeclaration = {
    property: "color",
    value: {
      raw: token.placeholder,
      segments: [{ kind: "dynamic", token }],
    },
  };

  const parsed: ParsedTemplateLiteral = {
    chunks: [
      { kind: "static", value: "color: " },
      { kind: "dynamic", token },
      { kind: "static", value: ";" },
    ],
    cssText: `color: ${token.placeholder};`,
    rules: [
      {
        selectors: [".btn"],
        atRulePath: [`@media ${token.placeholder}`],
        declarations: [declaration],
      },
    ],
  };

  return { parsed, token };
}

describe("dynamic context extraction", () => {
  it("collects declaration and at-rule contexts", () => {
    const { parsed, token } = createSyntheticParsed();

    const contexts = findDynamicContexts(parsed);

    const kinds = contexts.map((c) => c.kind).sort();
    expect(kinds).toEqual(["at-rule-params", "declaration-value"]);
    expect(contexts[0]?.token.placeholder).toBe(token.placeholder);
  });

  it("matches placeholders inside selectors and at-rules", () => {
    const { parsed, token } = createSyntheticParsed();

    const syntheticParsed: ParsedTemplateLiteral = {
      ...parsed,
      rules: [
        {
          selectors: [`&.${token.placeholder}`],
          atRulePath: [`@media ${token.placeholder}`],
          declarations: [],
        },
      ],
    };

    const contexts = findDynamicContexts(syntheticParsed);
    const kinds = contexts.map((c) => c.kind).sort();
    expect(kinds).toEqual(["at-rule-params", "selector"]);
    expect(contexts.every((ctx) => ctx.token.placeholder === token.placeholder)).toBe(true);
  });
});

describe("dynamic plugin bailouts", () => {
  it("surfaces bail results as warnings", () => {
    const { parsed } = createSyntheticParsed();

    const bailPlugin: DynamicPlugin = (context: DynamicContext) => {
      if (context.kind === "declaration-value") {
        return { action: "bail", reason: "Dynamic declaration requires manual handling" };
      }
      return { action: "keep" };
    };

    const contexts = findDynamicContexts(parsed);
    const results = runDynamicPlugins(contexts, [bailPlugin]);
    const warnings = collectDynamicWarnings(results);

    expect(warnings).toEqual([
      {
        type: "unsupported-feature",
        feature: "dynamic-css",
        message: "Dynamic declaration requires manual handling",
      },
    ]);
  });
});
