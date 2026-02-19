import styled from "styled-components";
import { truncate } from "./lib/helpers";

// Helper call conditional inside a pseudo selector.
// The adapter provides cssText so the codemod can expand individual CSS properties
// and wrap them in the pseudo selector context.
const Text = styled.p<{ $truncate?: boolean }>`
  font-size: 14px;
  color: #333;
  padding: 8px;
  background-color: #f5f5f5;
  &:hover {
    ${(props) => (props.$truncate ? truncate() : "")}
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 180, padding: 16 }}>
    <Text>Normal text (no truncation)</Text>
    <Text $truncate>Truncated text on hover - this long text overflows when you hover over it</Text>
  </div>
);
