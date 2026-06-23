// Extending chain with static style props promoted and dynamic style props preserved inline
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

const FADE_WIDTH = 20;
const GAP = 4;
const OFFSET = 4;

export function App() {
  const measureRef = React.useRef<HTMLDivElement>(null);
  const offset = 50;
  const lineColor = "#999";

  return (
    <div style={{ position: "relative", height: 120, padding: 16 }}>
      <div sx={styles.container}>
        <div sx={[styles.itemRow, styles.itemRowLabel]}>
          <span>Label A</span>
          <div sx={[styles.fadeBase, styles.fadeLeft, styles.smallFade]} />
        </div>
        <div ref={measureRef} sx={[styles.itemRow, styles.itemRowMeasure]}>
          <span>Measure</span>
        </div>
        <div sx={[styles.fadeBase, styles.fadeLeft]} style={{ zIndex: 1, left: offset }} />
        <div sx={[styles.fadeBase, styles.fadeRight]} style={{ left: offset }} />
        <div sx={styles.tick} style={{ left: 40, borderRightColor: lineColor }} />
      </div>
    </div>
  );
}

const styles = stylex.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    pointerEvents: "none",
  },
  itemRow: {
    position: "absolute",
    pointerEvents: "none",
    display: "flex",
    gap: GAP,
    alignItems: "center",
  },
  fadeBase: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  fadeLeft: {
    width: FADE_WIDTH,
    backgroundImage: "linear-gradient(to right, transparent, #f0f5ff)",
  },
  fadeRight: {
    width: FADE_WIDTH,
    backgroundImage: "linear-gradient(to left, transparent, #f0f5ff)",
  },
  smallFade: {
    width: 10,
    right: 0,
  },
  tick: {
    position: "absolute",
    top: -OFFSET,
    height: 6,
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "transparent",
    zIndex: 1,
  },
  itemRowLabel: {
    height: 24,
    left: 10,
    width: 100,
  },
  itemRowMeasure: {
    opacity: 0,
    zIndex: -1,
  },
});
