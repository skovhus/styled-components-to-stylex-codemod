import React from "react";
import styled from "styled-components";

type BoxProps = {
  $delay?: number;
  children?: React.ReactNode;
};

const Box = styled.div<BoxProps>`
  transition-delay: ${(props) => props.$delay ?? 0}ms;
  transition-property: opacity;
  transition-duration: 200ms;
  transition-timing-function: ease-out;
`;

export const App = () => (
  <div>
    <Box>Default delay</Box>
    <Box $delay={100}>Custom delay</Box>
  </div>
);
