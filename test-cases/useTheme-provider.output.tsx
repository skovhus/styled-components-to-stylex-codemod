import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { ThemeProvider, useTheme } from "styled-components";

const theme = {
  color: {
    primaryColor: "#BF4F74",
    secondaryColor: "#4F74BF",
  },
};

const ThemeInfo = () => {
  const theme = useTheme();
  return (
    <div style={{ color: theme.color.secondaryColor }}>Primary: {theme.color.primaryColor}</div>
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
