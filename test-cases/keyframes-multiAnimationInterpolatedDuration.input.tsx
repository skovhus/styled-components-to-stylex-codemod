// Multi-animation with interpolated duration in one segment
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

// First animation has interpolated duration, second has static duration
// When $duration is provided, animationDuration should be "${$duration}ms, 1s"
// not just "${$duration}ms" which would drop the second animation's duration
const AnimatedCard = styled.div<{ $duration?: number }>`
  animation: ${fadeIn} ${(props) => props.$duration ?? 200}ms ease, ${slideIn} 1s linear;
  padding: 20px;
  background: white;
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <AnimatedCard>Default (200ms, 1s)</AnimatedCard>
      <AnimatedCard $duration={500}>Custom (500ms, 1s)</AnimatedCard>
    </div>
  );
}
