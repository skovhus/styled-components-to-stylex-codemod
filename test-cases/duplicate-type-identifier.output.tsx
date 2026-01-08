import * as stylex from "@stylexjs/stylex";
import * as React from "react";

const styles = stylex.create({
  card: {
    padding: "16px",
    backgroundColor: "white",
  },
  cardNotHighlighted: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "gray",
  },
  cardHighlighted: {
    borderWidth: "2px",
    borderStyle: "solid",
    borderColor: "blue",
  },
});

// The styled component uses the existing props interface
export function Card(props: React.PropsWithChildren<CardProps & { style?: React.CSSProperties }>) {
  const { children, style, highlighted, ...rest } = props;
  return (
    <div
      {...rest}
      {...stylex.props(
        styles.card,
        !highlighted && styles.cardNotHighlighted,
        highlighted && styles.cardHighlighted,
      )}
      style={style}
    >
      {children}
    </div>
  );
}

// Bug 9: When generating wrapper function with props type,
// codemod must not create duplicate type identifier if one already exists.

/**
 * Card props
 */
export interface CardProps {
  /** Title of the card */
  title: string;
  /** Whether the card is highlighted */
  highlighted?: boolean;
}

// Usage shows both interface properties and HTML attributes are needed
export function App() {
  return (
    <Card title="My Card" highlighted className="custom-class" onClick={() => {}}>
      Card content
    </Card>
  );
}
