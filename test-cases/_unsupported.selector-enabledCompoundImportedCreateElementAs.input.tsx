// @expected-warning: Unsupported selector: compound pseudo selector
// Imported createElement can pass as to a styled button and render it as a non-form target.
import { createElement } from "react";
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
    {createElement(Button, { as: "a", href: "#" }, "Link")}
  </div>
);
