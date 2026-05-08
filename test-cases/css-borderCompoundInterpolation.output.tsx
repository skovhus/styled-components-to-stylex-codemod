import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars, $colors } from "./tokens.stylex";

export function App() {
  return <div sx={styles.container}>Hello</div>;
}

const styles = stylex.create({
  container: {
    borderRadius: 2,
    paddingBlock: 2,
    paddingInline: 6,
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: $colors.bgBorderFaint,
    flexShrink: 0,
  },
});
