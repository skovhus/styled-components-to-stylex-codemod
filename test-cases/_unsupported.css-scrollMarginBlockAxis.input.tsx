// @expected-warning: Unsupported CSS property "scroll-margin-block-start" cannot be emitted in StyleX
// StyleX compiles scroll-margin-block-start/end to physical scroll-margin-top/bottom,
// which changes behavior in vertical writing modes, so the codemod bails on them.
import styled from "styled-components";

const Box = styled.div`
  scroll-margin-block-start: 6px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => <Box>Block-axis scroll margin longhand</Box>;
