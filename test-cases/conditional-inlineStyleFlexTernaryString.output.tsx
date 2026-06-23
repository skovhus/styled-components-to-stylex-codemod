// Dynamic inline flex values should remain in the caller-owned JSX style prop.
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = ({ width, longBoth }: { width: number | null; longBoth: boolean }) => (
  <div>
    <div
      sx={styles.branchSlot}
      style={{
        flex: width ? `0 0 ${width}px` : longBoth ? "1 1 0" : "0 1 auto",
      }}
    >
      branch slot
    </div>
  </div>
);

const styles = stylex.create({
  branchSlot: {
    minWidth: 0,
  },
});
