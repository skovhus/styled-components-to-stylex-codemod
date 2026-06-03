import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <div sx={styles.box}>Hover or focus me, and resize!</div>
    <div sx={styles.placeholder} />
  </div>
);

const shimmer = stylex.keyframes({
  "100%": {
    transform: "translateX(100%)",
  },
});

const styles = stylex.create({
  box: {
    color: {
      default: "blue",
      ":hover": "red",
      ":focus-visible": "green",
      "@media (max-width: 600px)": "orange",
    },
    backgroundColor: {
      default: "white",
      ":hover": "lightblue",
      "@media (max-width: 600px)": "gray",
    },
    outline: {
      default: null,
      ":focus-visible": "2px solid blue",
    },
  },
  placeholder: {
    position: "relative",
    overflow: "hidden",
    height: 20,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      transform: "translateX(-100%)",
      backgroundImage: "linear-gradient(90deg, transparent, #f8fafc, transparent)",
      animationName: {
        default: shimmer,
        "@media (prefers-reduced-motion: reduce)": "none",
      },
      animationDuration: "3s",
      animationIterationCount: "infinite",
      animationPlayState: "paused",
    },
  },
});
