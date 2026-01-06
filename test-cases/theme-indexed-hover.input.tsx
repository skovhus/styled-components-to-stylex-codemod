import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Box = styled.div<{ color: Color }>`
  &:hover {
    background-color: ${(p) => p.theme.color[p.color]};
  }
`;

export const App = () => <Box color="labelBase" />;
