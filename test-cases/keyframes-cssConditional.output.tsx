import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const pulse = stylex.keyframes({
  "0%": {
    opacity: 1,
  },

  "50%": {
    opacity: 0.55,
  },

  "100%": {
    opacity: 1,
  },
});

type BoxProps = React.PropsWithChildren<{
  isAnimating?: boolean;
}>;

// animation shorthand with keyframes reference in css`` conditional
function Box(props: BoxProps) {
  const { children, isAnimating } = props;
  return <div sx={[styles.box, isAnimating && styles.boxAnimating]}>{children}</div>;
}

type DotProps = React.PropsWithChildren<{
  active?: boolean;
}>;

// animation-name longhand with keyframes reference in css`` conditional
function Dot(props: DotProps) {
  const { children, active } = props;
  return <span sx={[styles.dot, active && styles.dotActive]}>{children}</span>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
    <Box isAnimating>Animating</Box>
    <Box>Static</Box>
    <Dot active />
    <Dot />
  </div>
);

const styles = stylex.create({
  box: {
    backgroundColor: "cornflowerblue",
    padding: 24,
    color: "white",
  },
  boxAnimating: {
    animationName: pulse,
    animationDuration: "1.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  dot: {
    display: "inline-block",
    width: 16,
    height: 16,
    borderRadius: "50%",
    backgroundColor: "tomato",
  },
  dotActive: {
    animationName: pulse,
    animationDuration: "2s",
    animationIterationCount: "infinite",
  },
});
