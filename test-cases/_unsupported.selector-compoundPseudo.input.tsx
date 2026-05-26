// @expected-warning: Unsupported selector: compound pseudo selector
//
// This is a codemod safety bail-out. StyleX supports many chained pseudo keys, and this codemod
// already supports shapes such as `:focus:not(:disabled)` and `:not(:disabled):hover`. This fixture
// documents the narrower `:enabled:*` case: preserving it may require either proving StyleX accepts
// `:enabled` in compound keys or normalizing it to `:not(:disabled)` only for elements where that is
// semantically equivalent. Until that support is deliberate, the codemod bails instead of emitting
// a selector that may not behave like styled-components.
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
