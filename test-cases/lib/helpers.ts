import type { DefaultTheme } from "styled-components";

interface ThemedStyledProps {
  theme: DefaultTheme;
}

// Theme accessor helper - returns a function that extracts a color from the theme
export const color =
  (colorName: string) =>
  (props: ThemedStyledProps): string =>
    props.theme.colors?.[colorName] ?? "";

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

export const transitionSpeed = (
  speed:
    | "highlightFadeIn"
    | "highlightFadeOut"
    | "quickTransition"
    | "regularTransition"
    | "slowTransition",
) => `var(--speed-${speed})`;

// Type used in callbacks - should not be stripped from imports
export type SelectionFunction = (options: { rowIndex: number }) => void;
