import * as React from "react";
import styled from "styled-components";
import { thinPixel } from "./lib/helpers";

const Text = styled.span`
  font-size: 12px;
  color: ${(props) =>
    props.theme.isDark ? props.theme.color.labelBase : props.theme.color.labelMuted};
  border-color: ${(props) =>
    props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBorderFaint};
`;

// theme.isDark controlling an entire CSS block (empty string vs padding)
const Box = styled.div`
  ${(props) => (props.theme.isDark ? "" : `padding: ${thinPixel()};`)}
`;

// theme.isDark setting a CSS custom property value
const DayPicker = styled.div`
  --highlighted-color: ${(p) =>
    p.theme.isDark ? p.theme.color.bgBorderSolid : p.theme.color.bgBorderFaint};
  background-color: var(--highlighted-color);
  padding: 16px;
`;

export const App = () => (
  <div>
    <Text>Label</Text>
    <Box>Box</Box>
    <DayPicker>DayPicker</DayPicker>
  </div>
);
