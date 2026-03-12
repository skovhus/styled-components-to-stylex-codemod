import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export function App() {
  return (
    <div sx={styles.wrapper}>
      <div {...mergedSx([styles.flex, flexGapVariants[8]], "u-margin")}>With className</div>
      <div {...mergedSx([styles.flex, flexGapVariants[16]], undefined, { color: "red" })}>
        With style
      </div>
    </div>
  );
}

const styles = stylex.create({
  wrapper: {
    padding: 16,
    backgroundColor: "#f0f5ff",
  },
  flex: {
    display: "flex",
    flexDirection: "column",
  },
});

const flexGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  16: {
    gap: "16px",
  },
});
