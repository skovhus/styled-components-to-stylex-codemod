import * as React from "react";
import styled from "styled-components";

type Colors = "labelBase" | "labelMuted";

const Dot = styled.div<{ $colors: Colors }>`
  background-color: ${(props) => props.theme.color[props.$colors]};
  min-height: 48px;
  min-width: 96px;
  padding: 12px;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12 }}>
    <Dot $colors="labelBase">labelBase</Dot>
    <Dot $colors="labelMuted">labelMuted</Dot>
  </div>
);
