// @expected-warning: Unsupported selector: compound pseudo selector
// React.createElement can pass as to a styled button and render it as a non-form target.
import * as React from "react";
import styled from "styled-components";

const Button = styled.button`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button type="button">Button</Button>
    {React.createElement(Button, { as: "a", href: "#" }, "Link")}
  </div>
);
