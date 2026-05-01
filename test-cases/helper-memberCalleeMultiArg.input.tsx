// Preserved runtime calls with member callee and multiple arguments
import styled from "styled-components";
import { ColorConverter, color } from "./lib/helpers";

const Toggle = styled.div`
  background-color: ${({ theme }) => ColorConverter.cssWithAlpha(theme.color.bgBase, 0.4)};
  padding: 8px 16px;
`;

const Box = styled.div<{ $m: number }>`
  background: ${(p) => ColorConverter.cssWithAlpha(p.theme.color.bgBase, 0.2)};
  margin: ${(p) => p.$m}px;
`;

const TintedLabel = styled.span`
  background: ${(props) => ColorConverter.cssWithAlpha(color("bgBase")(props), 0.8)};
  padding: 2px 6px;
`;

const TintedPanel = styled.div<{ $faded: boolean }>`
  background: ${(props) =>
    props.$faded ? ColorConverter.cssWithAlpha(color("bgBase")(props), 0.8) : color("bgBase")};
  padding: 4px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Toggle>Toggle</Toggle>
    <Box $m={8}>Box with margin</Box>
    <TintedLabel>Label with nested color helper</TintedLabel>
    <TintedPanel $faded>Faded panel</TintedPanel>
    <TintedPanel $faded={false}>Solid panel</TintedPanel>
  </div>
);
