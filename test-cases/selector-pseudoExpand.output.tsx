// Pseudo-expand: merged pseudo style object with conditional hover wrapping
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";

function Button(props: React.PropsWithChildren<{}>) {
  return (
    <button {...stylex.props(styles.button, styles.buttonHighlightExpand)}>{props.children}</button>
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
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "#f0f0f0",
    color: "#333",
  },
  buttonHighlightExpand: {
    backgroundColor: {
      default: "#f0f0f0",
      ":active": "#e0e0e0",
      ":hover": {
        default: null,
        [$interaction.canHover]: "#e0e0e0",
      },
    },
    color: {
      default: "#333",
      ":active": "#111",
      ":hover": {
        default: null,
        [$interaction.canHover]: "#111",
      },
    },
  },
});
