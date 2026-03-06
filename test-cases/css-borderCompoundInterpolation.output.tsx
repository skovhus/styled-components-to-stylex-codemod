import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export function App() {
  return <div sx={styles.container}>Hello</div>;
}

const styles = stylex.create({
  /**
   * Compound border shorthand with two interpolations:
   * width from thinPixel(), style static, color from color() helper.
   */
  container: {
    borderRadius: "2px",
    paddingBlock: "2px",
    paddingInline: "6px",
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.bgBorderFaint,
    flexShrink: 0,
  },
});
