import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { ThemeProvider } from "styled-components";

const baseTheme = {
  color: {
    primaryColor: "#BF4F74",
    secondaryColor: "#4F74BF",
    bgBase: "#990000",
  },
};

export const App = () => (
  <ThemeProvider theme={baseTheme}>
    <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
      <div {...stylex.props(styles.card)}>
        <button {...stylex.props(styles.button)}>Base Theme</button>
      </div>
      {/* Function theme that extends parent theme */}
      <ThemeProvider
        theme={(parentTheme) => ({
          ...parentTheme,
          color: {
            ...parentTheme.color,
            primaryColor: "#22C55E",
          },
        })}
      >
        <div {...stylex.props(styles.card)}>
          <button {...stylex.props(styles.button)}>Extended Theme</button>
        </div>
      </ThemeProvider>
    </div>
  </ThemeProvider>
);

const styles = stylex.create({
  button: {
    paddingBlock: "12px",
    paddingInline: "16px",
    backgroundColor: $colors.primaryColor,
    color: "white",
    borderRadius: "4px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.secondaryColor,
  },
  card: {
    padding: "16px",
    backgroundColor: $colors.bgBase,
    borderRadius: "8px",
  },
});
