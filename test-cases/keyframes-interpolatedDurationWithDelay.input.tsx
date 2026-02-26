// Keyframes with interpolated duration BEFORE static delay (order matters)
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

// Critical: interpolated time comes BEFORE the static time
// In CSS animation shorthand, first time = duration, second time = delay
// So the interpolated value should be duration, and "0.5s" should be delay
const FadeInWithDelay = styled.span<{ $duration?: number }>`
  animation: ${fadeIn} ${(props) => props.$duration ?? 200}ms 0.5s ease-out;
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      <FadeInWithDelay>Default duration (200ms), delay (0.5s)</FadeInWithDelay>
      <FadeInWithDelay $duration={800}>Custom duration (800ms), delay (0.5s)</FadeInWithDelay>
    </div>
  );
}
