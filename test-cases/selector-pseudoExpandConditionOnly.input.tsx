// Pseudo-expand where some CSS properties only exist in the conditional block, not in base styles
import * as React from "react";
import styled from "styled-components";
import { highlightExpand } from "./lib/helpers";

const Box = styled.div`
  padding: 8px;
  background-color: #f0f0f0;

  &:${highlightExpand} {
    background-color: #e0e0e0;
    opacity: 0.9;
    transform: scale(1.02);
  }
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Box>Mixed: base + condition-only</Box>
    </div>
  );
}
