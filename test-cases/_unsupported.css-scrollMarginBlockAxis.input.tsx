// @expected-warning: Unsupported CSS property "scroll-margin-block-start" cannot be emitted in StyleX
// StyleX compiles the block-axis scroll-margin longhands to physical
// scroll-margin-top/bottom, which changes behavior in vertical writing modes,
// so the codemod bails on them (and on the scroll-margin-block shorthand that
// expands to them).
import styled from "styled-components";

const Box = styled.div`
  scroll-margin-block-start: 6px;
  scroll-margin-block: 4px 8px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => <Box>Block-axis scroll margin longhand</Box>;
