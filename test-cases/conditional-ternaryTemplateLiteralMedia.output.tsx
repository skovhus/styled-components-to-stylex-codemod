import * as React from "react";
import * as stylex from "@stylexjs/stylex";

type CardProps = React.PropsWithChildren<{
  compact: boolean;
}>;

export function Card(props: CardProps) {
  const { children, compact, ...rest } = props;

  return (
    <div {...rest} sx={[styles.card, compact ? styles.cardCompact : styles.cardNotCompact]}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Card compact>Compact Card</Card>
      <Card compact={false}>Regular Card</Card>
    </div>
  );
}

const styles = stylex.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "#ccc",
  },
  cardCompact: {
    padding: {
      default: 8,
      "@media (min-width: 768px)": 12,
    },
    fontSize: 12,
  },
  cardNotCompact: {
    padding: {
      default: 16,
      "@media (min-width: 768px)": 24,
    },
    fontSize: 14,
  },
});
