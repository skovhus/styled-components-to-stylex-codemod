import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThemeProvider, withTheme } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

const theme = testCaseTheme;

interface ThemeProps {
  theme?: typeof theme;
}

class MyComponent extends React.Component<ThemeProps> {
  render() {
    const resolvedTheme = this.props.theme ?? theme;
    return <div style={{ color: resolvedTheme.color.primaryColor }}>Themed Component</div>;
  }
}

const ThemedComponent = withTheme(MyComponent);

export const App = () => (
  <ThemeProvider theme={theme}>
    <div style={{ display: "grid", gap: "12px", padding: "12px" }}>
      <div sx={styles.panel}>Panel</div>
      <ThemedComponent />
    </div>
  </ThemeProvider>
);

const styles = stylex.create({
  panel: {
    paddingBlock: 12,
    paddingInline: 16,
    backgroundColor: $colors.primaryColor,
    color: "white",
    borderRadius: 8,
  },
});
