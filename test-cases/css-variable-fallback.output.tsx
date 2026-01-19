import React from "react";
import * as stylex from "@stylexjs/stylex";

export function ScrollableArea({ children }: { children: React.ReactNode }) {
  return <div {...stylex.props(styles.scrollContainer)}>{children}</div>;
}

export const App = () => (
  <ScrollableArea>
    <div>Scrollable content</div>
  </ScrollableArea>
);

const styles = stylex.create({
  /**
   * Test case for CSS variable with fallback value.
   * The codemod should handle: var(--scrollbar-width, 12px)
   */
  scrollContainer: {
    width: "100%",
    paddingRight: "var(--scrollbar-width, 12px)",
    overflowY: "auto",
  },
});
