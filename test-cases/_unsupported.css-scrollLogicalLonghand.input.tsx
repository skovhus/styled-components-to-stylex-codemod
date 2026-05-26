// @expected-warning: Unsupported CSS property "scroll-margin-inline-start" cannot be emitted in StyleX
// Logical scroll longhands cannot be converted to physical sides without changing RTL/writing-mode behavior.
import styled from "styled-components";

const Box = styled.div`
  scroll-margin-inline-start: 6px;
  background-color: lavender;
  padding: 16px;
`;

export const App = () => <Box>Logical scroll longhand</Box>;
