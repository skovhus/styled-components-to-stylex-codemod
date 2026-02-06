import React from "react";
import styled from "styled-components";

// Arrow function with block body (contains comment)
// Should be equivalent to expression-body: ${props => props.$large ? 34 : 6}px
const Box = styled.div<{ $large?: boolean }>`
  position: absolute;
  left: 10px;
  bottom: ${(props) => {
    // Some comment
    return props.$large ? 80 : 20;
  }}px;
  padding: 12px 16px;
  background-color: paleturquoise;
  border: 2px solid teal;
`;

export const App = () => (
  <div style={{ position: "relative", height: "200px" }}>
    <Box $large>Large Box (bottom: 80px)</Box>
    <Box style={{ left: 200 }}>Small Box (bottom: 20px)</Box>
  </div>
);
