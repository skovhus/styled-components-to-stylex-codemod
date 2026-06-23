// Single-use dynamic inline flex values should promote to a StyleX dynamic function.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = ({ width, longBoth }: { width: number | null; longBoth: boolean }) => (
  <div>
    <div sx={styles.branchSlot(width ? `0 0 ${width}px` : longBoth ? "1 1 0" : "0 1 auto")}>
      branch slot
    </div>
  </div>
);

const styles = stylex.create({
  branchSlot: (flex: string) => ({
    minWidth: 0,
    flex,
  }),
});
