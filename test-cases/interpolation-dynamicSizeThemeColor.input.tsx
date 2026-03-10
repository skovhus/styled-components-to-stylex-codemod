// Dynamic size prop with Math expression and theme.isDark conditional color.
import * as React from "react";
import styled from "styled-components";
import { color } from "./lib/helpers";

type InitialsProps = {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function Initials({ name, size = 16, className, style }: InitialsProps) {
  return (
    <Container $size={size} className={className} style={style}>
      {name.slice(0, 1).toUpperCase()}
    </Container>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Initials name="Alice" size={32} />
    <Initials name="Bob" size={48} />
    <Initials name="Charlie" />
  </div>
);

const Container = styled.div<{ $size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: ${(props) => props.$size}px;
  height: ${(props) => props.$size}px;

  background-color: ${color("labelMuted")};
  color: ${(props) => (props.theme.isDark ? props.theme.color.bgSub : props.theme.color.bgBase)};

  font-size: ${(props) => Math.round(props.$size * (2 / 3))}px;
  line-height: ${(props) => props.$size}px;
  text-align: center;
`;
