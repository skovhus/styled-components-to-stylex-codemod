import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

const TICK_OFFSET = 4;
const HEADER_PADDING_RIGHT = 24;
const ARCHIVED_BG = "#eef2ff";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div sx={styles.tick} style={{ left: 6 + TICK_OFFSET }}>
      Tick
    </div>
    <span {...mergedSx(styles.label, "custom-label")}>Label</span>
    <div sx={styles.drillHeader} style={{ paddingRight: HEADER_PADDING_RIGHT }}>
      Dynamic padding
    </div>
    <div
      sx={styles.drillHeader}
      style={{ paddingRight: HEADER_PADDING_RIGHT, backgroundColor: ARCHIVED_BG }}
    >
      Dynamic padding and background
    </div>
  </div>
);

const styles = stylex.create({
  tick: {
    margin: 3,
    backgroundColor: "coral",
  },
  label: {
    fontWeight: "bold",
    color: "navy",
  },
  drillHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 4,
    paddingInline: 8,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "#ccc",
  },
});
