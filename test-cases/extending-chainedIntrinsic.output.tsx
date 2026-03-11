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
        <div sx={[styles.itemRow, styles.itemRowPositioned]}>
          <span>Label A</span>
          <div sx={[styles.fadeBase, styles.fadeLeft, styles.smallFade]} />
        </div>
        <div ref={measureRef} sx={[styles.itemRow, styles.measureRow]}>
          <span>Measure</span>
        </div>
        <div sx={[styles.fadeBase, styles.fadeLeft, styles.fadeLeftPosition(offset)]} />
        <div sx={[styles.fadeBase, styles.fadeRight, styles.fadeRightPosition(offset)]} />
        <div sx={[styles.tick, styles.tickPosition(lineColor)]} />
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
    gap: `${GAP}px`,
    alignItems: "center",
  },
  itemRowPositioned: {
    height: 24,
    left: 10,
    width: 100,
  },
  measureRow: {
    opacity: 0,
    zIndex: -1,
  },
  fadeBase: {
    position: "absolute",
    top: 0,
    bottom: 0,
  },
  fadeLeft: {
    width: `${FADE_WIDTH}px`,
    backgroundImage: "linear-gradient(to right, transparent, #f0f5ff)",
  },
  fadeRight: {
    width: `${FADE_WIDTH}px`,
    backgroundImage: "linear-gradient(to left, transparent, #f0f5ff)",
  },
  smallFade: {
    width: "10px",
    right: 0,
  },
  fadeLeftPosition: (left: number) => ({
    zIndex: 1,
    left,
  }),
  fadeRightPosition: (left: number) => ({
    left,
  }),
  tick: {
    position: "absolute",
    top: `-${OFFSET}px`,
    height: "6px",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "transparent",
    zIndex: 1,
  },
  tickPosition: (borderRightColor: string) => ({
    left: 40,
    borderRightColor,
  }),
});
