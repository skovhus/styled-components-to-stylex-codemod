// JSX `style={{ flex: <ternary returning only strings> }}` — the ternary
// returns CSS `flex` shorthand strings like `"0 0 100px"`, `"1 1 0"`. The
// codemod converts this to a dynamic style fn but types the param as `number`
// (probably because it sees `flex` and assumes the canonical number form
// `flex: 1`). Real call site passes only strings → TS2345
// "Argument of type 'string' is not assignable to parameter of type 'number'".
//
// Regression repro for promoted inline style flex values inferred from string branches.
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
