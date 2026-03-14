// Mixin with theme-dependent conditional argument
import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// Dotted theme access: theme.isDark controls the argument
const ThemeText = styled.div`
  line-height: 1rem;
  ${({ theme }) => truncateMultiline(theme.isDark ? 1 : 2)};
`;

// Bare theme truthiness check (theme object as condition)
const ThemeTruthyText = styled.div`
  line-height: 1rem;
  ${({ theme }) => truncateMultiline(theme ? 1 : 2)};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <ThemeText>Dotted theme condition</ThemeText>
    <ThemeTruthyText>Bare theme condition</ThemeTruthyText>
  </div>
);
