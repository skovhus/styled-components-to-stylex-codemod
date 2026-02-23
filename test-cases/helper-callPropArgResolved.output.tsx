import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $shadow } from "./tokens.stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.box, styles.boxBoxShadow("dark"))}>Dark shadow</div>
    <div {...stylex.props(styles.box, styles.boxBoxShadow("light"))}>Light shadow</div>
  </div>
);

const styles = stylex.create({
  // Test: adapter resolution for helper calls with dynamic prop args.
  // The adapter remaps `shadow` → `$shadow` from tokens.stylex.

  box: {
    height: "50px",
    width: "50px",
    padding: "8px",
    backgroundColor: "#f0f0f0",
  },
  boxBoxShadow: (boxShadow: "dark" | "light") => ({
    boxShadow: $shadow[boxShadow],
  }),
});
