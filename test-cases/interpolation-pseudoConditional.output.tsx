import React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";
import { TouchDeviceToggle } from "./lib/TouchDeviceToggle";

/**
 * Interpolated pseudo-class selector using a runtime variable.
 * `&:${highlight}` expands to `:active` and `:hover` pseudo style objects,
 * wrapped in `highlightStyles({ active: ..., hover: ... })` for runtime selection.
 */
function Button({ children }: { children?: React.ReactNode }) {
  return (
    <button
      sx={[
        highlightStyles<stylex.StyleXStyles<Record<string, {} | null>>>({
          active: styles.buttonPseudoActive,
          hover: styles.buttonPseudoHover,
        }),
        styles.button,
      ]}
    >
      {children}
    </button>
  );
}

/**
 * Same as Button but with `&&:${highlight}` specificity hack.
 * The `&&` should be stripped and the pseudo alias still applied.
 */
function SpecificButton({ children }: { children?: React.ReactNode }) {
  return (
    <button
      sx={[
        highlightStyles<stylex.StyleXStyles<Record<string, {} | null>>>({
          active: styles.specificButtonPseudoActive,
          hover: styles.specificButtonPseudoHover,
        }),
        styles.specificButton,
      ]}
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
    paddingBlock: 8,
    paddingInline: 16,
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
    paddingBlock: 8,
    paddingInline: 16,
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
