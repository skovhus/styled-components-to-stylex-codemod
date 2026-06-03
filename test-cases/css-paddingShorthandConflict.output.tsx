import React from "react";
import * as stylex from "@stylexjs/stylex";

// Pattern 3: pseudo longhand override must preserve the shorthand-derived default
function Row({ children }: { children?: React.ReactNode }) {
  return <div sx={styles.row}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <div sx={styles.progressBar}>Progress Bar</div>
    <div sx={styles.header}>Header</div>
    <Row>Row one</Row>
    <Row>Row two</Row>
  </div>
);

const styles = stylex.create({
  // Pattern 1: padding shorthand with longhand override
  // padding: 0 12px sets paddingBlock: 0, paddingInline: 12px
  // padding-bottom: 10px then overrides just the bottom
  progressBar: {
    paddingTop: 0,
    paddingBottom: 10,
    paddingInline: 12,
    backgroundColor: "#eee",
  },
  // Pattern 2: directional padding with same-axis longhand override
  // padding-top and padding-bottom set block axis individually
  header: {
    paddingTop: 0,
    paddingBottom: 8,
    paddingInline: 16,
    backgroundColor: "lightblue",
  },
  row: {
    paddingTop: 6,
    paddingBottom: {
      default: 6,
      ":last-child": 0,
    },
    paddingInline: 12,
    backgroundColor: "lavender",
  },
});
