/**
 * Test case for element child combinator selectors.
 * Demonstrates `> button { ... }` being transformed to direct-child-only
 * relation overrides.
 */
import * as React from "react";
import * as stylex from "@stylexjs/stylex";

export const App = () => (
  <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
    <div sx={styles.toolbar}>
      <button sx={[styles.actionButton, styles.actionButtonDirectChildInToolbar]}>Action 1</button>
      <button sx={[styles.actionButton, styles.actionButtonDirectChildInToolbar]}>Action 2</button>
    </div>
    <div sx={styles.mixedToolbar}>
      <button
        sx={[
          styles.actionButton,
          styles.actionButtonInMixedToolbar,
          styles.actionButtonDirectChildInMixedToolbar,
        ]}
      >
        Direct mixed
      </button>
      <span>
        <button sx={[styles.actionButton, styles.actionButtonInMixedToolbar]}>Nested mixed</button>
      </span>
    </div>
  </div>
);

const styles = stylex.create({
  actionButton: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#bf4f74",
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderColor: "initial",
    borderRadius: 4,
  },
  toolbar: {
    display: "flex",
    gap: 8,
    padding: 8,
    backgroundColor: "#f0f0f0",
  },
  mixedToolbar: {
    display: "flex",
    gap: 8,
    padding: 8,
    backgroundColor: "#eef7ff",
  },
  actionButtonDirectChildInToolbar: {
    fontWeight: "bold",
  },
  actionButtonInMixedToolbar: {
    textDecoration: "underline",
  },
  actionButtonDirectChildInMixedToolbar: {
    fontWeight: "bold",
  },
});
