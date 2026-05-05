import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

export const App = () => (
  <div sx={styles.toastLayer}>
    <div sx={styles.dropIndicator} />
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
