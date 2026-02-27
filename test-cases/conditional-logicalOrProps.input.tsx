// Logical-OR condition: ($completed || $active) && css`...`.
// The codemod fails to convert the || test and bails the component entirely,
// rather than outputting ($active || $completed) ? styles.dotHighlighted : undefined.
import * as React from "react";
import styled, { css } from "styled-components";

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

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "center" }}>
      <Dot>neither</Dot>
      <Dot $active>active</Dot>
      <Dot $completed>completed</Dot>
      <Dot $active $completed>
        both
      </Dot>
    </div>
  );
}
