// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/color-helper";
import type { ColorToken } from "./tokens.stylex";

const LoadingPlaceholder = styled.div<{ $highlightColor: ColorToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${(props) =>
    `linear-gradient(90deg, transparent, ${color(props.$highlightColor)(props)}, transparent)`};
`;

const LoadingPlaceholderRange = styled.div<{
  $startColor: ColorToken;
  $endColor: ColorToken;
}>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${(props) =>
    `linear-gradient(90deg, ${color(props.$startColor)(props)}, ${color(props.$endColor)(props)})`};
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <LoadingPlaceholder $highlightColor="accent" />
    <LoadingPlaceholderRange $startColor="labelBase" $endColor="accent" />
  </div>
);
