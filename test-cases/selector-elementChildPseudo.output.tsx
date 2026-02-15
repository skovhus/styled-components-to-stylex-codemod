/**
 * Test case for element selectors with child pseudo-classes.
 * Demonstrates `svg:hover { ... }` being transformed to
 * a pseudo-class on the child element (not stylex.when.ancestor()).
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.container, stylex.defaultMarker())}>
      <svg viewBox="0 0 24 24" {...stylex.props(styles.icon, styles.iconInContainer)}>
        <circle cx="12" cy="12" r="10" />
      </svg>
      <span>Hover the icon</span>
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
    fill: {
      default: "gray",
      ":hover": "blue",
    },
    transform: {
      default: null,
      ":hover": "scale(1.2)",
    },
  },
});
