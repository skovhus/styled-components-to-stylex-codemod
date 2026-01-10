import * as stylex from "@stylexjs/stylex";
import React from "react";

// Bug 7: When styled components are transformed, related type exports
// and component exports should be preserved properly.

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: "primary" | "secondary";
  size?: "small" | "large";
}

export type ButtonVariant = ButtonProps["variant"];

function Button(props: ButtonProps) {
  const { className, children, style, size, variant, ...rest } = props;

  const sx = stylex.props(
    styles.button,
    size === "large" && styles.buttonSizeLarge,
    variant === "primary" && styles.buttonVariantPrimary,
  );
  return (
    <button
      {...sx}
      className={[sx.className, className].filter(Boolean).join(" ")}
      style={{
        ...sx.style,
        ...style,
      }}
      {...rest}
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
