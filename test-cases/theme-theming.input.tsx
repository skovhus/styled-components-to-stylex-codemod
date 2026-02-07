import styled, { ThemeProvider } from "styled-components";

const Button = styled.button`
  font-size: 14px;
  margin: 0;
  padding: 8px 16px;
  border-radius: 6px;
  background-color: white;
  color: ${(props) => props.theme.main};
  border-width: 2px;
  border-style: solid;
  border-color: ${(props) => props.theme.main};
`;

Button.defaultProps = {
  theme: {
    main: "#BF4F74",
  },
};

const theme = {
  main: "mediumseagreen",
};

export const App = () => (
  <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
    <Button>Normal</Button>
    <ThemeProvider theme={theme}>
      <Button>Themed</Button>
    </ThemeProvider>
  </div>
);
