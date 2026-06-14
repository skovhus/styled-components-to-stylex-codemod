// @expected-warning: Unsupported interpolation: multiple dynamic slots in one declaration
import styled from "styled-components";

// Two independent prop-based slots in one declaration cannot be resolved by the
// single-slot fallback; emitting only the first slot would silently drop the
// second (`padding: ${$v}px` instead of `padding: ${$v}px ${$h}px`).
const Box = styled.div<{ $v: number; $h: number }>`
  padding: ${(p) => p.$v}px ${(p) => p.$h}px;
  background-color: lightcoral;
`;

export const App = () => (
  <Box $v={4} $h={16}>
    Vertical 4px / horizontal 16px padding
  </Box>
);
