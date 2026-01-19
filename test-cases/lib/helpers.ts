import type { DefaultTheme } from "styled-components";

interface ThemedStyledProps {
  theme: DefaultTheme;
}

// Theme accessor helper - returns a function that extracts a color from the theme
export const color =
  (colorName: string) =>
  (props: ThemedStyledProps): string =>
    // Theme colors in fixtures are a fixed-key object; allow dynamic access in helpers.
    (props.theme.colors as Record<string, string> | undefined)?.[colorName] ?? "";

// CSS snippet helper - returns a CSS string for text truncation
export const truncate = () => `
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

// Another CSS snippet helper - flexible centering
export const flexCenter = () => `
  display: flex;
  align-items: center;
  justify-content: center;
`;

type Speed = "normal" | "slow" | "fast";

export const transitionSpeed = (speed: Speed) => `var(--speed-${speed})`;

// Font weight helper - returns numeric font weights
export const fontWeight = (weight: "normal" | "medium" | "bold") => {
  const weights = { normal: 400, medium: 500, bold: 600 };
  return weights[weight];
};

// Font size helper - returns size strings
export const fontSize = (size: "small" | "medium" | "large") => {
  const sizes = { small: "12px", medium: "14px", large: "16px" };
  return sizes[size];
};

// Type used in callbacks - should not be stripped from imports
export type SelectionFunction = (options: { rowIndex: number }) => void;

// Pattern 5: Types imported together where some are used in styled component props
// and others are ONLY used in generic parameters like React.useRef<T>

/** Props used in styled component */
export interface TooltipBaseProps {
  title?: string;
  position?: "top" | "bottom" | "left" | "right";
}

/** Type ONLY used in React.useRef<T> - must NOT be stripped */
export type TriggerHandlers = {
  handleFocus?: (event: FocusEvent) => void;
  handleClick?: (event: MouseEvent) => void;
};
