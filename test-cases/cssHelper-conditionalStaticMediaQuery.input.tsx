import styled from "styled-components";

/**
 * Tests that static CSS blocks (no interpolations) inside conditional
 * expressions correctly handle @media rules instead of silently dropping them.
 * Exercises the `resolveStaticCssBlock` code path.
 */
const Card = styled.div<{ $compact: boolean }>`
  padding: 16px;
  background-color: white;

  ${(props) =>
    props.$compact &&
    `
    padding: 8px;
    font-size: 12px;

    @media (min-width: 768px) {
      padding: 12px;
      font-size: 14px;
    }
  `}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Card $compact={false}>Default Card</Card>
    <Card $compact={true}>Compact Card</Card>
  </div>
);
