// @expected-warning: Unsupported selector: compound pseudo selector
// React namespace aliases can pass as to a styled button and render it as a non-form target.
import * as R from "react";
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
    {R.createElement(Button, { as: "a", href: "#" }, "Link")}
  </div>
);
