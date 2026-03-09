// Stripping "Styled" prefix from component names when generating StyleX keys
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <canvas sx={styles.canvas} />
    <section sx={styles.section}>Styled Section</section>
    <div sx={styles.normalName}>Normal name (no prefix)</div>
  </div>
);

const styles = stylex.create({
  canvas: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "black",
    width: "200px",
    height: "100px",
  },
  section: {
    padding: "16px",
    backgroundColor: "#f0f0f0",
  },
  normalName: {
    color: "blue",
    padding: "8px",
  },
});
