import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 7: When styled components are transformed, related type exports
// and component exports should be preserved properly.

export interface ButtonProps {
  variant?: "primary" | "secondary";
  size?: "small" | "large";
}

export type ButtonVariant = ButtonProps["variant"];

const styles = stylex.create({
  button: {
    padding: "8px 16px",
    backgroundColor: "gray",
    color: "white",
  },
  buttonSizeLarge: {
    padding: "12px 24px",
  },
  buttonVariantPrimary: {
    backgroundColor: "blue",
  },
});

function Button(props: React.PropsWithChildren<ButtonProps & { style?: React.CSSProperties }>) {
  const { children, style, size, variant, ...rest } = props;
  return (
    <button
      {...rest}
      {...stylex.props(
        styles.button,
        size === "large" && styles.buttonSizeLarge,
        variant === "primary" && styles.buttonVariantPrimary,
      )}
      style={style}
    >
      {children}
    </button>
  );
}

// This is a re-export pattern that should be preserved
export { Button };

// The ButtonProps type should still be usable after transformation
export function createButton(props: ButtonProps) {
  return <Button {...props}>Click me</Button>;
}

export function App() {
  return (
    <Button variant="primary" size="large">
      Primary Button
    </Button>
  );
}
