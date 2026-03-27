import styled, { keyframes } from "styled-components";

const OFFSET_PX = 40;
const DURATION_SECONDS = 1.8;

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

export const App = () => <Box>Hi</Box>;
