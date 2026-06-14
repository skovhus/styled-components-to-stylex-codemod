import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: 8, padding: 16 }}>
    <div sx={styles.clipped}>Single-value overflow hidden with long content that overflows</div>
    <div sx={styles.split}>Two-value overflow hidden auto with long content that overflows</div>
  </div>
);

const styles = stylex.create({
  // Single-value shorthand: should stay as overflow
  clipped: {
    overflow: "hidden",
    backgroundColor: "lightblue",
    padding: 8,
    width: 120,
    height: 60,
  },
  // Two-value shorthand: should expand to overflowX/overflowY
  split: {
    overflowX: "hidden",
    overflowY: "auto",
    backgroundColor: "lightyellow",
    padding: 8,
    width: 120,
    height: 60,
  },
});
