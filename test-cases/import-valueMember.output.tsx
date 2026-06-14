import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";
import { CardSizeConstants, PageSizeConstants } from "./lib/pageSizes.stylex";

const PEEK_MAX_WIDTH = 380;

export function App() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div sx={styles.container}>Fixed modal shell</div>
      <div sx={styles.column}>Inlined width column</div>
    </div>
  );
}

const styles = stylex.create({
  container: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#4f46e5",
    borderRadius: 8,
    padding: 6,
    maxWidth: PEEK_MAX_WIDTH,
    width: `${CardSizeConstants.cardWidth}px`,
    minHeight: PageSizeConstants.listInitiativeRowHeight,
    position: "fixed",
    zIndex: $zIndex.modal,
  },
  // COLUMN_WIDTH comes from a plain module: it must be inlined as a literal
  // (and arithmetic on it constant-folded) since the StyleX compiler cannot
  // resolve imported non-StyleX values. PEEK_MAX_WIDTH above is a local const,
  // so it stays a same-file reference the compiler can evaluate.
  column: {
    height: 40,
    backgroundColor: "#ddd6fe",
    /* NOTE: Inlined COLUMN_WIDTH as StyleX requires it to be statically evaluable */
    width: 320,
    /* NOTE: Inlined COLUMN_WIDTH * 2 as StyleX requires it to be statically evaluable */
    minWidth: 640,
  },
});
