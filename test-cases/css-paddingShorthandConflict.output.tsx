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
    <div sx={styles.logicalOverride}>Logical override</div>
    <div sx={styles.conditionalLogicalOverride}>Conditional logical override</div>
    <div sx={styles.laterPhysicalOverride}>Later physical override</div>
    <div sx={styles.pseudoBeforeBase}>Pseudo before base</div>
    <div sx={styles.logicalSideOverride}>Logical side override</div>
  </div>
);

const styles = stylex.create({
  // Pattern 1: padding shorthand with longhand override
  // padding: 0 12px sets top/right/bottom/left padding longhands
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
  // Pattern 4: later logical longhand override must beat shorthand-derived physical sides
  logicalOverride: {
    paddingBlock: 4,
    paddingInline: 2,
    backgroundColor: "honeydew",
  },
  // Pattern 5: later conditional logical shorthand must preserve earlier side defaults
  conditionalLogicalOverride: {
    backgroundColor: "mistyrose",
    paddingLeft: {
      default: 10,
      ":hover": 12,
    },
    paddingRight: {
      default: 20,
      ":hover": 12,
    },
  },
  // Pattern 6: overwritten physical longhand order must reflect its latest declaration
  laterPhysicalOverride: {
    paddingBlock: 4,
    paddingLeft: 2,
    paddingRight: 3,
    backgroundColor: "peachpuff",
  },
  // Pattern 7: later base shorthand must become the default for earlier pseudo longhands
  pseudoBeforeBase: {
    paddingBlock: 4,
    paddingLeft: 8,
    paddingRight: {
      default: 8,
      ":hover": 20,
    },
    backgroundColor: "aliceblue",
  },
  // Pattern 8: later logical side longhand must beat shorthand-derived physical side
  logicalSideOverride: {
    paddingBlock: 4,
    paddingInline: 8,
    paddingInlineStart: 2,
    backgroundColor: "lavenderblush",
  },
});
