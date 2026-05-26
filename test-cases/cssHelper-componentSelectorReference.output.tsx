// `css` helper (exported, separate from any styled component) references styled
// components by interpolation as component selectors: `${ChildA} { ... }`.
// When the codemod converts the styled components, the original local
// identifiers (`ChildA`, `ChildB`) disappear, but the references inside the
// `css` template literal are not rewritten — leaving dangling identifier
// references in the emitted output (TS2552 "Cannot find name 'ChildA'").
//
// Regression repro for exported css helpers that reference converted local
// styled components as component selectors.
import * as React from "react";
import styled, { css } from "styled-components";

const ChildA = styled.span`
  color: red;
`;

const ChildB = styled.span`
  color: blue;
`;

// css helper using component selectors — exported so it survives the codemod.
export const glowOverridesCss = css`
  ${ChildA} {
    opacity: 1;
  }
  ${ChildB} {
    opacity: 0.5;
  }
`;

const Parent = styled.div`
  padding: 8px;
  background: papayawhip;
`;

export const App = () => (
  <Parent>
    <ChildA>A</ChildA>
    <ChildB>B</ChildB>
  </Parent>
);
