// Consumed prop values with hyphens must produce valid JS identifier style keys
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const SpacedRow = styled(Flex)`
  padding: 8px;
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SpacedRow justify="space-between">
        <span>Left</span>
        <span>Right</span>
      </SpacedRow>
      <SpacedRow justify="flex-end">
        <span>End</span>
      </SpacedRow>
      <SpacedRow align="flex-start" justify="center">
        <span>Top center</span>
      </SpacedRow>
    </div>
  );
}
