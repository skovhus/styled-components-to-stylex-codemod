import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

const TICK_OFFSET = 4;

export const App = () => (
  <div style={{ display: "flex", gap: 8 }}>
    <div sx={styles.tick(6 + TICK_OFFSET)}>Tick</div>
    <span {...mergedSx(styles.label, "custom-label")}>Label</span>
  </div>
);

const styles = stylex.create({
  tick: (left: number | string) => ({
    margin: 3,
    backgroundColor: "coral",
    left,
  }),
  label: {
    fontWeight: "bold",
    color: "navy",
  },
});
