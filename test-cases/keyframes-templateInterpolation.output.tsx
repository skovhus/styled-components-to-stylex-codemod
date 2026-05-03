import * as stylex from "@stylexjs/stylex";

const OFFSET_PX = 40;
const DURATION_SECONDS = 1.8;

const sweep = stylex.keyframes({
  from: {
    transform: `translateX(-${OFFSET_PX}px)`,
  },

  to: {
    transform: "translateX(100%)",
  },
});

export const App = () => <div sx={styles.box}>Animated sweep</div>;

const styles = stylex.create({
  box: {
    display: "inline-block",
    animationName: sweep,
    animationDuration: `${DURATION_SECONDS}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#818cf8",
    paddingBlock: 8,
    paddingInline: 12,
  },
});
