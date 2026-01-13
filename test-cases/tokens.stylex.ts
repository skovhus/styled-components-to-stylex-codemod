import * as stylex from "@stylexjs/stylex";

// Theme tokens for test cases
export const themeVars = stylex.defineVars({
  main: "#BF4F74",
  primaryColor: "#BF4F74",
  secondaryColor: "#4F74BF",
  labelBase: "#111827",
  labelMuted: "#6B7280",
  labelTitle: "#111827",
  bgBase: "#E0F2FE",
  bgSub: "#0284C7",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
});

/**
 * Plain JS theme for Storybook/styled-components fixtures.
 * Keep this as the source of truth for ThemeProvider values.
 */
export const testCaseTheme = {
  colors: {
    labelBase: "#111827",
    labelMuted: "#6B7280",
    labelTitle: "#111827",
    bgBase: "#E0F2FE",
    bgSub: "#0284C7",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    primaryColor: "#BF4F74",
  },
  primary: "#BF4F74",
  secondary: "#4F74BF",
  spacing: {
    small: "8px",
    medium: "16px",
  },
} as const;

export type TestCaseTheme = typeof testCaseTheme;
