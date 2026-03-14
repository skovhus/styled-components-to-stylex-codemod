// Border shorthand expansion from helper function calls
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: "10px" }}>
    <div sx={styles.borderLeft}>Bordered left</div>
    <div sx={styles.border}>Bordered box</div>
    <div sx={[styles.border, styles.thinBorderContainer]}>Thin border</div>
  </div>
);

const styles = stylex.create({
  borderLeft: {
    borderLeftWidth: pixelVars.thin,
    borderLeftStyle: "solid",
    borderLeftColor: $colors.labelMuted,
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
  // Border shorthand from helper function call returning full border value
  thinBorderContainer: {
    paddingBlock: 8,
    paddingInline: 16,
  },
});
