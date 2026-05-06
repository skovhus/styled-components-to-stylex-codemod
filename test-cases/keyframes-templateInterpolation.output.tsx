import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

const OFFSET_PX = 40;
const DURATION_SECONDS = 1.8;
const RUN_PERCENT = 80;

const sweep = stylex.keyframes({
  from: {
    transform: `translateX(-${OFFSET_PX}px)`,
  },

  to: {
    transform: "translateX(100%)",
  },
});

const chromaticSweep = stylex.keyframes({
  "0%": {
    backgroundPosition: `-${OFFSET_PX}px 50%, 0 50%`,
  },

  [`${RUN_PERCENT}%`]: {
    backgroundPosition: `${OFFSET_PX}px 50%, 0 50%`,
  },

  "100%": {
    backgroundPosition: `${OFFSET_PX}px 50%, 0 50%`,
  },
});

export const App = () => (
  <div style={{ display: "grid", gap: 8 }}>
    <div sx={styles.box}>Hi</div>
    <span sx={[styles.shimmerText, styles.shimmerTextBackgroundImage("/shine.png")]}>
      Layered shimmer
    </span>
  </div>
);

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
  shimmerText: {
    color: "transparent",
    backgroundClip: "text",
    animationName: chromaticSweep,
    animationDuration: `${DURATION_SECONDS}s`,
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  shimmerTextBackgroundImage: (imageUrl: string) => ({
    backgroundImage: `url("${imageUrl}"), linear-gradient(${$colors.labelMuted}, ${$colors.labelMuted})`,
  }),
});
