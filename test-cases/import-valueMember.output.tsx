import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

const PEEK_MAX_WIDTH = 380;

export function App() {
  return <div {...stylex.props(styles.container)} />;
}

const styles = stylex.create({
  container: {
    borderRadius: "8px",
    padding: "6px",
    maxWidth: `${PEEK_MAX_WIDTH}px`,
    position: "fixed",
    zIndex: $zIndex.modal,
  },
});
