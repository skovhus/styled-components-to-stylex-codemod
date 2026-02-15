/**
 * Test case for element selectors with ancestor pseudo-classes.
 * Demonstrates `&:hover svg { ... }` being transformed to
 * stylex.when.ancestor(":hover") on the child element.
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.card, stylex.defaultMarker())}>
      <svg viewBox="0 0 24 24" {...stylex.props(styles.icon, styles.iconInCard)}>
        <circle cx="12" cy="12" r="10" />
      </svg>
      <span>Hover me</span>
    </div>
  </div>
);

const styles = stylex.create({
  icon: {
    fill: "gray",
    width: "24px",
    height: "24px",
  },
  card: {
    padding: "16px",
    backgroundColor: "white",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  iconInCard: {
    fill: {
      default: "gray",
      [stylex.when.ancestor(":hover")]: "red",
    },
  },
});
