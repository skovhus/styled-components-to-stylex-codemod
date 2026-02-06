import * as React from "react";
import styled from "styled-components";

interface TextProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

/** A polymorphic Text component that accepts "as" prop */
function Text(props: TextProps & { as?: React.ElementType }) {
  const { as: Component = "span", children, className, style } = props;
  return (
    <Component className={className} style={style}>
      {children}
    </Component>
  );
}

// B has .attrs({ as: "button" }) but is only used as a base for A.
// The chain-flattening logic must NOT flatten A to Text, because
// B's wrapper semantics (as="button") would be lost.
const StyledButton = styled(Text).attrs({ as: "button" })`
  cursor: pointer;
`;

// A extends B - this MUST preserve B's as="button" semantics
export const ClickableText = styled(StyledButton)`
  color: blue;
`;

export const App = () => (
  <div>
    <ClickableText>Click me</ClickableText>
  </div>
);
