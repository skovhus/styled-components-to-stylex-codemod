// Border shorthand expansion from helper function calls
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: "10px" }}>
    <div sx={styles.borderedLeft}>Bordered left</div>
    <div sx={styles.borderedBox}>Bordered box</div>
    <div sx={styles.thinBorderContainer}>Thin border</div>
  </div>
);

const styles = stylex.create({
  // Directional border: expands to borderLeftWidth, borderLeftStyle, borderLeftColor
  borderedLeft: {
    borderLeftWidth: pixelVars.thin,
    borderLeftStyle: "solid",
    borderLeftColor: $colors.labelMuted,
  },
  // Non-directional border: expands to borderWidth, borderStyle, borderColor
  borderedBox: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
  // Border shorthand from helper function call returning full border value
  thinBorderContainer: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
    paddingBlock: 8,
    paddingInline: 16,
  },
});
