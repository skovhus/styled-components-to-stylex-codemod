// @expected-warning: Unsupported selector: compound pseudo selector
// :enabled only normalizes safely when every rendered target remains an intrinsic form control.
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
    <Button as="a" href="#">
      Link
    </Button>
  </div>
);
