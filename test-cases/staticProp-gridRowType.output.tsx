// Dynamic grid-row inline style promoted to StyleX should use string type
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = ({ row }: { row: string }) => (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 16 }}>
    <div sx={[styles.cell, styles.cellDynamicRow(row)]}>Dynamic Row</div>
    <div sx={[styles.cell, styles.cellStaticRow1]}>Static Row 1</div>
    <div sx={styles.cell}>No Grid Row</div>
  </div>
);

const styles = stylex.create({
  cell: {
    padding: 8,
    backgroundColor: "#e3f2fd",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#90caf9",
  },
  cellDynamicRow: (gridRow: string) => ({
    gridRow,
  }),
  cellStaticRow1: {
    gridRow: "1",
  },
});
