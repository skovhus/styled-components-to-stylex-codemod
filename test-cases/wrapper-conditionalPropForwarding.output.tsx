// styled(Component) with conditional styles - props used in conditions must still be forwarded
import * as React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

interface BaseProps {
  /** Label text to display */
  label: string;
  /** Whether to show in compact mode */
  compact?: boolean;
  /** Whether the item is highlighted */
  highlighted?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Base component that uses compact and highlighted props for its own rendering logic */
function BaseCard(props: BaseProps) {
  const { label, compact, highlighted, className, style } = props;
  return (
    <div className={className} style={style}>
      <span style={{ fontWeight: highlighted ? "bold" : "normal" }}>
        {compact ? label.slice(0, 3) : label}
      </span>
    </div>
  );
}

type CardProps = {
  compact?: boolean;
  highlighted?: boolean;
} & React.ComponentPropsWithRef<typeof BaseCard>;

/** Styled wrapper that adds conditional transform based on props, but the base component also needs those props */
export function Card(props: CardProps) {
  const { className, style, compact, highlighted, ...rest } = props;

  return (
    <BaseCard
      compact={compact}
      highlighted={highlighted}
      {...rest}
      {...mergedSx(
        [styles.card, compact && styles.cardCompact, highlighted && styles.cardHighlighted],
        className,
        style,
      )}
    />
  );
}

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Card label="Default" />
    <Card label="Compact" compact />
    <Card label="Highlighted" highlighted />
    <Card label="Both" compact highlighted />
  </div>
);

const styles = stylex.create({
  card: {
    backgroundColor: "#e0e0e0",
    padding: 12,
    minWidth: 80,
    minHeight: 40,
  },
  cardCompact: {
    transform: "scale(0.75)",
  },
  cardHighlighted: {
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "blue",
  },
});
