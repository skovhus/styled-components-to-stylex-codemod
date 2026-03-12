import * as stylex from "@stylexjs/stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <div sx={styles.zoomIn}>Zoom In</div>
      <div sx={styles.slideDown}>Slide Down</div>
    </div>
  );
}

const zoomIn = stylex.keyframes({
  "0%": {
    transform: "scale(0)",
    opacity: 0,
  },

  "100%": {
    transform: "scale(1)",
    opacity: 1,
  },
});

const slideDown = stylex.keyframes({
  from: {
    transform: "translateY(-20px)",
    opacity: 0,
  },

  to: {
    transform: "translateY(0)",
    opacity: 1,
  },
});

const styles = stylex.create({
  // Static animation-name longhand referencing inline @keyframes
  zoomIn: {
    animationName: zoomIn,
    animationDuration: "0.3s",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
    backgroundColor: "lightsalmon",
    padding: 20,
  },
  // Kebab-case keyframe name
  slideDown: {
    animationName: slideDown,
    animationDuration: "0.4s",
    animationTimingFunction: "ease-in-out",
    backgroundColor: "lightsteelblue",
    padding: 20,
  },
});
