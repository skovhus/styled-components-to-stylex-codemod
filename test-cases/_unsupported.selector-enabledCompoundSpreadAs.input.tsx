// @expected-warning: Unsupported selector: compound pseudo selector
// JSX spread can hide an `as` prop that renders a styled button as a non-form target.
import styled from "styled-components";

const linkProps = { as: "a", href: "#" };

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
    <Button {...linkProps}>Link</Button>
  </div>
);
