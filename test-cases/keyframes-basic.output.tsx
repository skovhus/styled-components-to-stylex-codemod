import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <>
    <div sx={styles.rotate}>💅</div>
    <div sx={styles.rotateNameLast}>💅</div>
  </>
);

const rotate = stylex.keyframes({
  from: {
    transform: "rotate(0deg)",
  },

  to: {
    transform: "rotate(360deg)",
  },
});

const styles = stylex.create({
  rotate: {
    display: "inline-block",
    animationName: rotate,
    animationDuration: "2s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    paddingBlock: "2rem",
    paddingInline: "1rem",
    fontSize: "1.2rem",
  },
  // The animation-name can appear anywhere in the shorthand, not just first
  rotateNameLast: {
    display: "inline-block",
    animationName: rotate,
    animationDuration: "2s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    paddingBlock: "2rem",
    paddingInline: "1rem",
    fontSize: "1.2rem",
  },
});
