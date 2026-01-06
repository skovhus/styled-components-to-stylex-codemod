import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

const rowBase = {
  display: "grid",
  gridTemplateColumns: "subgrid",
  color: "white",
} as const;

const styles = stylex.create({
  groupHeaderRow: {
    ...rowBase,
    position: "sticky",
    zIndex: 3, // above regular rows
    backgroundColor: themeVars.labelBase,
  },
});

export const App = () => (
  <div style={{ fontFamily: "system-ui", padding: 12 }}>
    <div {...stylex.props(styles.groupHeaderRow)}>Group Header</div>
  </div>
);
