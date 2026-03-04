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
  $isAnimating?: boolean;
}>;

function Box(props: BoxProps) {
  const { children, $isAnimating } = props;

  return (
    <div {...stylex.props(styles.box, $isAnimating ? styles.boxAnimating : undefined)}>
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box $isAnimating>Animating</Box>
    <Box>Static</Box>
  </div>
);

const styles = stylex.create({
  box: {
    backgroundColor: "cornflowerblue",
    padding: "24px",
    color: "white",
  },
  boxAnimating: {
    animationName: pulse,
    animationDuration: "1.6s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
});
