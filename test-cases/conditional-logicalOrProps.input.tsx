// Logical-OR condition: ($active || $completed) && css`...`
import * as React from "react";
import styled, { css } from "styled-components";

// Pattern 1: Simple logical OR
const Dot = styled.div<{ $active?: boolean; $completed?: boolean }>`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
  background-color: white;
  ${({ $active, $completed }) =>
    ($active || $completed) &&
    css`
      border-color: #6366f1;
      background-color: #6366f1;
    `}
`;

// Pattern 2: Negated logical OR
const Step = styled.div<{ $active?: boolean; $completed?: boolean }>`
  padding: 8px 16px;
  background-color: #6366f1;
  color: white;
  ${({ $active, $completed }) =>
    !($active || $completed) &&
    css`
      background-color: #e2e8f0;
      color: #64748b;
    `}
`;

// Pattern 3: AND wrapping OR on the right
const Badge = styled.span<{ $visible?: boolean; $primary?: boolean; $accent?: boolean }>`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: #e2e8f0;
  ${({ $visible, $primary, $accent }) =>
    $visible &&
    ($primary || $accent) &&
    css`
      background-color: #6366f1;
      color: white;
    `}
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "center", flexWrap: "wrap" }}>
      <Dot>neither</Dot>
      <Dot $active>active</Dot>
      <Dot $completed>completed</Dot>
      <Dot $active $completed>
        both
      </Dot>

      <Step>neither</Step>
      <Step $active>active</Step>
      <Step $completed>completed</Step>

      <Badge>hidden</Badge>
      <Badge $visible>visible</Badge>
      <Badge $visible $primary>
        primary
      </Badge>
      <Badge $visible $accent>
        accent
      </Badge>
    </div>
  );
}
