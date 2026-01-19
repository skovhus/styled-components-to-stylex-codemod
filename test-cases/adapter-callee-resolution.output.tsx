import React from "react";
import * as stylex from "@stylexjs/stylex";
import { fontWeightVars, fontSizeVars, transitionSpeed } from "./tokens.stylex";

export function Text({ children }: { children: React.ReactNode }) {
  return <span {...stylex.props(styles.styledText)}>{children}</span>;
}

export function Button({ children }: { children: React.ReactNode }) {
  return <button {...stylex.props(styles.styledButton)}>{children}</button>;
}

export const App = () => (
  <div>
    <Text>Hello World</Text>
    <Button>Click Me</Button>
  </div>
);

const styles = stylex.create({
  /**
   * Test case for adapter callee resolution.
   * The adapter should resolve these helper function calls to StyleX variables.
   */
  styledText: {
    fontWeight: fontWeightVars.medium,
    fontSize: fontSizeVars.medium,
    transition: `color ${transitionSpeed.fast}`,
  },
  styledButton: {
    fontWeight: fontWeightVars.bold,
    fontSize: fontSizeVars.small,
    transition: `background ${transitionSpeed.normal}`,
    padding: "8px 16px",
  },
});
