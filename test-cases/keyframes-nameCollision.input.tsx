// Inline @keyframes name matches the exported component name
import * as React from "react";
import styled, { css } from "styled-components";

export const Move = styled.div`
  @keyframes Move {
    from {
      transform: translateX(-8px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  animation: Move 0.6s ease-out;
  background: #e0f2fe;
  border-radius: 8px;
  padding: 16px;
  color: #0369a1;
`;

export const MoveIcon = styled.svg<{ $animated?: boolean }>`
  @keyframes MoveIcon {
    from {
      transform: translateY(4px);
    }
    to {
      transform: translateY(0);
    }
  }

  width: 32px;
  height: 32px;
  fill: #4f46e5;

  ${(props) =>
    props.$animated
      ? css`
          animation: MoveIcon 0.8s ease-out forwards;
        `
      : undefined}
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 20 }}>
      <Move>Moving in</Move>
      <MoveIcon $animated viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" />
      </MoveIcon>
    </div>
  );
}
