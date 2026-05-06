import styled, { keyframes } from "styled-components";

const OFFSET_PX = 40;
const SETTINGS = {
  travelDurationSeconds: 1.8,
  pauseDurationSeconds: 0.45,
};
const DURATION_SECONDS = SETTINGS.travelDurationSeconds;
const RUN_PERCENT = Math.min(
  99.999,
  (SETTINGS.travelDurationSeconds /
    (SETTINGS.travelDurationSeconds + SETTINGS.pauseDurationSeconds)) *
    100,
);

const sweep = keyframes`
  from {
    transform: translateX(-${OFFSET_PX}px);
  }
  to {
    transform: translateX(100%);
  }
`;

const Box = styled.div`
  display: inline-block;
  animation: ${sweep} ${DURATION_SECONDS}s linear infinite;
  padding: 8px 12px;
`;

const chromaticSweep = keyframes`
  0% {
    background-position: -${OFFSET_PX}px 50%, 0 50%;
  }
  ${RUN_PERCENT}% {
    background-position: ${OFFSET_PX}px 50%, 0 50%;
  }
  100% {
    background-position: ${OFFSET_PX}px 50%, 0 50%;
  }
`;

const ShimmerText = styled.span<{ $imageUrl: string }>`
  color: transparent;
  background-image: url("${(props) => props.$imageUrl}");
  background-clip: text;
  animation: ${chromaticSweep} ${DURATION_SECONDS}s linear infinite;
`;

export const App = () => (
  <div style={{ display: "grid", gap: 8 }}>
    <Box>Hi</Box>
    <ShimmerText $imageUrl="/shine.png">Layered shimmer</ShimmerText>
  </div>
);
