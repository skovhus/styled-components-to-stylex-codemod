import React from "react";
import * as stylex from "@stylexjs/stylex";
import { $colors } from "./tokens.stylex";

type ButtonProps = React.PropsWithChildren<{
  $primary?: boolean;
}>;

export function Button(props: ButtonProps) {
  const { children, $primary } = props;

  return (
    <button {...stylex.props(styles.button, $primary ? styles.buttonPrimary : undefined)}>
      {children}
    </button>
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

const styles = stylex.create({
  button: {
    paddingBlock: "8px",
    paddingInline: "16px",
    borderRadius: "4px",
    backgroundColor: $colors.bgBase,
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
