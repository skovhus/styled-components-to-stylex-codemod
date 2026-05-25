// @expected-warning: Unsupported selector: compound pseudo selector
// .attrs({ as }) can force a styled button to render as a non-form target.
import styled from "styled-components";

const Button = styled.button.attrs({ as: "a" })`
  padding: 8px 12px;
  background-color: white;

  &:enabled:hover {
    background-color: #dbeafe;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button href="#">Link</Button>
  </div>
);
