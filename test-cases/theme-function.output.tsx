import * as stylex from "@stylexjs/stylex";
import { ThemeProvider } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

const baseTheme = testCaseTheme;

export const App = () => (
  <ThemeProvider theme={baseTheme}>
    <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
      <div {...stylex.props(styles.card)}>
        <button {...stylex.props(styles.button)}>Base Theme</button>
      </div>
      {/* Function theme that extends parent theme */}
      <ThemeProvider
        theme={(parentTheme) => {
          const resolvedTheme = parentTheme ?? testCaseTheme;
          return {
            ...resolvedTheme,
            isDark: !resolvedTheme.isDark,
          };
        }}
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
    borderColor: $colors.bgBorderFaint,
  },
  card: {
    padding: "16px",
    backgroundColor: $colors.bgBase,
    borderRadius: "8px",
  },
});
