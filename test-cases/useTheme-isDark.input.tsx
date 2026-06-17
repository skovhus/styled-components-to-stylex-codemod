import * as React from "react";
import styled from "styled-components";
import { color, runtimeColor, thinPixel } from "./lib/helpers";
import type { ColorToken } from "./tokens.stylex";

const Text = styled.span`
  font-size: 12px;
  color: ${(props) =>
    props.theme.isDark ? props.theme.color.labelBase : props.theme.color.labelMuted};
  border-color: ${(props) =>
    props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBorderFaint};
`;

// theme.isDark choosing between curried color helper calls with dynamic keys
const HelperColorBox = styled.div<{ $dark: ColorToken; $light: ColorToken }>`
  background: ${(props) =>
    props.theme.isDark ? color(props.$dark)(props) : color(props.$light)(props)};
  color: ${color("labelBase")};
  padding: 12px;
`;

// theme.isDark choosing between helper-backed template background values
const HelperGradientBox = styled.div`
  background: ${(props) =>
    props.theme.isDark
      ? `linear-gradient(to bottom, ${color("bgSub")(props)} 0%, transparent 100%)`
      : `linear-gradient(to bottom, transparent 0%, ${color("bgBaseHover")(props)} 100%)`};
  color: ${color("labelBase")};
  padding: 12px;
`;

// theme.isDark with one unresolved helper branch that falls back to inline style
const RuntimeColorBox = styled.div`
  color: ${(props) => (props.theme.isDark ? runtimeColor() : props.theme.color.labelMuted)};
  padding: 8px;
`;

// inline fallback must retain useTheme after later base declarations clear earlier theme buckets
const ClearedThemeHookRuntimeColorBox = styled.div`
  color: ${(props) => (props.theme.isDark ? "red" : "blue")};
  background-color: ${(props) =>
    props.theme.isDark ? runtimeColor() : color("labelMuted")(props)};
  color: green;
  padding: 8px;
`;

// theme.isDark controlling an entire CSS block (empty string vs padding)
const Box = styled.div`
  ${(props) => (props.theme.isDark ? "" : `padding: ${thinPixel()};`)}
`;

// theme.isDark setting a CSS custom property value (with optional chaining)
const DayPicker = styled.div`
  --highlighted-color: ${(p) =>
    p.theme.isDark ? p.theme.color?.bgBorderSolid : p.theme.color?.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`;

export const App = () => (
  <div>
    <Text>Label</Text>
    <HelperColorBox $dark="bgBorderSolid" $light="bgBaseHover">
      Helper color box
    </HelperColorBox>
    <HelperGradientBox>Helper gradient box</HelperGradientBox>
    <RuntimeColorBox>Runtime color box</RuntimeColorBox>
    <ClearedThemeHookRuntimeColorBox>
      Cleared theme hook runtime color box
    </ClearedThemeHookRuntimeColorBox>
    <Box>Box</Box>
    <DayPicker>DayPicker</DayPicker>
  </div>
);
