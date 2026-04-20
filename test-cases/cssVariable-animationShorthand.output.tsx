import * as stylex from "@stylexjs/stylex";

const shimmer = stylex.keyframes({
  "0%": {
    opacity: 0.4,
  },

  "50%": {
    opacity: 1,
  },

  "100%": {
    opacity: 0.4,
  },
});

const pulse = stylex.keyframes({
  "0%,100%": {
    transform: "scale(1)",
  },

  "50%": {
    transform: "scale(1.1)",
  },
});

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <div sx={styles.progressFill}>Progress</div>
    <div sx={styles.pulser}>Pulse</div>
    <div sx={styles.delayed}>Delay</div>
  </div>
);

const styles = stylex.create({
  // var() with a time fallback → animationDuration
  progressFill: {
    position: "relative",
    height: 8,
    backgroundColor: "cornflowerblue",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      opacity: "var(--animation-enabled, 0)",
      animationName: shimmer,
      animationDuration: "var(--animation-duration, 1.5s)",
      animationIterationCount: "infinite",
      animationTimingFunction: "ease-in-out",
    },
  },
  // var() with a timing-function fallback → animationTimingFunction
  pulser: {
    width: 40,
    height: 40,
    backgroundColor: "tomato",
    animationName: pulse,
    animationDuration: "2s",
    animationTimingFunction: "var(--easing, ease-in-out)",
    animationIterationCount: "infinite",
  },
  // Two var() time values → duration then delay
  delayed: {
    width: 40,
    height: 40,
    backgroundColor: "gold",
    animationName: pulse,
    animationDuration: "var(--dur, 0.8s)",
    animationTimingFunction: "ease-out",
    animationDelay: "var(--delay, 0.2s)",
    animationIterationCount: "infinite",
  },
});
