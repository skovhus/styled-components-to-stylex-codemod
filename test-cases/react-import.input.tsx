import styled from "styled-components";

// Bug 11: When the original file has no React import (relying on JSX transform),
// the codemod generates a wrapper function with JSX but forgets to add React import.
// This causes: "'React' refers to a UMD global, but the current file is a module"

// This component uses JSX but has no explicit React import
// (modern JSX transform doesn't require it for styled-components)
export const Card = styled.div`
  padding: 16px;
  background: white;
`;

// Another component to ensure multiple components work
export const Button = styled.button`
  padding: 8px 16px;
  background: blue;
  color: white;
`;

// Pattern 2: Component with theme access (like TextColor.tsx in a design system)
// Uses props.theme.color which the adapter resolves to themeVars
interface ThemeSpanProps {
  variant: "labelBase" | "labelMuted" | "labelTitle";
}

export const ThemeSpan = styled.span<ThemeSpanProps>`
  color: ${(props) => props.theme.color[props.variant]};
`;

export function App() {
  return null;
}
