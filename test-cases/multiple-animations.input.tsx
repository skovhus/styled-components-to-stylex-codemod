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

const scaleUp = keyframes`
  0% {
    transform: scale(0.5);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
`;

// Single animation
const FadeBox = styled.div`
  animation: ${fadeIn} 0.5s ease-in-out;
`;

// Multiple animations combined
const AnimatedCard = styled.div`
  animation: ${fadeIn} 0.3s ease-out, ${slideIn} 0.5s ease-out;
  padding: 20px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

// Animation with multiple properties
const BounceIn = styled.div`
  animation-name: ${scaleUp};
  animation-duration: 0.6s;
  animation-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  animation-fill-mode: both;
`;

// Chained animations with delay
const SequentialAnimation = styled.div`
  animation: ${fadeIn} 0.3s ease-out 0s, ${slideIn} 0.5s ease-out 0.3s;
`;

export const App = () => (
  <div>
    <FadeBox>Fade in</FadeBox>
    <AnimatedCard>Animated Card</AnimatedCard>
    <BounceIn>Bounce In</BounceIn>
    <SequentialAnimation>Sequential</SequentialAnimation>
  </div>
);
