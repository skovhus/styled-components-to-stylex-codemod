import React from "react";
import * as stylex from "@stylexjs/stylex";

// Bug: When styled() wraps a component with strict props that accept className/style
// but NOT arbitrary attributes like data-style-src, the transformed stylex.props() spread
// fails because it includes data-style-src which the component doesn't accept.

interface LoadingProps {
  className?: string;
  style?: React.CSSProperties;
  size?: "small" | "medium" | "large";
}

// Component with strict props - does NOT accept arbitrary HTML attributes
function Loading({ className, style, size = "medium" }: LoadingProps) {
  return (
    <div className={className} style={style}>
      <div className={`spinner spinner-${size}`}>Loading...</div>
    </div>
  );
}

interface ButtonProps {
  className?: string;
  style?: React.CSSProperties;
  variant?: "primary" | "secondary";
  children?: React.ReactNode;
  onClick?: () => void;
}

// Another strict component
function Button({ className, style, variant = "primary", children, onClick }: ButtonProps) {
  return (
    <button className={className} style={style} onClick={onClick} data-variant={variant}>
      {children}
    </button>
  );
}

function StyledLoading(
  props: Omit<React.ComponentPropsWithRef<typeof Loading>, "className" | "style">,
) {
  return <Loading {...props} {...stylex.props(styles.loading)} />;
}

function StyledButton(
  props: Omit<React.ComponentPropsWithRef<typeof Button>, "className" | "style">,
) {
  return <Button {...props} {...stylex.props(styles.button)} />;
}

export const App = () => (
  <div>
    <StyledLoading size="large" />
    <StyledButton variant="primary" onClick={() => console.log("clicked")}>
      Click me
    </StyledButton>
  </div>
);

const styles = stylex.create({
  loading: {
    padding: "20px",
    backgroundColor: "#f0f0f0",
    borderRadius: "8px",
  },
  button: {
    paddingBlock: "10px",
    paddingInline: "20px",
    fontWeight: "bold",
    color: "white",
    backgroundColor: "#007bff",
    borderWidth: 0,
    borderStyle: "none",
    borderRadius: "4px",
  },
});
