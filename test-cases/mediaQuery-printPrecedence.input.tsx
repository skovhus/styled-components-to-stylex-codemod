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

const FadingContent = styled.div<{
  $gutter?: "auto" | "stable";
  $isLoading?: boolean;
  $overflow?: "auto" | "hidden" | "visible";
}>`
  opacity: ${(props) => (props.$isLoading ? 0 : 1)};
  pointer-events: ${(props) => (props.$isLoading ? "none" : "auto")};
  transition: opacity ${(props) => (props.$isLoading ? 100 : 0)}ms
    ${(props) => (props.$isLoading ? 500 : 0)}ms ease-in;
  display: flex;
  flex-direction: column;
  overflow: auto;
  scrollbar-gutter: ${(props) => props.$gutter};
  ${(props) => (props.$overflow ? `overflow: ${props.$overflow};` : "")}
  ${(props) =>
    props.$isLoading
      ? `
        will-change: opacity;
        backface-visibility: hidden;
      `
      : ""}

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
    <FadingContent $gutter="stable" $isLoading $overflow="hidden">
      Fading
    </FadingContent>
    <FadingContent>Idle</FadingContent>
  </div>
);
