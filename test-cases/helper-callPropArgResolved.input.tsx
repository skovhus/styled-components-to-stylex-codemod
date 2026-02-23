import React from "react";
import styled from "styled-components";
import { shadow } from "./lib/helpers";

// Test: adapter resolution for helper calls with dynamic prop args.
// The adapter remaps `shadow` → `$shadow` from tokens.stylex.

const Box = styled.div<{ shadow: "dark" | "light" }>`
  box-shadow: ${(props) => shadow(props.shadow)};
  height: 50px;
  width: 50px;
  padding: 8px;
  background-color: #f0f0f0;
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <Box shadow="dark">Dark shadow</Box>
    <Box shadow="light">Light shadow</Box>
  </div>
);
