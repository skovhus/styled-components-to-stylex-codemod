// Pseudo-alias: separate pseudo style objects with runtime selector function
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { highlightStyles } from "./lib/helpers";

function Button({ children }: { children?: React.ReactNode }) {
  return (
    <button
      sx={[
        highlightStyles({
          active: styles.buttonPseudoActive as unknown as stylex.StyleXStyles,
          hover: styles.buttonPseudoHover as unknown as stylex.StyleXStyles,
        }),
        styles.button,
      ]}
    >
      {children}
    </button>
  );
}

function ResetButton({ children }: { children?: React.ReactNode }) {
  return (
    <button
      sx={[
        highlightStyles({
          active: styles.resetButtonPseudoActive as unknown as stylex.StyleXStyles,
          hover: styles.resetButtonPseudoHover as unknown as stylex.StyleXStyles,
        }),
        styles.resetButton,
      ]}
    >
      {children}
    </button>
  );
}

type HighlightCardProps = { interactive?: boolean } & Omit<
  React.ComponentProps<"div">,
  "className" | "style" | "sx"
>;

function HighlightCard(props: HighlightCardProps) {
  const { children, interactive } = props;
  return (
    <div
      sx={[
        interactive
          ? highlightStyles({
              active: styles.highlightCardInteractivePseudoActive as unknown as stylex.StyleXStyles,
              hover: styles.highlightCardInteractivePseudoHover as unknown as stylex.StyleXStyles,
            })
          : undefined,
        styles.highlightCard,
        interactive ? styles.highlightCardInteractiveRoot : undefined,
      ]}
    >
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Button>Default</Button>
      <Button>Hover me</Button>
      <ResetButton>Reset background</ResetButton>
      <HighlightCard interactive>Interactive card</HighlightCard>
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
  resetButton: {
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: "#f8c8dc",
    color: "#333",
  },
  resetButtonPseudoActive: {
    backgroundImage: {
      default: null,
      ":active": "none",
    },
    backgroundColor: {
      default: "#f8c8dc",
      ":active": "transparent",
    },
    color: {
      default: "#333",
      ":active": "#111",
    },
  },
  resetButtonPseudoHover: {
    backgroundImage: {
      default: null,
      ":hover": "none",
    },
    backgroundColor: {
      default: "#f8c8dc",
      ":hover": "transparent",
    },
    color: {
      default: "#333",
      ":hover": "#111",
    },
  },
  highlightCard: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: "#f8fafc",
  },
  highlightCardInteractiveRoot: {
    cursor: "pointer",
  },
  highlightCardInteractivePseudoActive: {
    backgroundColor: {
      ":active": "#e0f2fe",
    },
  },
  highlightCardInteractivePseudoHover: {
    backgroundColor: {
      ":hover": "#e0f2fe",
    },
  },
});
