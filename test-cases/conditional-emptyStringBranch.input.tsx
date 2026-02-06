import styled from "styled-components";

// Empty string in conditional - should omit property when truthy
const Box = styled.div<{ $disableMinWidth?: boolean }>`
  display: flex;
  background-color: #e0e0e0;
  margin-bottom: 8px;
  ${(props) => (props.$disableMinWidth ? "" : "min-width: 500px;")}
`;

// Empty string alternate - should apply property when truthy
const BoxAlt = styled.div<{ $enableMinWidth?: boolean }>`
  display: flex;
  background-color: #d0d0f0;
  margin-bottom: 8px;
  ${(props) => (props.$enableMinWidth ? "min-width: 500px;" : "")}
`;

// Multiple CSS declarations in string
const Container = styled.div<{ $compact?: boolean }>`
  padding: 16px;
  background-color: #f0e0d0;
  margin-bottom: 8px;
  ${(props) =>
    props.$compact
      ? ""
      : `
      margin: 24px;
      border: 1px solid gray;
    `}
`;

export const App = () => (
  <div>
    <Box>Normal (has min-width)</Box>
    <Box $disableMinWidth>Disabled min-width</Box>
    <BoxAlt>No min-width</BoxAlt>
    <BoxAlt $enableMinWidth>Has min-width</BoxAlt>
    <Container>Normal container with margin/border</Container>
    <Container $compact>Compact container without margin/border</Container>
  </div>
);
