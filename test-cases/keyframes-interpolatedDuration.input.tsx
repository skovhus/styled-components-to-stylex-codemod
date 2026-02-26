// Keyframes with interpolated animation duration
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

const FadeInContainer = styled.span<{ $fadeInDuration?: number }>`
  animation: ${fadeIn} ease-out ${(props) => props.$fadeInDuration ?? 200}ms;
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <FadeInContainer>Default (200ms)</FadeInContainer>
      <FadeInContainer $fadeInDuration={500}>Custom (500ms)</FadeInContainer>
    </div>
  );
}
