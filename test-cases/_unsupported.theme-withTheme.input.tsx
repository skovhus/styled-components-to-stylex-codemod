// @expected-warning: ThemeProvider conversion needs to be handled manually
import React from "react";
import { ThemeProvider, withTheme } from "styled-components";

const theme = {
  colors: {
    primary: "#BF4F74",
  },
};

interface ThemeProps {
  theme: typeof theme;
}

class MyComponent extends React.Component<ThemeProps> {
  render() {
    return <div style={{ color: this.props.theme.color.primary }}>Themed Component</div>;
  }
}

const ThemedComponent = withTheme(MyComponent);

export const App = () => (
  <ThemeProvider theme={theme}>
    <ThemedComponent />
  </ThemeProvider>
);
