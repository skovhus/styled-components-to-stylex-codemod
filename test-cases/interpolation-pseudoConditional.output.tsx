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
          active: styles.buttonPseudoActive,
          hover: styles.buttonPseudoHover,
        }),
      )}
    >
      {children}
    </button>
  );
}

/**
 * Same as Button but with `&&:${highlight}` specificity hack.
 * The `&&` should be stripped and the pseudo alias still applied.
 */
function SpecificButton(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLButtonElement> }>) {
  const { children } = props;

  return (
    <button
      {...stylex.props(
        styles.specificButton,
        highlightStyles({
          active: styles.specificButtonPseudoActive,
          hover: styles.specificButtonPseudoHover,
        }),
      )}
    >
      {children}
    </button>
  );
}

export const App = () => (
  <TouchDeviceToggle>
    {() => (
      <div style={{ display: "flex", gap: "16px", padding: "16px" }}>
        <Button>Highlight Button</Button>
        <SpecificButton>Specific Button</SpecificButton>
      </div>
    )}
  </TouchDeviceToggle>
);

const styles = stylex.create({
  button: {
    color: "blue",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  buttonPseudoActive: {
    color: {
      default: "blue",
      ":active": "red",
    },
    backgroundColor: {
      default: null,
      ":active": "yellow",
    },
  },
  buttonPseudoHover: {
    color: {
      default: "blue",
      ":hover": "red",
    },
    backgroundColor: {
      default: null,
      ":hover": "yellow",
    },
  },
  specificButton: {
    color: "green",
    paddingBlock: "8px",
    paddingInline: "16px",
  },
  specificButtonPseudoActive: {
    color: {
      default: "green",
      ":active": "purple",
    },
    backgroundColor: {
      default: null,
      ":active": "orange",
    },
  },
  specificButtonPseudoHover: {
    color: {
      default: "green",
      ":hover": "purple",
    },
    backgroundColor: {
      default: null,
      ":hover": "orange",
    },
  },
});
