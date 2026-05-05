import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

export const App = () => (
  <div
    style={{
      position: "relative",
      width: 180,
      height: 96,
      overflow: "hidden",
      transform: "translateZ(0)",
      border: "1px solid #cbd5e1",
      borderRadius: 8,
      background: "#e5e7eb",
    }}
  >
    <div sx={styles.toastLayer}>
      <div sx={styles.dropIndicator} />
    </div>
  </div>
);

const styles = stylex.create({
  toastLayer: {
    zIndex: `calc(${$zIndex.dialog} + 1)`,
    position: "fixed",
    inset: 16,
    backgroundColor: "white",
  },
  dropIndicator: {
    zIndex: `calc(${$zIndex.popover} - 1)`,
    position: "relative",
    height: 8,
    backgroundColor: "#60a5fa",
  },
});
