import { describe, expect, it } from "vitest";
import jscodeshift from "jscodeshift";
import { collectStyledDecls } from "../internal/collect-styled-decls";

const j = jscodeshift.withParser("tsx");

function collectFirstDecl(source: string) {
  const result = collectStyledDecls({
    root: j(source),
    j,
    styledDefaultImport: "styled",
  });
  const decl = result.styledDecls[0];
  if (!decl) {
    throw new Error("Expected a styled declaration");
  }
  return decl;
}

describe("collectStyledDecls attrs literal extraction", () => {
  it("does not coerce module-scope function bindings into static attr styles", () => {
    const decl = collectFirstDecl(`
import styled from "styled-components";

const size = () => 12;

const Box = styled.div.attrs({
  style: { height: size },
})\`
  color: red;
\`;
`);

    expect(decl.attrsInfo?.attrsStaticStyles?.height).toBeUndefined();
    expect(decl.attrsInfo?.hasUnsupportedValues).toBe(true);
  });

  it("does not coerce destructured function defaults into primitive attr defaults", () => {
    const decl = collectFirstDecl(`
import styled from "styled-components";

const Box = styled.div.attrs(({ title = () => "fallback" }) => ({
  title,
}))\`
  color: red;
\`;
`);

    expect(decl.attrsInfo?.dynamicAttrs).toEqual([
      {
        jsxProp: "title",
        attrName: "title",
      },
    ]);
  });
});
