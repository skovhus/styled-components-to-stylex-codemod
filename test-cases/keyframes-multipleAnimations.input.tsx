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
  animation: ${fadeIn} 0.6s cubic-bezier(0.165, 0.84, 0.44, 1) both;
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

// Shorthand with full property coverage
const FullAnimation = styled.div`
  animation: ${fadeIn} 1s steps(4, end) 200ms 3 alternate both running;
`;

// Mixed play-state, direction, fill-mode across segments
const MixedStates = styled.div`
  animation: ${fadeIn} 500ms ease-in 0s 1 normal both paused,
    ${slideIn} 700ms ease-out 100ms infinite reverse forwards paused;
`;

export const App = () => (
  <div>
    <FadeBox>Fade in</FadeBox>
    <AnimatedCard>Animated Card</AnimatedCard>
    <BounceIn>Bounce In</BounceIn>
    <SequentialAnimation>Sequential</SequentialAnimation>
    <FullAnimation>Full Animation</FullAnimation>
    <MixedStates>Mixed States</MixedStates>
  </div>
);
