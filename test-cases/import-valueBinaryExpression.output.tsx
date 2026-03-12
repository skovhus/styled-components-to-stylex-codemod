// Imported value used in a binary expression (e.g., zIndex.dialog + 1)
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $zIndex } from "./tokens.stylex";

export function App() {
  return <div sx={styles.dialogContainer}>Dialog Content</div>;
}

const styles = stylex.create({
  dialogContainer: {
    zIndex: $zIndex.dialog + 1,
    padding: 16,
    backgroundColor: "white",
  },
});
