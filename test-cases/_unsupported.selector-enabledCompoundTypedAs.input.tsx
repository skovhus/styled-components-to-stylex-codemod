// @expected-warning: Unsupported selector: compound pseudo selector
// :enabled normalization is unsafe when the public props type exposes polymorphic `as`.
import * as React from "react";
import styled from "styled-components";

type ButtonProps<C extends React.ElementType = "button"> = React.ComponentPropsWithRef<C> & {
  as?: C;
};

const Button = styled.button<ButtonProps>`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button type="button">Button</Button>
  </div>
);
