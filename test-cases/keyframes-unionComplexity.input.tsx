import styled, { keyframes } from "styled-components";

const pulse = keyframes`
  0%, 40%, 100% {
    opacity: 1;
  }
  50%, 90% {
    opacity: 0.2;
  }
`;

export const LoaderCaret = styled.div<{ $delay?: number }>`
  width: 8px;
  height: 16px;
  border-radius: 2px;
  background-color: blue;
  opacity: 0;
  animation: ${pulse} 2000ms infinite;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-delay: ${(props) => props.$delay ?? 1000}ms;
`;

const StyledLoaderCaret = styled(LoaderCaret)<{ $noPadding?: boolean }>`
  position: absolute;
  top: 11px;
  left: ${(props) => (props.$noPadding ? "0" : "10px")};
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
    <div>
      <p>LoaderCaret:</p>
      <LoaderCaret $delay={0} />
    </div>
    <div style={{ position: "relative", height: 40 }}>
      <p>StyledLoaderCaret:</p>
      <StyledLoaderCaret $delay={500} />
    </div>
  </div>
);
