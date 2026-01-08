import * as stylex from "@stylexjs/stylex";

// Theme tokens for test cases
export const themeVars = stylex.defineVars({
  main: "#BF4F74",
  primaryColor: "#BF4F74",
  secondaryColor: "#4F74BF",
  labelBase: "#111827",
  labelMuted: "#6B7280",
});

/**
 * Plain JS theme for Storybook/styled-components fixtures.
 * Keep this as the source of truth for ThemeProvider values.
 */
export const testCaseTheme = {
  colors: {
    labelBase: "#111827",
    labelMuted: "#6B7280",
    primaryColor: "#BF4F74",
  },
} as const;
