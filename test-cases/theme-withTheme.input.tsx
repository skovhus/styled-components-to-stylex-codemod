import React from "react";
import styled, { ThemeProvider, withTheme } from "styled-components";

const theme = {
  color: {
    primaryColor: "#BF4F74",
  },
};

const Panel = styled.div`
  padding: 12px 16px;
  background-color: ${(props) => props.theme.color.primaryColor};
  color: white;
  border-radius: 8px;
`;

interface ThemeProps {
  theme: typeof theme;
}

class MyComponent extends React.Component<ThemeProps> {
  render() {
    return <div style={{ color: this.props.theme.color.primaryColor }}>Themed Component</div>;
  }
}

const ThemedComponent = withTheme(MyComponent);

export const App = () => (
  <ThemeProvider theme={theme}>
    <div style={{ display: "grid", gap: "12px", padding: "12px" }}>
      <Panel>Panel</Panel>
      <ThemedComponent />
    </div>
  </ThemeProvider>
);
