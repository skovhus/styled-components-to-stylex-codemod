// @expected-warning: Unsupported interpolation: call expression
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/color-helper";
import type { ColorToken } from "./tokens.stylex";

const Box = styled.div<{ $tone: ColorToken }>`
  width: 120px;
  height: 40px;
  background-image: ${(props) =>
    `linear-gradient(90deg, ${color(props.$tone)(props, "soft")}, transparent)`};
`;

export const App = () => <Box $tone="accent">Unsupported curried helper args</Box>;
