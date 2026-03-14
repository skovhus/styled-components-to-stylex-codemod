// Border shorthand expansion from helper function calls
import React from "react";
import styled from "styled-components";
import { themedBorder, thinBorder } from "./lib/helpers";

// Directional border: expands to borderLeftWidth, borderLeftStyle, borderLeftColor
const BorderedLeft = styled.div`
  border-left: ${themedBorder("labelMuted")};
`;

// Non-directional border: expands to borderWidth, borderStyle, borderColor
const BorderedBox = styled.div`
  border: ${themedBorder("labelMuted")};
`;

// Border shorthand from helper function call returning full border value
const ThinBorderContainer = styled.div`
  border: ${thinBorder("transparent")};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ padding: "10px" }}>
    <BorderedLeft>Bordered left</BorderedLeft>
    <BorderedBox>Bordered box</BorderedBox>
    <ThinBorderContainer>Thin border</ThinBorderContainer>
  </div>
);
