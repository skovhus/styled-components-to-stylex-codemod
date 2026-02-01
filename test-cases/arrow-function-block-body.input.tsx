import React from "react";
import styled from "styled-components";

// Arrow function with block body (contains comment)
// Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
const Box = styled.div<{ $large?: boolean }>`
  padding: 8px;
  bottom: ${(props) => {
    // Some comment
    return props.$large ? 34 : 6;
  }}px;
`;

export const App = () => (
  <div>
    <Box $large>Large Box (bottom: 34px)</Box>
    <Box>Small Box (bottom: 6px)</Box>
  </div>
);
