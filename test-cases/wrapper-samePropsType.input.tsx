// Test case for wrappers using the same props type name as the base component
import * as React from "react";
import styled from "styled-components";

// P1: Self-referential props issue
// When styled(Base)<Props> where Base also uses Props,
// this could create a circular reference type Props = Props & ...
type SharedProps = {
  column?: boolean;
  gap?: number;
};

// Base uses SharedProps
const Base = styled.div<SharedProps>`
  display: flex;
  flex-direction: ${(props) => (props.column ? "column" : "row")};
  gap: ${(props) => (props.gap ? `${props.gap}px` : "0")};
`;

// Wrapper ALSO uses SharedProps - must not create circular reference
export const Wrapper = styled(Base)<SharedProps>`
  padding: 8px;
`;

// P2: Type with parameters (tests that type arguments are preserved)
type GenericProps<T extends string> = {
  variant: T;
  size?: number;
};

// When wrapping with parameterized type, the type args must be preserved
export const Button = styled.button<GenericProps<"primary" | "secondary">>`
  background: ${(props) => (props.variant === "primary" ? "blue" : "gray")};
  font-size: ${(props) => (props.size ? `${props.size}px` : "14px")};
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
      <Wrapper column gap={8} style={{ backgroundColor: "#f0f0f0" }}>
        Wrapper with column and gap
      </Wrapper>
      <Button variant="primary" size={18} onClick={() => alert("clicked")}>
        Primary Button
      </Button>
      <Button variant="secondary">Secondary Button</Button>
    </div>
  );
}
