// Theme method call resolution via adapter resolveThemeCall
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div sx={styles.highlightBox}>Highlight box</div>
    </div>
  );
}

const styles = stylex.create({
  highlightBox: {
    padding: 16,
    backgroundColor: $colors.bgBorderSolid,
    color: "#333",
  },
});
