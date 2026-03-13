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

  return <div sx={[styles.card, compact && styles.cardCompact]}>{children}</div>;
}

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Card compact={false}>Default Card</Card>
    <Card compact={true}>Compact Card</Card>
  </div>
);

const styles = stylex.create({
  card: {
    padding: 16,
    backgroundColor: "white",
  },
  cardCompact: {
    padding: {
      default: 8,
      "@media (min-width: 768px)": 12,
    },
    fontSize: {
      default: 12,
      "@media (min-width: 768px)": 14,
    },
  },
});
