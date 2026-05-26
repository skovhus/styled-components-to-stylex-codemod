// Conditional `css\`...\`` block (logical-AND, inside a styled component) that
// adds a shorthand border property `border-bottom: 1px solid <theme color>`.
// The shorthand needs to be expanded into longhand StyleX properties
// (borderBottomWidth/Style/Color), but on the conditional-css-block path the
// codemod skips that expansion and throws
// `Unexpanded CSS shorthand "borderBottom"`.
//
// Regression repro for conditional css blocks with interpolated border shorthands.
import * as React from "react";
import styled, { css } from "styled-components";

const Container = styled.div<{ $hideBottomBorder?: boolean }>`
  border-top: 1px solid ${(props) => props.theme.color.bgBorderFaint};
  ${(props) =>
    !props.$hideBottomBorder &&
    css`
      border-bottom: 1px solid ${props.theme.color.bgBorderFaint};
    `}
  padding: 8px;
`;

export const App = () => (
  <div>
    <Container>Default (has bottom border)</Container>
    <Container $hideBottomBorder>No bottom border</Container>
  </div>
);
