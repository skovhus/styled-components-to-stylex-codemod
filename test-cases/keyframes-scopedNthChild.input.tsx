// Animation scoped to only the second child via :nth-child(2)
import styled, { keyframes } from "styled-components";

const bounce = keyframes`
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
`;

const AnimatedPath = styled.path`
  fill: currentColor;

  &:nth-child(2) {
    transform-origin: center;
    animation: ${bounce} 1s ease-in-out infinite;
  }
`;

export const App = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" style={{ color: "#bf4f74" }}>
    <AnimatedPath d="M4 14h16v2H4z" />
    <AnimatedPath d="M12 4l4 4H8z" />
  </svg>
);
