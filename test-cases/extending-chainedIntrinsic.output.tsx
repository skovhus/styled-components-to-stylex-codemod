// Extending chain with style props promoted to stylex styles and dynamic functions
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
        <div sx={[styles.itemRow, styles.itemRowInline]}>
          <span>Label A</span>
          <div sx={[styles.fadeBase, styles.fadeLeft, styles.smallFade]} />
        </div>
        <div ref={measureRef} sx={[styles.itemRow, styles.itemRowInline2]}>
          <span>Measure</span>
        </div>
        <div sx={[styles.fadeBase, styles.fadeLeft, styles.fadeLeftDynamic(offset)]} />
        <div sx={[styles.fadeBase, styles.fadeRight, styles.fadeRightDynamic(offset)]} />
        <div sx={[styles.tick, styles.tickDynamic(lineColor)]} />
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
  tick: {
    position: "absolute",
    top: `-${OFFSET}px`,
    height: "6px",
    borderRightWidth: "1px",
    borderRightStyle: "solid",
    borderRightColor: "transparent",
    zIndex: 1,
  },
  itemRowInline: {
    height: 24,
    left: 10,
    width: 100,
  },
  itemRowInline2: {
    opacity: 0,
    zIndex: -1,
  },
  fadeLeftDynamic: (left: number) => ({
    zIndex: 1,
    left,
  }),
  fadeRightDynamic: (left: number) => ({
    left,
  }),
  tickDynamic: (borderRightColor: string) => ({
    left: 40,
    borderRightColor,
  }),
});
