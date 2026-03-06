// Importing values directly from a .stylex file should be preserved as-is
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

export function App() {
  return <div sx={styles.container}>StyleX Direct Import</div>;
}

const styles = stylex.create({
  container: {
    borderRadius: "8px",
    padding: "6px",
    position: "fixed",
    zIndex: $zIndex.modal,
  },
});
