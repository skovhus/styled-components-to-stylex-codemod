// @expected-warning: Dynamic logical scroll shorthand cannot be expanded — bind a specific longhand (e.g. scroll-padding-inline-start) instead
// StyleX accepts only the Start/End longhands of the logical scroll axis
// shorthands. A static value is expanded (see css-scrollLogicalLonghand), but a
// dynamic value cannot be split losslessly into Start/End, so the codemod bails
// rather than emit the unsupported `scrollPaddingInline` axis shorthand.
import styled from "styled-components";

const Box = styled.div<{ $gap: number }>`
  scroll-padding-inline: ${(props) => props.$gap}px;
  background-color: lavender;
`;

export const App = () => <Box $gap={8}>Dynamic logical scroll shorthand</Box>;
