import * as stylex from "@stylexjs/stylex";
import { baseThemeVars } from "./function-theme.stylex";

const extendedTheme = stylex.createTheme(baseThemeVars, {
  colorsPrimary: "#4CAF50",
});

const styles = stylex.create({
  button: {
    padding: baseThemeVars.spacingMedium,
    backgroundColor: baseThemeVars.colorsPrimary,
    color: "white",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
  card: {
    padding: baseThemeVars.spacingMedium,
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: baseThemeVars.colorsSecondary,
    borderRadius: "8px",
  },
});

export const App = () => (
  <div>
    <div {...stylex.props(styles.card)}>
      <button {...stylex.props(styles.button)}>Base Theme</button>
    </div>
    <span {...stylex.props(extendedTheme)}>
      <div {...stylex.props(styles.card)}>
        <button {...stylex.props(styles.button)}>Extended Theme</button>
      </div>
    </span>
  </div>
);
