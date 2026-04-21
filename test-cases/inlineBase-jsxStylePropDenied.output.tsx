import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

export function App() {
  return (
    <div sx={styles.wrapper}>
      <div {...mergedSx([styles.flex, flexGapVariants[8]], undefined, { color: "white" })}>
        Sibling site is also held back by the denylisted entry below
      </div>
      <div
        {...mergedSx([styles.flex, flexGapVariants[12]], undefined, {
          font: "12px/1.4 system-ui",
          color: "black",
        })}
      >
        font shorthand is denylisted
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
    flexDirection: "row",
  },
});

const flexGapVariants = stylex.create({
  8: {
    gap: "8px",
  },
  12: {
    gap: "12px",
  },
});
