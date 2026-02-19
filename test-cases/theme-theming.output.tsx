import * as stylex from "@stylexjs/stylex";
import { ThemeProvider } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

const theme = testCaseTheme;

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <button {...stylex.props(styles.button)}>Normal</button>
    <ThemeProvider theme={theme}>
      <button {...stylex.props(styles.button)}>Themed</button>
    </ThemeProvider>
  </div>
);

const styles = stylex.create({
  button: {
    fontSize: "14px",
    margin: 0,
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "6px",
    backgroundColor: "white",
    color: $colors.primaryColor,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
  },
});
