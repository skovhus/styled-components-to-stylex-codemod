import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { helpers } from "./lib/helpers.stylex";

function ThemeText(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.themeText,
        theme.isDark ? helpers.truncateMultiline(1) : helpers.truncateMultiline(2),
      ]}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <ThemeText>Theme-dependent truncation</ThemeText>
  </div>
);

const styles = stylex.create({
  themeText: {
    lineHeight: "1rem",
  },
});
