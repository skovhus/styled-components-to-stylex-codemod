import styled, { ThemeProvider } from "styled-components";
import { testCaseTheme } from "./tokens.stylex";

const baseTheme = testCaseTheme;

const Button = styled.button`
  padding: 12px 16px;
  background-color: ${(props) => props.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.color.bgBorderFaint};
`;

const Card = styled.div`
  padding: 16px;
  background-color: ${(props) => props.theme.color.bgBase};
  border-radius: 8px;
`;

export const App = () => (
  <ThemeProvider theme={baseTheme}>
    <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
      <Card>
        <Button>Base Theme</Button>
      </Card>
      {/* Function theme that extends parent theme */}
      <ThemeProvider
        theme={(parentTheme) => {
          const resolvedTheme = parentTheme ?? testCaseTheme;
          return {
            ...resolvedTheme,
            isDark: !resolvedTheme.isDark,
          };
        }}
      >
        <Card>
          <Button>Extended Theme</Button>
        </Card>
      </ThemeProvider>
    </div>
  </ThemeProvider>
);
