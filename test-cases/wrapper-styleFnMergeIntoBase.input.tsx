import styled from "styled-components";

const Position = styled.div<{ $zIndex: number; $disablePointerEvents: boolean }>`
  z-index: ${(props) => props.$zIndex};
  position: fixed;
  pointer-events: ${(props) => (props.$disablePointerEvents ? "none" : "auto")};
`;

export function App() {
  return (
    <Position $zIndex={100} $disablePointerEvents={false}>
      content
    </Position>
  );
}
