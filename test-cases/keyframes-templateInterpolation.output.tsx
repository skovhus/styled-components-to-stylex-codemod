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

export const App = () => <div sx={styles.box}>Hi</div>;

const styles = stylex.create({
  box: {
    display: "inline-block",
    animationName: sweep,
    animationDuration: `${DURATION_SECONDS}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
    paddingBlock: 8,
    paddingInline: 12,
  },
});
