// Mixin with theme-dependent conditional argument
import styled from "styled-components";
import { truncateMultiline } from "./lib/helpers";

// Theme-dependent mixin: theme.isDark controls the argument to the helper
const ThemeText = styled.div`
  line-height: 1rem;
  ${({ theme }) => truncateMultiline(theme.isDark ? 1 : 2)};
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px" }}>
    <ThemeText>Theme-dependent truncation</ThemeText>
  </div>
);
