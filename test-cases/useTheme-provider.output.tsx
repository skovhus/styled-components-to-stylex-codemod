import * as stylex from "@stylexjs/stylex";
import { ThemeProvider, useTheme } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

const theme = testCaseTheme;

const ThemeInfo = () => {
  const theme = useTheme();
  return (
    <div style={{ color: theme.color.textSecondary }}>Primary: {theme.color.primaryColor}</div>
  );
};

export const App = () => (
  <ThemeProvider theme={theme}>
    <div style={{ display: "grid", gap: "8px", padding: "12px" }}>
      <button {...stylex.props(styles.button)}>Themed Button</button>
      <ThemeInfo />
    </div>
  </ThemeProvider>
);

const styles = stylex.create({
  button: {
    paddingBlock: "10px",
    paddingInline: "14px",
    backgroundColor: "white",
    color: $colors.primaryColor,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.primaryColor,
  },
});
