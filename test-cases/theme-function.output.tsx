import React from "react";
import * as stylex from "@stylexjs/stylex";
import { ThemeProvider } from "styled-components";
import { testCaseTheme, $colors } from "./tokens.stylex";

const baseTheme = testCaseTheme;

function Button(props: React.PropsWithChildren<{}>) {
  return <button {...stylex.props(styles.button)}>{props.children}</button>;
}

function Card(props: React.PropsWithChildren<{}>) {
  return <div {...stylex.props(styles.card)}>{props.children}</div>;
}

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

const styles = stylex.create({
  button: {
    paddingBlock: "12px",
    paddingInline: "16px",
    backgroundColor: $colors.primaryColor,
    color: "white",
    borderRadius: "4px",
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: $colors.bgBorderFaint,
  },
  card: {
    padding: "16px",
    backgroundColor: $colors.bgBase,
    borderRadius: "8px",
  },
});
