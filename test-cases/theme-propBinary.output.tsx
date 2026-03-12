import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
function Box(props: React.PropsWithChildren<{}>) {
  const theme = useTheme();

  return (
    <div
      sx={[
        styles.box,
        theme.mode === "dark" ? styles.boxThemeModeDark : styles.boxThemeModeNotDark,
      ]}
    >
      {props.children}
    </div>
  );
}

export const App = () => <Box>Theme mode</Box>;

const styles = stylex.create({
  box: {
    height: 100,
    width: 100,
  },
  boxThemeModeDark: {
    color: "white",
  },
  boxThemeModeNotDark: {
    color: "black",
  },
});
