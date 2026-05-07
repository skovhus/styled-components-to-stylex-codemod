// Pseudo-class and media query on the same property
import styled, { keyframes } from "styled-components";

const shimmer = keyframes`
  100% {
    transform: translateX(100%);
  }
`;

const Box = styled.div`
  color: blue;
  background-color: white;

  &:hover {
    color: red;
    background-color: lightblue;
  }

  &:focus-visible {
    color: green;
    outline: 2px solid blue;
  }

  @media (max-width: 600px) {
    color: orange;
    background-color: gray;
  }
`;

const Placeholder = styled.div`
  position: relative;
  overflow: hidden;
  height: 20px;
  background-color: #e2e8f0;
  border-radius: 4px;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background-image: linear-gradient(90deg, transparent, #f8fafc, transparent);
    animation: ${shimmer} 3s infinite;

    @media (prefers-reduced-motion: reduce) {
      animation: none;
    }
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <Box>Hover or focus me, and resize!</Box>
    <Placeholder />
  </div>
);
