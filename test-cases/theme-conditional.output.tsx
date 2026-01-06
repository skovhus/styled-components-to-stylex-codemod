import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";
import * as React from "react";

const styles = stylex.create({
  optionLabel: {
    display: "flex",
    gap: "4px",
    alignItems: "center",
    fontSize: "11px",
    color: themeVars.labelBase,
    cursor: "pointer",
  },
  optionLabelDisabled: {
    color: themeVars.labelMuted,
    cursor: "not-allowed",
  },
});

export const App = () => (
  <div>
    <label {...stylex.props(styles.optionLabel)}>Enabled</label>
    <label {...stylex.props(styles.optionLabel, styles.optionLabelDisabled)}>Disabled</label>
  </div>
);
