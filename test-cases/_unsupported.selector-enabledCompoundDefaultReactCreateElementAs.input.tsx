// @expected-warning: Unsupported selector: compound pseudo selector
// Default React imports can pass as through createElement and render a styled button as a non-form target.
import React from "react";
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
