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

// animation shorthand with keyframes reference in css`` conditional
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

// animation-name longhand with keyframes reference in css`` conditional
const Dot = styled.span<{ $active?: boolean }>`
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: tomato;
  ${(props) =>
    props.$active &&
    css`
      animation-name: ${pulse};
      animation-duration: 2s;
      animation-iteration-count: infinite;
    `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16, alignItems: "center" }}>
    <Box $isAnimating>Animating</Box>
    <Box>Static</Box>
    <Dot $active />
    <Dot />
  </div>
);
