// Indexed theme lookup with prop fallback using || operator
import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const View = styled.div<{ backgroundColor: Color }>`
  background-color: ${(props) => props.theme.color[props.backgroundColor] || props.backgroundColor};
  color: white;
  padding: 12px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <View backgroundColor="labelBase">labelBase</View>
    <View backgroundColor="labelMuted">labelMuted</View>
  </div>
);
