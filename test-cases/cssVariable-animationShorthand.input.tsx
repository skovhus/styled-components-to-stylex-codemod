// CSS var() inside animation shorthand should be preserved as animationDuration
// (or another longhand inferred from the var()'s fallback type), not silently dropped.
import styled, { keyframes } from "styled-components";

const shimmer = keyframes`
  0% { opacity: 0.4; }
  50% { opacity: 1; }
  100% { opacity: 0.4; }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
`;

// var() with a time fallback → animationDuration
const ProgressFill = styled.div`
  position: relative;
  height: 8px;
  background-color: cornflowerblue;
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    opacity: var(--animation-enabled, 0);
    animation: ${shimmer} var(--animation-duration, 1.5s) infinite;
    animation-timing-function: ease-in-out;
  }
`;

// var() with a timing-function fallback → animationTimingFunction
const Pulser = styled.div`
  width: 40px;
  height: 40px;
  background-color: tomato;
  animation: ${pulse} 2s var(--easing, ease-in-out) infinite;
`;

// Two var() time values → duration then delay
const Delayed = styled.div`
  width: 40px;
  height: 40px;
  background-color: gold;
  animation: ${pulse} var(--dur, 0.8s) var(--delay, 0.2s) ease-out infinite;
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <ProgressFill>Progress</ProgressFill>
    <Pulser>Pulse</Pulser>
    <Delayed>Delay</Delayed>
  </div>
);
