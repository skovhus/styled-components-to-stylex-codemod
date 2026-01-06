import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Box = styled.div<{ bg: Color }>`
  background-color: ${(props) => props.theme.color[props.bg]};
  width: 100%;
  height: 100%;
  padding: 16px;
`;

export const App = () => <Box bg="labelBase" />;
