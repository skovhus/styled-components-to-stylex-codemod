import React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ padding: 40 }}>
    <div sx={styles.point}>Point</div>
  </div>
);

const styles = stylex.create({
  /**
   * Pseudo-elements with single colon (&:before, &:after).
   * The codemod should normalize to double-colon (::before / ::after).
   */
  point: {
    position: "relative",
    width: 48,
    height: 16,
    backgroundColor: "#bf4f74",
    borderRadius: 2,
    "::after": {
      content: '""',
      position: "absolute",
      left: 0,
      height: 8,
      width: 48,
      backgroundColor: "rgba(191, 79, 116, 0.5)",
      zIndex: 1,
      bottom: -12,
    },
    "::before": {
      content: '""',
      position: "absolute",
      left: 0,
      height: 8,
      width: 48,
      backgroundColor: "rgba(191, 79, 116, 0.5)",
      zIndex: 1,
      top: -12,
    },
  },
});
