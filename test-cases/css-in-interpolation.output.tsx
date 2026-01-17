import React from "react";
import * as stylex from "@stylexjs/stylex";
import { themeVars } from "./tokens.stylex";

type ButtonProps = React.PropsWithChildren<{
  $primary?: boolean;
}>;

export function Button(props: ButtonProps) {
  const { children, $primary } = props;
  return (
    <button {...stylex.props(styles.button, $primary && styles.buttonPrimary)}>{children}</button>
  );
}

export function App() {
  return (
    <div>
      <Button>Normal</Button>
      <Button $primary>Primary</Button>
    </div>
  );
}

// Bug 3b: css helper used inside styled component interpolations
// should be transformed into conditional StyleX styles.
// The `css` import must be removed and the css`` blocks transformed.

const styles = stylex.create({
  button: {
    padding: "8px 16px",
    borderRadius: "4px",
    backgroundColor: themeVars.bgBase,
    color: "black",
  },
  buttonPrimary: {
    backgroundColor: "blue",
    color: "white",
    "::after": {
      content: '""',
      position: "absolute",
      inset: "0 4px",
      backgroundColor: "hotpink",
      zIndex: -1,
      borderRadius: "6px",
    },
  },
});
