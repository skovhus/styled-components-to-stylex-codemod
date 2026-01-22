import * as React from "react";
import styled from "styled-components";
import type { Colors } from "./lib/colors";

export interface BadgeProps {
  textColor?: Colors;
}

export const Badge = styled.div<BadgeProps>`
  padding: 4px 8px;
  border-radius: 4px;
  color: ${(props) =>
    props.textColor ? props.theme.color[props.textColor] : props.theme.color.labelTitle};
`;

export const App = () => (
  <div>
    <Badge>Default color (labelTitle)</Badge>
    <Badge textColor="labelBase">Custom color (labelBase)</Badge>
    <Badge textColor="labelMuted">Custom color (labelMuted)</Badge>
  </div>
);
