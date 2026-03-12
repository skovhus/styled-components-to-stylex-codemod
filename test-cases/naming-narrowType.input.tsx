// Exported styled component where consumers only pass className (no style, no element props, no spread)
import * as React from "react";
import styled from "styled-components";

export const TextColor = styled.span`
  color: blue;
  padding: 4px 8px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <TextColor className="extra">With className only</TextColor>
  </div>
);
