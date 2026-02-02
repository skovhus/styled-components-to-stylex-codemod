import styled from "styled-components";
import { themedBorder } from "./lib/helpers";

// Directional border: expands to borderLeftWidth, borderLeftStyle, borderLeftColor
const BorderedLeft = styled.div`
  border-left: ${themedBorder("labelMuted")};
`;

// Non-directional border: expands to borderWidth, borderStyle, borderColor
const BorderedBox = styled.div`
  border: ${themedBorder("labelMuted")};
`;

export const App = () => (
  <div style={{ padding: "10px" }}>
    <BorderedLeft>Bordered left</BorderedLeft>
    <BorderedBox>Bordered box</BorderedBox>
  </div>
);
