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

export const App = () => (
  <div>
    <Text>Label</Text>
    <Box>Box</Box>
  </div>
);
