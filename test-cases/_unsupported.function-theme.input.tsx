import styled, { ThemeProvider } from "styled-components";

const baseTheme = {
  colors: {
    primary: "#BF4F74",
    secondary: "#4F74BF",
  },
  spacing: {
    small: "8px",
    medium: "16px",
  },
};

const Button = styled.button`
  padding: ${(props) => props.theme.spacing.medium};
  background: ${(props) => props.theme.colors.primary};
  color: white;
  border: none;
  border-radius: 4px;
`;

const Card = styled.div`
  padding: ${(props) => props.theme.spacing.medium};
  border: 2px solid ${(props) => props.theme.colors.secondary};
  border-radius: 8px;
`;

export const App = () => (
  <ThemeProvider theme={baseTheme}>
    <Card>
      <Button>Base Theme</Button>
    </Card>
    {/* Function theme that extends parent theme */}
    <ThemeProvider
      theme={(parentTheme) => ({
        ...parentTheme,
        colors: {
          ...parentTheme.colors,
          primary: "#4CAF50",
        },
      })}
    >
      <Card>
        <Button>Extended Theme</Button>
      </Card>
    </ThemeProvider>
  </ThemeProvider>
);
