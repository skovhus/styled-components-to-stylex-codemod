// Pseudo-alias: separate pseudo style objects with runtime selector function
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";

function Button(props: React.PropsWithChildren<{}>) {
  return (
    <button
      sx={[
        styles.button,
        highlightStyles({
          active: styles.buttonPseudoActive,
          hover: styles.buttonPseudoHover,
        }),
      ]}
    >
      {props.children}
    </button>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Button>Default</Button>
      <Button>Hover me</Button>
    </div>
  );
}

const styles = stylex.create({
  button: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#f0f0f0",
    color: "#333",
  },
  buttonPseudoActive: {
    backgroundColor: {
      default: "#f0f0f0",
      ":active": "#e0e0e0",
    },
    color: {
      default: "#333",
      ":active": "#111",
    },
  },
  buttonPseudoHover: {
    backgroundColor: {
      default: "#f0f0f0",
      ":hover": "#e0e0e0",
    },
    color: {
      default: "#333",
      ":hover": "#111",
    },
  },
});
