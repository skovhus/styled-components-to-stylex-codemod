import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
function Box(props: { children?: React.ReactNode }) {
  const theme = useTheme();

  return (
    <div
      {...stylex.props(
        styles.box,
        theme.mode === "dark" ? styles.boxThemeModeDark : styles.boxThemeModeNotDark,
      )}
    >
      {props.children}
    </div>
  );
}

export const App = () => <Box>Theme mode</Box>;

const styles = stylex.create({
  box: {
    height: "100px",
    width: "100px",
  },
  boxThemeModeDark: {
    color: "white",
  },
  boxThemeModeNotDark: {
    color: "black",
  },
});
