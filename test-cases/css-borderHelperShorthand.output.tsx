// Border shorthand from helper function call returning full border value
import React from "react";
import * as stylex from "@stylexjs/stylex";
import { pixelVars } from "./tokens.stylex";

export function App() {
  return <div sx={[styles.border, styles.container]}>Hello</div>;
}

const styles = stylex.create({
  container: {
    paddingBlock: 8,
    paddingInline: 16,
  },
  border: {
    borderWidth: pixelVars.thin,
    borderStyle: "solid",
    borderColor: "transparent",
  },
});
