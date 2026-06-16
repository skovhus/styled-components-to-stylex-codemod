import * as React from "react";
import styled from "styled-components";
import { color, thinPixel } from "./lib/helpers";

const Text = styled.span`
  font-size: 12px;
  color: ${(props) =>
    props.theme.isDark ? props.theme.color.labelBase : props.theme.color.labelMuted};
  border-color: ${(props) =>
    props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBorderFaint};
`;

// theme.isDark choosing between curried color helper calls
const HelperColorBox = styled.div`
  background: ${(props) =>
    props.theme.isDark ? color("bgBorderSolid")(props) : color("bgBaseHover")(props)};
  color: ${color("labelBase")};
  padding: 12px;
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
    <HelperColorBox>Helper color box</HelperColorBox>
    <Box>Box</Box>
    <DayPicker>DayPicker</DayPicker>
  </div>
);
