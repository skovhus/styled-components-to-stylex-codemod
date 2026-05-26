// Theme method call resolution via adapter resolveThemeCall
import * as React from "react";
import { useTheme } from "styled-components";
import * as stylex from "@stylexjs/stylex";

function HighlightBox({ children }: { children?: React.ReactNode }) {
  const theme = useTheme();

  return (
    <div sx={styles.highlightBox(theme.highlightVariant(theme.color.bgBorderSolid))}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <HighlightBox>Highlight box</HighlightBox>
    </div>
  );
}

const styles = stylex.create({
  highlightBox: (backgroundColor: string) => ({
    padding: 16,
    color: "#333",
    backgroundColor,
  }),
});
