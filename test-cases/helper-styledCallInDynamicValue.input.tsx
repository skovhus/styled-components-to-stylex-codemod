// Styled helper calls must be resolved before emitting StyleX dynamic values.
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/color-helper";
import { glowShadow, paletteColor, shadow } from "./lib/helpers";
import type { ColorToken } from "./tokens.stylex";

type ShadowToken = "dark" | "light";

const LoadingPlaceholder = styled.div<{ $highlightColor: ColorToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${(props) =>
    `linear-gradient(90deg, transparent, ${color(props.$highlightColor)(props)}, transparent)`};
`;

const LoadingPlaceholderWithHelperReturn = styled.div<{ $highlightColor: ColorToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: linear-gradient(
    90deg,
    transparent,
    ${(props) => color(props.$highlightColor)},
    transparent
  );
`;

const LoadingPlaceholderWithDestructuredTemplate = styled.div<{ $shimmerColor: ColorToken }>`
  width: 160px;
  height: 20px;
  border-radius: 6px;
  background-image: ${({ $shimmerColor }) =>
    `linear-gradient(90deg, transparent 0, ${paletteColor($shimmerColor)} 50%, transparent)`};
`;

const LoadingPlaceholderWithPseudoHelper = styled.div<{ $shimmerColor: ColorToken }>`
  position: relative;
  width: 160px;
  height: 20px;
  border-radius: 6px;
  overflow: hidden;
  background-color: #e2e8f0;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background-image: linear-gradient(
      90deg,
      transparent 0,
      ${(props) => color(props.$shimmerColor)}
      50%,
      transparent
    );
  }
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

const OptionalColorPanel = styled.div<{ $color?: ColorToken }>`
  width: 160px;
  min-height: 40px;
  border-radius: 6px;
  padding: 8px;
  color: white;
  background-color: ${(p) => color(p.$color ?? "labelFaint")(p)} !important;
`;

const ImportantWidthPanel = styled.div<{ $base: number; $extra: number }>`
  width: ${(p) => p.$base + p.$extra}px !important;
  min-height: 40px;
  border-radius: 6px;
  background-color: #e2e8f0;
`;

const StaticColorPanel = styled.div`
  width: 160px;
  min-height: 40px;
  border-radius: 6px;
  padding: 8px;
  color: white;
  background-color: ${(props) => color("bgBase")(props)};
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

export const App = () => {
  const runtimeHighlightColor: ColorToken = "accent";

  return (
    <div style={{ display: "grid", gap: 8, padding: 12 }}>
      <LoadingPlaceholder $highlightColor="accent" />
      <LoadingPlaceholderWithHelperReturn $highlightColor={runtimeHighlightColor} />
      <LoadingPlaceholderWithDestructuredTemplate $shimmerColor={runtimeHighlightColor} />
      <LoadingPlaceholderWithPseudoHelper $shimmerColor={runtimeHighlightColor} />
      <LoadingPlaceholderRange $startColor="labelBase" $endColor="accent" />
      <LoadingPlaceholderRepeat $highlightColor="accent" />
      <OptionalColorPanel>Default faint panel</OptionalColorPanel>
      <OptionalColorPanel $color="accent">Accent panel</OptionalColorPanel>
      <ImportantWidthPanel $base={50} $extra={30}>
        Important width panel
      </ImportantWidthPanel>
      <ImportantWidthPanel $base={90} $extra={30}>
        Wider important width panel
      </ImportantWidthPanel>
      <StaticColorPanel>Static helper panel</StaticColorPanel>
      <LoadingPlaceholderWithSize $highlightColor="accent" $size={12} />
      <ShadowPlaceholder $shadow="dark" />
      <LayeredShadowPlaceholder $shadowTone="light" />
    </div>
  );
};
