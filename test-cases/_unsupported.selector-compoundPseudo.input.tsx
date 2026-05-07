// @expected-warning: Unsupported selector: compound pseudo selector
// Chained pseudo-classes on the same element are not valid StyleX keys.
import styled from "styled-components";

const Button = styled.button`
  display: inline-flex;
  padding: 8px 12px;
  border: 1px solid #64748b;
  border-radius: 6px;
  background-color: white;
  color: #0f172a;

  &:enabled:hover {
    background-color: #dbeafe;
  }

  &:enabled:active {
    background-color: #bfdbfe;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 12, padding: 16 }}>
    <Button type="button">Enabled</Button>
    <Button type="button" disabled>
      Disabled
    </Button>
  </div>
);
