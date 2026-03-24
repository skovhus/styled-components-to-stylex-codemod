import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <div sx={styles.progressBar}>Progress Bar</div>
    <div sx={styles.header}>Header</div>
  </div>
);

const styles = stylex.create({
  // Pattern 1: padding shorthand with longhand override
  // padding: 0 12px sets paddingBlock: 0, paddingInline: 12px
  // padding-bottom: 10px then overrides just the bottom
  progressBar: {
    paddingTop: 0,
    paddingRight: 12,
    paddingBottom: 10,
    paddingLeft: 12,
    backgroundColor: "#eee",
  },
  // Pattern 2: directional padding with same-axis longhand override
  // padding-top and padding-bottom set block axis individually
  header: {
    paddingTop: 0,
    paddingRight: 16,
    paddingBottom: 8,
    paddingLeft: 16,
    backgroundColor: "lightblue",
  },
});
