import React from "react";
import styled from "styled-components";

// Bug 7: When styled components are transformed, related type exports
// and component exports should be preserved properly.

export interface ButtonProps {
  variant?: "primary" | "secondary";
  size?: "small" | "large";
}

export type ButtonVariant = ButtonProps["variant"];

const Button = styled.button<ButtonProps>`
  padding: ${(props) => (props.size === "large" ? "12px 24px" : "8px 16px")};
  background: ${(props) => (props.variant === "primary" ? "blue" : "gray")};
  color: white;
`;

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
