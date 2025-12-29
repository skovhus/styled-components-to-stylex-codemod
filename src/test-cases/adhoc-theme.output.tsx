import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./adhoc-theme.stylex";

const greenTheme = stylex.createTheme(themeVars, {
  main: "#4CAF50",
  secondary: "#2E7D32",
});

const blueTheme = stylex.createTheme(themeVars, {
  main: "#2196F3",
  secondary: "#1565C0",
});

const styles = stylex.create({
  button: {
    padding: "8px 16px",
    backgroundColor: themeVars.main,
    color: "white",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: themeVars.secondary,
    borderRadius: "4px",
  },
});

export const App = () => (
  <div>
    <button {...stylex.props(styles.button)}>Default Theme</button>
    <span {...stylex.props(greenTheme)}>
      <button {...stylex.props(styles.button)}>Green Override</button>
    </span>
    <span {...stylex.props(blueTheme)}>
      <button {...stylex.props(styles.button)}>Blue Override</button>
    </span>
  </div>
);
