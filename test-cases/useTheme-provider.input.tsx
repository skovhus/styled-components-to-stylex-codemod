import styled, { ThemeProvider, useTheme } from "styled-components";

const theme = {
  color: {
    primaryColor: "#BF4F74",
    secondaryColor: "#4F74BF",
  },
};

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
    <div style={{ color: theme.color.secondaryColor }}>Primary: {theme.color.primaryColor}</div>
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
