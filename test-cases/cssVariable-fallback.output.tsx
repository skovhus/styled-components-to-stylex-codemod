import React from "react";
import * as stylex from "@stylexjs/stylex";

export function ScrollableArea({ children }: { children: React.ReactNode }) {
  return (
    <div sx={styles.scrollContainer} style={scrollContainerInlineStyle}>
      {children}
    </div>
  );
}

export const App = () => (
  <ScrollableArea>
    <div>Scrollable content</div>
  </ScrollableArea>
);

const scrollContainerInlineStyle = {
  paddingRight: "var(--scrollbar-width, 12px)",
} satisfies React.CSSProperties;

const styles = stylex.create({
  scrollContainer: {
    width: "100%",
    overflowY: "auto",
  },
});
