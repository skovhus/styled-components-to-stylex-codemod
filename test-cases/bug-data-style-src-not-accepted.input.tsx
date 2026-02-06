import React from "react";
import styled from "styled-components";

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

const StyledLoading = styled(Loading)`
  padding: 20px;
  background-color: #f0f0f0;
  border-radius: 8px;
`;

const StyledButton = styled(Button)`
  padding: 10px 20px;
  font-weight: bold;
  color: white;
  background-color: #007bff;
  border: none;
  border-radius: 4px;
`;

export const App = () => (
  <div>
    <StyledLoading size="large" />
    <StyledButton variant="primary" onClick={() => console.log("clicked")}>
      Click me
    </StyledButton>
  </div>
);
