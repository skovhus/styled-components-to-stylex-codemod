import * as React from "react";
import styled from "styled-components";

// Basic literal values with isDark conditional
const Box = styled.div`
  padding: 16px;
  mix-blend-mode: ${(props) => (props.theme.isDark ? "color-burn" : "darken")};
  background-color: ${({ theme }) =>
    theme.isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.035)"};
`;

export const App = () => (
  <div style={{ backgroundColor: "#991b1b", padding: 16 }}>
    <Box>Hello world</Box>
  </div>
);
