/**
 * Test case for element descendant selectors.
 * Demonstrates `svg { ... }` being transformed to relation overrides
 * when a single styled.svg exists in the same file.
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.container, stylex.defaultMarker())}>
      <svg viewBox="0 0 24 24" {...stylex.props(styles.icon, styles.iconInContainer)}>
        <circle cx="12" cy="12" r="10" />
      </svg>
      <span>With icon</span>
    </div>
  </div>
);

const styles = stylex.create({
  icon: {
    fill: "gray",
    width: "24px",
    height: "24px",
  },
  container: {
    padding: "16px",
    backgroundColor: "white",
  },
  iconInContainer: {
    fill: "blue",
  },
});
