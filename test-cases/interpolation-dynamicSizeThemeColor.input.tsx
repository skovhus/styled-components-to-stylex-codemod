// Dynamic size prop with Math expression and theme.isDark conditional color.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import styled from "styled-components";
import { color } from "./lib/helpers";

type InitialsProps = {
  name: string;
  size?: number;
  /** Additional class name for the rendered SVG. */
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

type ExistingSxInitialsProps = {
  name: string;
  size?: number;
  className?: string;
  sx?: stylex.StyleXStyles;
};

export function ExistingSxInitials({ name, size = 24, className, sx }: ExistingSxInitialsProps) {
  return (
    <Container $size={size} className={className} sx={sx}>
      {name.slice(0, 1).toUpperCase()}
    </Container>
  );
}

type LocalSxNameInitialsProps = {
  name: string;
  size?: number;
  className?: string;
};

export function LocalSxNameInitials({ name, size = 28, className }: LocalSxNameInitialsProps) {
  const sx = name.slice(0, 1).toUpperCase();
  return (
    <Container $size={size} className={className}>
      {sx}
    </Container>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Initials name="Alice" size={32} />
    <Initials name="Bob" size={48} />
    <Initials name="Charlie" />
    <ExistingSxInitials name="Dora" />
    <LocalSxNameInitials name="Eve" />
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
