import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";
import { PageSizeConstants } from "./lib/pageSizes.stylex";

const PEEK_MAX_WIDTH = 380;

export function App() {
  return <div sx={styles.container}>Fixed modal shell</div>;
}

const styles = stylex.create({
  container: {
    backgroundColor: "#eef2ff",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#4f46e5",
    borderRadius: 8,
    padding: 6,
    maxWidth: `${PEEK_MAX_WIDTH}px`,
    minHeight: `${PageSizeConstants.listInitiativeRowHeight}px`,
    position: "fixed",
    zIndex: $zIndex.modal,
  },
});
