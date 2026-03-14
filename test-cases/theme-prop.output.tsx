import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";
import { pixelVars } from "./tokens.stylex";

// Block-level theme boolean conditional: theme.isDark controls entire CSS block
function Box(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();
  return (
    <div sx={[styles.box, theme.isDark ? styles.boxDark : styles.boxLight]}>{props.children}</div>
  );
}

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
function ModeBox(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.modeBox,
        theme.mode === "dark" ? styles.modeBoxThemeModeDark : styles.modeBoxThemeModeNotDark,
      ]}
    >
      {props.children}
    </div>
  );
}

export const App = () => (
  <div>
    <Box>Theme prop</Box>
    <ModeBox>Theme mode</ModeBox>
  </div>
);

const styles = stylex.create({
  box: {
    height: 100,
    width: 100,
  },
  boxDark: {
    padding: pixelVars.thin,
  },
  boxLight: {
    padding: 100,
  },
  modeBox: {
    height: 100,
    width: 100,
  },
  modeBoxThemeModeDark: {
    color: "white",
  },
  modeBoxThemeModeNotDark: {
    color: "black",
  },
});
