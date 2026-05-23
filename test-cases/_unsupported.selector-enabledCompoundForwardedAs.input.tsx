// @expected-warning: Unsupported selector: compound pseudo selector
// forwardedAs can render a styled button as a non-form target, so :enabled normalization is unsafe.
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
    <Button forwardedAs="a" href="#">
      Link
    </Button>
  </div>
);
