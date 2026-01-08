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
  iconButton: {
    padding: "0 2px",
    boxShadow: "none",
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

export function IconButton(props: IconButtonProps) {
  return <IconButtonInner {...props} {...stylex.props(styles.iconButton)} />;
}

// Bug 9: When generating wrapper function with props type,
// codemod must not create duplicate type identifier if one already exists.

// Pattern 1: styled.div<ExistingType> - type defined before styled component
/**
 * Card props
 */
export interface CardProps {
  /** Title of the card */
  title: string;
  /** Whether the card is highlighted */
  highlighted?: boolean;
}

// Pattern 2: styled(FunctionComponent) - from IconButton.tsx
// The function component has its own props type, then styled() wraps it
/** Props for IconButton. */
export type IconButtonProps = {
  /** Icon to display in the button. */
  children?: React.ReactNode;
  /** Aria label for the button. */
  "aria-label": string;
  /** Applies hover styles. */
  $hoverStyles?: boolean;
};

const IconButtonInner = (props: IconButtonProps) => {
  const { children, ...rest } = props;
  return <button {...rest}>{children}</button>;
};

// Usage shows both interface properties and HTML attributes are needed
export function App() {
  return (
    <>
      <Card title="My Card" highlighted className="custom-class" onClick={() => {}}>
        Card content
      </Card>
      <IconButton aria-label="Close" $hoverStyles>
        X
      </IconButton>
    </>
  );
}
