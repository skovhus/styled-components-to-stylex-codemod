import styled, { css } from "styled-components";

// CSS helper mixin
const cssMixin = css`
  color: red;
`;

// Styled component mixin
const StyledMixin = styled.span`
  background-color: blue;
`;

// Test case 1: CSS helper first, then styled-component mixin
// Order should be: cssMixin, styledMixin, combined
const CssFirst = styled.div`
  padding: 10px;
  ${cssMixin}
  ${StyledMixin}
`;

// Test case 2: Styled-component mixin first, then css helper
// Order should be: styledMixin, cssMixin, combined2
const StyledFirst = styled.div`
  margin: 10px;
  ${StyledMixin}
  ${cssMixin}
`;

// Test case 3: Multiple interleaved mixins
// Order should be: cssMixin, styledMixin, cssMixin2, combined3
const cssMixin2 = css`
  font-weight: bold;
`;

const Interleaved = styled.div`
  padding: 5px;
  ${cssMixin}
  ${StyledMixin}
  ${cssMixin2}
`;

export const App = () => (
  <div>
    <CssFirst>CSS first</CssFirst>
    <StyledFirst>Styled first</StyledFirst>
    <Interleaved>Interleaved</Interleaved>
  </div>
);
