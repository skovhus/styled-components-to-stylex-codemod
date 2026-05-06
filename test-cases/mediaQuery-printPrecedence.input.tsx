// Print media styles must not become normal screen defaults.
import styled from "styled-components";

const LoadingContainer = styled.div`
  display: flex;
  overflow: auto;
  align-items: center;
  justify-content: center;
  min-height: 80px;

  @media print {
    display: block;
    overflow: visible;
  }
`;

const FadingContent = styled.div<{ $isLoading?: boolean }>`
  opacity: ${(props) => (props.$isLoading ? 0 : 1)};
  pointer-events: ${(props) => (props.$isLoading ? "none" : "auto")};
  transition: opacity ${(props) => (props.$isLoading ? 100 : 0)}ms
    ${(props) => (props.$isLoading ? 500 : 0)}ms ease-in;
  display: flex;
  overflow: auto;

  @media print {
    display: block;
    overflow: visible;
    height: auto;
    min-height: 0;
    opacity: 1;
    pointer-events: auto;
  }
`;

export const App = () => (
  <div style={{ display: "grid", gap: 12 }}>
    <LoadingContainer>Loading</LoadingContainer>
    <FadingContent $isLoading>Fading</FadingContent>
  </div>
);
