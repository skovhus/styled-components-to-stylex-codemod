import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` picks between `:hover` and `:active` based on device capability.
 * The adapter resolves this to a `pseudoConditional` result, generating two style
 * objects (one per pseudo) with a JS ternary in `stylex.props(...)`.
 */
function Button(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLButtonElement> }>) {
  const { children } = props;

  return (
    <button
      {...stylex.props(
        styles.button,
        Browser.isTouchDevice ? styles.buttonActive : styles.buttonHover,
      )}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <TouchDeviceToggle>{() => <Button>Highlight Button</Button>}</TouchDeviceToggle>
);

const styles = stylex.create({
  button: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  buttonActive: {
    color: {
      default: "blue",
      ":active": "red",
    },
    backgroundColor: {
      default: null,
      ":active": "yellow",
    },
  },
  buttonHover: {
    color: {
      default: "blue",
      ":hover": "red",
    },
    backgroundColor: {
      default: null,
      ":hover": "yellow",
    },
  },
});
