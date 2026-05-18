// Interpolated pseudo expansion should preserve an :enabled self-pseudo prefix.
import styled from "styled-components";
import { highlightExpand } from "./lib/helpers";

const Button = styled.button`
  display: inline-flex;
  padding: 8px 12px;
  border: 1px solid #64748b;
  border-radius: 6px;
  background-color: white;
  color: #0f172a;

  &:enabled:${highlightExpand} {
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
