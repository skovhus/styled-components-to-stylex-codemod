import * as stylex from "@stylexjs/stylex";

const rotate = stylex.keyframes({
  from: {
    transform: "rotate(0deg)",
  },

  to: {
    transform: "rotate(360deg)",
  },
});

export const App = () => <div sx={styles.rotate}>💅</div>;

const styles = stylex.create({
  rotate: {
    display: "inline-block",
    animationName: rotate,
    animationDuration: "2s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    paddingTop: "2rem",
    paddingRight: "1rem",
    paddingBottom: "2rem",
    paddingLeft: "1rem",
    fontSize: "1.2rem",
  },
});
