import type { DefaultTheme } from 'styled-components';

interface ThemedStyledProps {
  theme: DefaultTheme;
}

// Theme accessor helper - returns a function that extracts a color from the theme
export const color =
  (colorName: keyof DefaultTheme['colors']) =>
  (props: ThemedStyledProps) =>
    props.theme.colors[colorName];

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
