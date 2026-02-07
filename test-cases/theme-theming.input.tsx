import styled, { ThemeProvider } from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

const Button = styled.button`
  font-size: 14px;
  margin: 0;
  padding: 8px 16px;
  border-radius: 6px;
  background-color: white;
  color: ${(props) => props.theme.color.primaryColor};
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.color.primaryColor};
`;

Button.defaultProps = {
  theme: testCaseTheme,
};

const theme = testCaseTheme;

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Button>Normal</Button>
    <ThemeProvider theme={theme}>
      <Button>Themed</Button>
    </ThemeProvider>
  </div>
);
