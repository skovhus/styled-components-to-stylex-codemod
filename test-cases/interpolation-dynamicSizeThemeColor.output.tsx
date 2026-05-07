// Dynamic size prop with Math expression and theme.isDark conditional color.
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

type InitialsProps = {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

export function Initials({ name, size = 16, className, style }: InitialsProps) {
  return (
    <Container size={size} className={className} style={style}>
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

type ContainerProps = React.PropsWithChildren<{
  size: number;
  className?: string;
  style?: React.CSSProperties;
}>;

function Container(props: ContainerProps) {
  const { className, children, style, size } = props;
  const theme = useTheme();

  return (
    <div
      {...mergedSx(
        [
          styles.container,
          theme.isDark ? styles.containerDark : styles.containerLight,
          styles.containerWidth(size),
          styles.containerHeight(size),
          styles.containerFontSize(`${Math.round(size * (2 / 3))}px`),
          styles.containerLineHeight(size),
        ],
        className,
        style,
      )}
    >
      {children}
    </div>
  );
}

const styles = stylex.create({
  container: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: $colors.labelMuted,
    textAlign: "center",
  },
  containerDark: {
    color: $colors.bgSub,
  },
  containerLight: {
    color: $colors.bgBase,
  },
  containerWidth: (width: number) => ({
    width: `${width}px`,
  }),
  containerHeight: (height: number) => ({
    height: `${height}px`,
  }),
  containerFontSize: (fontSize: string) => ({
    fontSize: fontSize,
  }),
  containerLineHeight: (lineHeight: number) => ({
    lineHeight: `${lineHeight}px`,
  }),
});
