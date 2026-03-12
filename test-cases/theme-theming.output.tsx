import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThemeProvider } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

function Button(props: React.PropsWithChildren<{}>) {
  return <button sx={styles.button}>{props.children}</button>;
}

const theme = testCaseTheme;

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Button>Normal</Button>
    <ThemeProvider theme={theme}>
      <Button>Themed</Button>
    </ThemeProvider>
  </div>
);

const styles = stylex.create({
  button: {
    fontSize: 14,
    margin: 0,
    paddingBlock: 8,
    paddingInline: 16,
    borderRadius: 6,
    backgroundColor: "white",
    color: $colors.primaryColor,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
  },
});
