import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Box = styled.div<{ bg: Color; hoverColor: Color }>`
  &:hover {
    background-color: ${(p) => p.theme.color[p.hoverColor]};
  }
  background-color: ${(props) => props.theme.color[props.bg]};
  width: 42px;
  height: 100%;
  padding: 16px;
`;

export const App = () => (
  <>
    <Box bg="labelBase" hoverColor="labelMuted" />
    <Box bg="labelMuted" hoverColor="labelBase" />
  </>
);
