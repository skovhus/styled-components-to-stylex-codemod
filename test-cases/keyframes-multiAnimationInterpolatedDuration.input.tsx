// Multi-animation with interpolated duration in both segments
import * as React from "react";
import styled, { keyframes } from "styled-components";

const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

const slideIn = keyframes`
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
`;

// Both animations share the same interpolated duration prop
const AnimatedCard = styled.div<{ $duration?: number }>`
  animation: ${fadeIn} ${(props) => props.$duration ?? 200}ms ease, ${slideIn} ${(props) => props.$duration ?? 1000}ms linear;
  padding: 20px;
  background: white;
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <AnimatedCard>Default (200ms, 1000ms)</AnimatedCard>
      <AnimatedCard $duration={500}>Custom (500ms, 500ms)</AnimatedCard>
    </div>
  );
}
