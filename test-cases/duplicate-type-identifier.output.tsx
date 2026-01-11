import * as stylex from "@stylexjs/stylex";
import * as React from "react";

// Bug 9: When generating wrapper function with props type,
// codemod must not create duplicate type identifier if one already exists.

// Pattern 1: styled.div<ExistingType> - type defined before styled component
/**
 * Card props
 */
export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "style"> {
  /** Title of the card */
  title: string;
  /** Whether the card is highlighted */
  highlighted?: boolean;
}

// The styled component uses the existing props interface
export function Card(props: CardProps) {
  const { className, children, highlighted, ...rest } = props;

  const sx = stylex.props(
    styles.card,
    !highlighted && styles.cardNotHighlighted,
    highlighted && styles.cardHighlighted,
  );
  return (
    <div {...sx} className={[sx.className, className].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
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

export function IconButton(props: IconButtonProps) {
  const { children, $hoverStyles, ...rest } = props;
  return (
    <IconButtonInner {...rest} {...stylex.props(styles.iconButton)}>
      {children}
    </IconButtonInner>
  );
}

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
