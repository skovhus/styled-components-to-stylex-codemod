// Dynamic size prop with Math expression and theme.isDark conditional color.
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";
import { $colors } from "./tokens.stylex";

type InitialsProps = {
  name: string;
  size?: number;
  /** Additional class name for the rendered SVG. */
  className?: string;
  /** StyleX styles applied to the rendered SVG. */
  sx?: stylex.StyleXStyles;
  style?: React.CSSProperties;
};

export function Initials({ name, size = 16, className, style, sx }: InitialsProps) {
  return (
    <Container size={size} className={className} style={style} sx={sx}>
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
    <Container size={size} className={className} sx={sx}>
      {name.slice(0, 1).toUpperCase()}
    </Container>
  );
}

type LocalSxNameInitialsProps = {
  name: string;
  size?: number;
  className?: string;
  sx?: stylex.StyleXStyles;
};

export function LocalSxNameInitials({
  name,
  size = 28,
  className,
  sx: sxProp,
}: LocalSxNameInitialsProps) {
  const sx = name.slice(0, 1).toUpperCase();
  return (
    <Container size={size} className={className} sx={sxProp}>
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

type ContainerProps = { size: number } & React.ComponentProps<"div">;

function Container(props: ContainerProps) {
  const { className, style, sx, size, ...rest } = props;
  const theme = useTheme();

  return (
    <div
      {...rest}
      {...mergedSx(
        [
          styles.container,
          styles.containerWidth(size),
          styles.containerHeight(size),
          theme.isDark ? styles.containerDark : styles.containerLight,
          styles.containerFontSize(`${Math.round(size * (2 / 3))}px`),
          styles.containerLineHeight(size),
          sx,
        ],
        className,
        style,
      )}
    />
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
    width: width,
  }),
  containerHeight: (height: number) => ({
    height: height,
  }),
  containerFontSize: (fontSize: string) => ({
    fontSize: fontSize,
  }),
  containerLineHeight: (lineHeight: number) => ({
    lineHeight: `${lineHeight}px`,
  }),
});
