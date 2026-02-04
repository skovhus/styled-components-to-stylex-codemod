import React from "react";
import * as stylex from "@stylexjs/stylex";
import { mergedSx } from "./lib/mergedSx";

// Bug 7: When styled components are transformed, related type exports
// and component exports should be preserved properly.

export interface ButtonProps {
  variant?: "primary" | "secondary";
  size?: "small" | "large";
}

export type ButtonVariant = ButtonProps["variant"];

function Button(props: React.ComponentProps<"button"> & ButtonProps) {
  const { className, children, style, size, variant, ...rest } = props;

  return (
    <button
      {...rest}
      {...mergedSx(
        [
          styles.button,
          size === "large" && styles.buttonSizeLarge,
          variant === "primary" && styles.buttonVariantPrimary,
        ],
        className,
        style,
      )}
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
    paddingBlock: "8px",
    paddingInline: "16px",
    backgroundColor: "gray",
    color: "white",
  },
  buttonSizeLarge: {
    paddingBlock: "12px",
    paddingInline: "24px",
  },
  buttonVariantPrimary: {
    backgroundColor: "blue",
  },
});
