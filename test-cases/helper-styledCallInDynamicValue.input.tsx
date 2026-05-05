// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/color-helper";
import { glowShadow, shadow } from "./lib/helpers";
import type { ColorToken } from "./tokens.stylex";

type ShadowToken = "dark" | "light";

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

const LoadingPlaceholderRepeat = styled.div<{ $highlightColor: ColorToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${(props) =>
    `linear-gradient(90deg, ${color(props.$highlightColor)(props)}, ${color(props.$highlightColor)(
      props,
    )})`};
`;

const LoadingPlaceholderWithSize = styled.div<{
  $highlightColor: ColorToken;
  $size: number;
}>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${(props) =>
    `linear-gradient(90deg, ${color(props.$highlightColor)(props)} ${props.$size}px, transparent)`};
`;

const ShadowPlaceholder = styled.div<{ $shadow: ShadowToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${(props) => shadow(props.$shadow)};
`;

const LayeredShadowPlaceholder = styled.div<{ $shadowTone: ShadowToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-color: white;
  text-shadow: ${(props) => `${shadow(props.$shadowTone)}, ${glowShadow(props.$shadowTone)}`};
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8, padding: 12 }}>
    <LoadingPlaceholder $highlightColor="accent" />
    <LoadingPlaceholderRange $startColor="labelBase" $endColor="accent" />
    <LoadingPlaceholderRepeat $highlightColor="accent" />
    <LoadingPlaceholderWithSize $highlightColor="accent" $size={12} />
    <ShadowPlaceholder $shadow="dark" />
    <LayeredShadowPlaceholder $shadowTone="light" />
  </div>
);
