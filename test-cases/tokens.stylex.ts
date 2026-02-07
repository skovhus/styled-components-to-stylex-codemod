import * as stylex from "@stylexjs/stylex";

// Theme tokens for test cases
export const $colors = stylex.defineVars({
  main: "#BF4F74",
  primaryColor: "#BF4F74",
  secondaryColor: "#4F74BF",
  labelBase: "#111827",
  labelMuted: "#6B7280",
  labelTitle: "#111827",
  greenBase: "#22C55E",
  bgBase: "#990000",
  bgBaseHover: "#BAE6FD",
  bgBorderFaint: "#7DD3FC",
  bgFocus: "#60A5FA",
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
    greenBase: "#22C55E",
    bgBase: "#990000",
    bgBaseHover: "#BAE6FD",
    bgBorderFaint: "#7DD3FC",
    bgFocus: "#60A5FA",
    bgSub: "#009900",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    primaryColor: "#BF4F74",
  },
  /** Returns a highlighted (lighter) variant of a hex color for dark themes. */
  highlightVariant(color: string): string {
    const hex = color.replace("#", "");
    const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + 40);
    const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + 40);
    const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + 40);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
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
  isDark: true as boolean,
  mode: "light" as "light" | "dark",
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
  popover: "900",
});

export const $config = stylex.defineVars({
  "ui.spacing.small": "4px",
  "ui.spacing.medium": "8px",
  "ui.spacing.large": "16px",
});
