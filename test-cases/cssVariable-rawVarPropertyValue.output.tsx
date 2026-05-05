import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 12 }}>
    <div sx={styles.columnTrack} style={columnTrackInlineStyle}>
      Variable columns
    </div>
  </div>
);

const columnTrackInlineStyle = {
  gridTemplateColumns: "var(--column-width)",
  minWidth: "var(--column-min-width, min-content, 0)",
  width: "min(var(--column-width), var(--column-max-width))",
} satisfies React.CSSProperties;

const styles = stylex.create({
  columnTrack: {
    display: "grid",
    gap: 8,
    backgroundColor: "#f1f5f9",
  },
});
