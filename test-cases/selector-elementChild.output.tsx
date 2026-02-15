/**
 * Test case for element child combinator selectors.
 * Demonstrates `> button { ... }` being transformed to relation overrides.
 *
 * Note: Both CSS descendant (space) and child (>) combinators map to
 * stylex.when.ancestor(). The child combinator is therefore less strict
 * in the output than the original CSS.
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div {...stylex.props(styles.toolbar, stylex.defaultMarker())}>
      <button {...stylex.props(styles.actionButton, styles.actionButtonInToolbar)}>Action 1</button>
      <button {...stylex.props(styles.actionButton, styles.actionButtonInToolbar)}>Action 2</button>
    </div>
  </div>
);

const styles = stylex.create({
  actionButton: {
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#bf4f74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  toolbar: {
    display: "flex",
    gap: "8px",
    padding: "8px",
    backgroundColor: "#f0f0f0",
  },
  actionButtonInToolbar: {
    fontWeight: "bold",
  },
});
