// Pseudo-expand where some CSS properties only exist in the conditional block, not in base styles
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { $interaction } from "./lib/interaction.stylex";

type CardProps = React.PropsWithChildren<{
  interactive?: boolean;
}>;

function Card(props: CardProps) {
  const { children, interactive } = props;
  return <div sx={[styles.card, interactive && styles.cardInteractive]}>{children}</div>;
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div sx={styles.box}>Mixed: base + condition-only</div>
      <Card interactive>Prop-gated condition-only</Card>
    </div>
  );
}

const styles = stylex.create({
  box: {
    padding: 8,
    backgroundColor: {
      default: "#f0f0f0",
      ":active": "#e0e0e0",
      ":hover": {
        default: "#f0f0f0",
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
  card: {
    padding: 12,
  },
  cardInteractive: {
    cursor: "pointer",
    backgroundColor: {
      default: null,
      ":active": "#e0f2fe",
      ":hover": {
        default: null,
        [$interaction.canHover]: "#e0f2fe",
      },
    },
  },
});
