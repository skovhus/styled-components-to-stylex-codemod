// Stripping "Styled" prefix from component names when generating StyleX keys
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
    <canvas sx={styles.canvas} />
    <section sx={styles.section}>Styled Section</section>
    <div sx={styles.normalName}>Normal name (no prefix)</div>
    <button sx={styles.button}>Button (coral)</button>
    <button sx={styles.styledButton}>StyledButton (teal)</button>
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
  // Collision case: Button and StyledButton both exist.
  // StyledButton must NOT strip to "button" since Button already has that key.
  button: {
    backgroundColor: "coral",
    paddingBlock: "8px",
    paddingInline: "16px",
    color: "white",
  },
  styledButton: {
    backgroundColor: "teal",
    paddingBlock: "12px",
    paddingInline: "24px",
    color: "white",
  },
});
