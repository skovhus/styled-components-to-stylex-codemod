import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { extractSingleRawCssVarStyleFnProperty } from "./raw-css-var-inlining.js";

const j = jscodeshift.withParser("tsx");

describe("extractSingleRawCssVarStyleFnProperty", () => {
  it("rejects object returns with spreads so spread styles are not dropped", () => {
    const root = j(`
const styleFn = (props) => ({
  ...base,
  width: \`var(--dynamic-width, \${props.width}px)\`,
});
`);
    const declaration = root.find(j.VariableDeclarator).get().node;

    expect(extractSingleRawCssVarStyleFnProperty(declaration.init)).toBeNull();
  });
});
