import * as stylex from "@stylexjs/stylex";

// Theme tokens for test cases
export const themeVars = stylex.defineVars({
  main: "#BF4F74",
  primaryColor: "#BF4F74",
  secondaryColor: "#4F74BF",
  labelBase: "#111827",
  labelMuted: "#6B7280",
  labelTitle: "#111827",
  bgBase: "#990000",
  bgBaseHover: "#BAE6FD",
  bgBorderFaint: "#7DD3FC",
  bgSub: "#009900",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
});

/**
 * Plain JS theme for Storybook/styled-components fixtures.
 * Keep this as the source of truth for ThemeProvider values.
 */
export const testCaseTheme = {
  color: {
    labelBase: "#111827",
    labelMuted: "#6B7280",
    labelTitle: "#111827",
    bgBase: "#990000",
    bgBaseHover: "#BAE6FD",
    bgBorderFaint: "#7DD3FC",
    bgSub: "#009900",
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
  $someKey: {
    anotherKey: {
      background: "#E0F2FE",
    },
  },
} as const;

export type TestCaseTheme = typeof testCaseTheme;

export type ThemeColor = keyof typeof testCaseTheme.color;

export const transitionSpeed = stylex.defineVars({
  slow: "1s",
  normal: "0.25s",
  fast: "0.1s",
});

// Font weight variables
export const fontWeightVars = stylex.defineVars({
  normal: "400",
  medium: "500",
  bold: "600",
});

// Font size variables
export const fontSizeVars = stylex.defineVars({
  small: "12px",
  medium: "14px",
  large: "16px",
});

export const pixelVars = stylex.defineVars({
  thin: "0.5px",
});

export const $zIndex = stylex.defineVars({
  modal: "1000",
});
