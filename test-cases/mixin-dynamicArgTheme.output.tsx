import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { helpers } from "./lib/helpers.stylex";

// Dotted theme access: theme.isDark controls the argument
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

// Bare theme truthiness check (theme object as condition)
function ThemeTruthyText(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.themeTruthyText,
        theme ? helpers.truncateMultiline(1) : helpers.truncateMultiline(2),
      ]}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <ThemeText>Dotted theme condition</ThemeText>
    <ThemeTruthyText>Bare theme condition</ThemeTruthyText>
  </div>
);

const styles = stylex.create({
  themeText: {
    lineHeight: "1rem",
  },
  themeTruthyText: {
    lineHeight: "1rem",
  },
});
