import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";
import { ThemeProvider, withTheme } from "styled-components";

const theme = {
  color: {
    primaryColor: "#BF4F74",
  },
};

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
      <div {...stylex.props(styles.panel)}>Panel</div>
      <ThemedComponent />
    </div>
  </ThemeProvider>
);

const styles = stylex.create({
  panel: {
    paddingBlock: "12px",
    paddingInline: "16px",
    backgroundColor: $colors.primaryColor,
    color: "white",
    borderRadius: "8px",
  },
});
