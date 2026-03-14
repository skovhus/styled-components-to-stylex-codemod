// Border shorthand expansion from helper function calls
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export const App = () => (
  <div style={{ padding: "10px" }}>
    <div sx={styles.borderedLeftBorderLeft}>Bordered left</div>
    <div sx={styles.borderedBoxBorder}>Bordered box</div>
    <div sx={[styles.thinBorderContainerBorder, styles.thinBorderContainer]}>Thin border</div>
  </div>
);

const styles = stylex.create({
  borderedLeftBorderLeft: {
    borderLeftWidth: pixelVars.thin,
    borderLeftStyle: "solid",
    borderLeftColor: $colors.labelMuted,
  },
  borderedBoxBorder: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.labelMuted,
  },
  // Border shorthand from helper function call returning full border value
  thinBorderContainer: {
    paddingBlock: 8,
    paddingInline: 16,
  },
  thinBorderContainerBorder: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
});
