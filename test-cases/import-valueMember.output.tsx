import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

const PEEK_MAX_WIDTH = 380;

export function App() {
  return <div sx={styles.container} />;
}

const styles = stylex.create({
  container: {
    borderRadius: 8,
    padding: 6,
    maxWidth: `${PEEK_MAX_WIDTH}px`,
    position: "fixed",
    zIndex: $zIndex.modal,
  },
});
