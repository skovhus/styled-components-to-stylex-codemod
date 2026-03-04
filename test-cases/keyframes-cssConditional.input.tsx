// Keyframes referenced inside a conditional css`` helper block
import styled, { keyframes, css } from "styled-components";

const pulse = keyframes`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }

  100% {
    opacity: 1;
  }
`;

const Box = styled.div<{ $isAnimating?: boolean }>`
  background-color: cornflowerblue;
  padding: 24px;
  color: white;
  ${(props) =>
    props.$isAnimating &&
    css`
      animation: ${pulse} 1.6s ease-in-out infinite;
    `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box $isAnimating>Animating</Box>
    <Box>Static</Box>
  </div>
);
