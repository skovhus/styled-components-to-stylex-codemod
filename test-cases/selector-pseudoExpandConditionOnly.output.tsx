// Pseudo-expand where some CSS properties only exist in the conditional block, not in base styles
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div sx={[styles.box, styles.boxHighlightExpand]}>Mixed: base + condition-only</div>
    </div>
  );
}

const styles = stylex.create({
  box: {
    padding: "8px",
    backgroundColor: "#f0f0f0",
  },
  boxHighlightExpand: {
    backgroundColor: {
      default: "#f0f0f0",
      ":active": "#e0e0e0",
      ":hover": {
        default: null,
        [$interaction.canHover]: "#e0e0e0",
      },
    },
    opacity: {
      default: null,
      ":active": 0.9,
      ":hover": {
        default: null,
        [$interaction.canHover]: 0.9,
      },
    },
    transform: {
      default: null,
      ":active": "scale(1.02)",
      ":hover": {
        default: null,
        [$interaction.canHover]: "scale(1.02)",
      },
    },
  },
});
