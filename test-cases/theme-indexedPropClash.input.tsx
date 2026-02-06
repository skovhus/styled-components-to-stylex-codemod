import * as React from "react";
import styled from "styled-components";

type Colors = "labelBase" | "labelMuted";

const Dot = styled.div<{ $colors: Colors }>`
  background-color: ${(props) => props.theme.color[props.$colors]};
`;

export const App = () => <Dot $colors="labelBase">Hello</Dot>;
