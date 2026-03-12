// Conditional with locally-defined runtime call using theme argument
import styled from "styled-components";

function getRowHighlightColor(isDark: boolean): string {
  return isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.04)";
}

const Row = styled.div<{ $isHighlighted: boolean }>`
  background-color: ${(props) =>
    props.$isHighlighted ? getRowHighlightColor(props.theme.isDark) : "transparent"};
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
    <Row $isHighlighted={true}>Highlighted Row</Row>
    <Row $isHighlighted={false}>Normal Row</Row>
  </div>
);
