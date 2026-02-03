import styled, { css } from "styled-components";

// CSS helper mixin for color
const cssMixin = css`
  color: red;
`;

// CSS helper mixin for background
const backgroundMixin = css`
  background-color: blue;
`;

// Test case 1: Color mixin first, then background mixin
// Order should be: cssMixin, backgroundMixin, cssFirst
const CssFirst = styled.div`
  padding: 10px;
  ${cssMixin}
  ${backgroundMixin}
`;

// Test case 2: Background mixin first, then color mixin
// Order should be: backgroundMixin, cssMixin, styledFirst
const StyledFirst = styled.div`
  margin: 10px;
  ${backgroundMixin}
  ${cssMixin}
`;

// Test case 3: Multiple interleaved mixins
// Order should be: cssMixin, backgroundMixin, cssMixin2, interleaved
const cssMixin2 = css`
  font-weight: bold;
`;

const Interleaved = styled.div`
  padding: 5px;
  ${cssMixin}
  ${backgroundMixin}
  ${cssMixin2}
`;

export const App = () => (
  <div>
    <CssFirst>CSS first</CssFirst>
    <StyledFirst>Styled first</StyledFirst>
    <Interleaved>Interleaved</Interleaved>
  </div>
);
