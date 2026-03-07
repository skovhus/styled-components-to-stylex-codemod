// Ternary with template literal branches containing @media queries
import styled from "styled-components";

export const Card = styled.div<{ $compact: boolean }>`
  border-radius: 8px;
  border: 1px solid #ccc;
  ${(props) =>
    props.$compact
      ? `
    padding: 8px;
    font-size: 12px;
    @media (min-width: 768px) {
      padding: 12px;
    }
  `
      : `
    padding: 16px;
    font-size: 14px;
    @media (min-width: 768px) {
      padding: 24px;
    }
  `};
`;

export function App() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <Card $compact>Compact Card</Card>
      <Card $compact={false}>Regular Card</Card>
    </div>
  );
}
