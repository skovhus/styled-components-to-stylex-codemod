// Indexed theme lookup with prop fallback using || operator
import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const View = styled.div<{ backgroundColor: Color }>`
  background-color: ${(props) => props.theme.color[props.backgroundColor] || props.backgroundColor};
`;

export const App = () => (
  <>
    <View backgroundColor="labelBase" />
    <View backgroundColor="labelMuted" />
  </>
);
