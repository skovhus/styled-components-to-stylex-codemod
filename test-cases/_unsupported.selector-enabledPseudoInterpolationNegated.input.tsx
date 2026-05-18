// @expected-warning: Unsupported selector: interpolated pseudo selector
// Negated :enabled still contains enabled-state semantics and must keep bailing
// when pseudo expansion would introduce nested media under the compound pseudo key.
import styled from "styled-components";
import { highlightExpand } from "./lib/helpers";

const Button = styled.button`
  display: inline-flex;
  padding: 8px 12px;
  background-color: white;
  color: #0f172a;

  &:not(:enabled):${highlightExpand} {
    background-color: #dbeafe;
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
