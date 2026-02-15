import React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` expands to `:active` and `:hover` pseudo style objects,
 * wrapped in `highlightStyles({ active: ..., hover: ... })` for runtime selection.
 */
function Button(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLButtonElement> }>) {
  const { children } = props;

  return (
    <button
      {...stylex.props(
        styles.button,
        highlightStyles({
          active: styles.buttonActive,
          hover: styles.buttonHover,
        }),
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
