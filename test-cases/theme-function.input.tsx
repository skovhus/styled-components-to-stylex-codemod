import styled, { ThemeProvider } from "styled-components";

const baseTheme = {
  color: {
    primaryColor: "#BF4F74",
    secondaryColor: "#4F74BF",
    bgBase: "#990000",
  },
};

const Button = styled.button`
  padding: 12px 16px;
  background-color: ${(props) => props.theme.color.primaryColor};
  color: white;
  border-radius: 4px;
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.color.secondaryColor};
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
        theme={(parentTheme) => ({
          ...parentTheme,
          color: {
            ...parentTheme.color,
            primaryColor: "#22C55E",
          },
        })}
      >
        <Card>
          <Button>Extended Theme</Button>
        </Card>
      </ThemeProvider>
    </div>
  </ThemeProvider>
);
