// Preserved runtime calls with member callee and multiple arguments
import styled from "styled-components";
import { ColorConverter } from "./lib/helpers";

const Toggle = styled.div`
  background-color: ${({ theme }) => ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)};
  padding: 8px 16px;
`;

const Box = styled.div<{ $m: number }>`
  background: ${(p) => ColorConverter.cssWithAlpha(p.theme.color.bgBase, 0.2)};
  margin: ${(p) => p.$m}px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
    <Box $m={8}>Box with margin</Box>
  </div>
);
