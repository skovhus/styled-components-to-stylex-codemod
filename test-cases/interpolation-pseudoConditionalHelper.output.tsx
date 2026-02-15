import React from "react";
import * as stylex from "@stylexjs/stylex";
import { Browser, highlightStyles } from "./lib/helpers";

/**
 * Interpolated pseudo-class selector with a helper function wrapper.
 * Same as `pseudoConditional`, but the adapter specifies a `helperFunction`
 * so the codemod emits `highlightStyles({ active: ..., hover: ... })`
 * instead of a raw ternary — enabling lint enforcement of style consistency.
 */
function Card(props: React.PropsWithChildren<{ ref?: React.Ref<HTMLDivElement> }>) {
  const { children } = props;

  return (
    <div
      {...stylex.props(
        styles.card,
        highlightStyles({
          active: styles.cardActive,
          hover: styles.cardHover,
        }),
      )}
    >
      {children}
    </div>
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Card>Helper Card</Card>
  </div>
);

const styles = stylex.create({
  card: {
    color: "blue",
    padding: "16px",
  },
  cardActive: {
    color: {
      default: null,
      ":active": "red",
    },
    backgroundColor: {
      default: null,
      ":active": "yellow",
    },
  },
  cardHover: {
    color: {
      default: null,
      ":hover": "red",
    },
    backgroundColor: {
      default: null,
      ":hover": "yellow",
    },
  },
});
