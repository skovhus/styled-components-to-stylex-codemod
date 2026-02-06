import styled from "styled-components";

/**
 * Arrow function returns a template literal with nested conditionals.
 * The codemod should preserve this via a stylex function.
 */
export const ColumnContainer = styled.div<{ $noGrowOrShrink?: boolean; $basis?: number }>`
  ${(props) => (props.$noGrowOrShrink ? "flex-grow:0;" : "flex-grow:1;")}
  flex-shrink: ${(props) =>
    `var(--flex-shrink, ${props.$noGrowOrShrink ? 0 : props.$basis ? 1 : 2})`};
`;

export const App = () => (
  <ColumnContainer
    $noGrowOrShrink
    $basis={1}
    style={{
      display: "flex",
      gap: 8,
      width: 260,
      border: "1px solid #ccc",
      padding: 8,
      background: "#f8f8f8",
    }}
  >
    <div style={{ width: 40, height: 24, background: "#BF4F74" }} />
    <div style={{ width: 120, height: 24, background: "#4F74BF" }} />
    <div style={{ width: 80, height: 24, background: "#74BF4F" }} />
  </ColumnContainer>
);
