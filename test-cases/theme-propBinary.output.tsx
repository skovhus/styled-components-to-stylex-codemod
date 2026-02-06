import React from "react";
import * as stylex from "@stylexjs/stylex";
import { useTheme } from "styled-components";

// Block-level theme binary conditional: theme.mode === "dark" controls entire CSS block
function Box(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  const theme = useTheme();

  return (
    <div
      {...stylex.props(
        styles.box,
        theme.mode === "dark" ? styles.boxThemeModeDark : styles.boxThemeModeNotDark,
      )}
    >
      {children}
    </div>
  );
}

export const App = () => <Box />;

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
