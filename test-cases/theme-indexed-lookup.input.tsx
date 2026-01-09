import * as React from "react";
import styled from "styled-components";

type Color = "labelBase" | "labelMuted";

const Box = styled.div<{ $bg: Color; $hoverColor: Color }>`
  &:hover {
    background-color: ${(p) => p.theme.colors[p.$hoverColor]};
  }
  background-color: ${(props) => props.theme.colors[props.$bg]};
  width: 42px;
  height: 100%;
  padding: 16px;
`;

export const App = () => (
  <>
    <Box $bg="labelBase" $hoverColor="labelMuted" />
    <Box $bg="labelMuted" $hoverColor="labelBase" />
  </>
);

// Pattern 2: Type imported from another file (like TextColor.tsx in a design system)
// The codemod should preserve the imported type, not convert to `string`
import type { Colors } from "./lib/colors";

interface TextColorProps {
  /** The color from the theme */
  color: Colors;
}

export const TextColor = styled.span<TextColorProps>`
  color: ${(props) => props.theme.colors[props.color]};
`;
