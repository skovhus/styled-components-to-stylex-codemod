import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CardProps = React.PropsWithChildren<{
  compact: boolean;
}>;

/**
 * Tests that static CSS blocks (no interpolations) inside conditional
 * expressions correctly handle @media rules instead of silently dropping them.
 * Exercises the `resolveStaticCssBlock` code path.
 */
function Card(props: CardProps) {
  const { children, compact } = props;

  return <div sx={[styles.card, compact ? styles.cardCompact : undefined]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Card compact={false}>Default Card</Card>
    <Card compact={true}>Compact Card</Card>
  </div>
);

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "white",
  },
  cardCompact: {
    padding: {
      default: "8px",
      "@media (min-width: 768px)": "12px",
    },
    fontSize: {
      default: "12px",
      "@media (min-width: 768px)": "14px",
    },
  },
});
