import styled, { ThemeProvider, useTheme } from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

const theme = testCaseTheme;

const Button = styled.button`
  padding: 10px 14px;
  background-color: white;
  color: ${(props) => props.theme.color.primaryColor};
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.color.primaryColor};
`;

const ThemeInfo = () => {
  const theme = useTheme();
  return (
    <div style={{ color: theme.color.textSecondary }}>Primary: {theme.color.primaryColor}</div>
  );
};

export const App = () => (
  <ThemeProvider theme={theme}>
    <div style={{ display: "grid", gap: "8px", padding: "12px" }}>
      <Button>Themed Button</Button>
      <ThemeInfo />
    </div>
  </ThemeProvider>
);
