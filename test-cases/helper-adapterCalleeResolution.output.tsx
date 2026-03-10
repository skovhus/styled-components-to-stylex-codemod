import React from "react";
import * as stylex from "@stylexjs/stylex";
import { fontWeightVars, fontSizeVars, transitionSpeed } from "./tokens.stylex";

export function Text({ children }: { children: React.ReactNode }) {
  return <span sx={styles.text}>{children}</span>;
}

export function Button({ children }: { children: React.ReactNode }) {
  return <button sx={styles.button}>{children}</button>;
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
  text: {
    fontWeight: fontWeightVars.medium,
    fontSize: fontSizeVars.medium,
    transition: `color ${transitionSpeed.fast}`,
  },
  button: {
    fontWeight: fontWeightVars.bold,
    fontSize: fontSizeVars.small,
    transition: `background ${transitionSpeed.normal}`,
    paddingBlock: "8px",
    paddingInline: "16px",
  },
});
