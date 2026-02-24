import styled from "styled-components";

/**
 * Tests that template literal CSS blocks inside ternary conditional
 * expressions correctly handle @media rules instead of silently dropping them.
 * Exercises the `resolveTemplateLiteralBranch` code path (prop-conditional
 * ternary with plain template literal branches).
 */
const Banner = styled.div<{ $prominent: boolean }>`
  color: black;
  background-color: #f0f0f0;

  ${(props) =>
    props.$prominent
      ? `
    font-weight: bold;
    font-size: 18px;

    @media (min-width: 768px) {
      font-size: 24px;
    }
  `
      : `
    font-weight: normal;
    font-size: 14px;

    @media (min-width: 768px) {
      font-size: 16px;
    }
  `}
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
    <Banner $prominent={false}>Default Banner</Banner>
    <Banner $prominent={true}>Prominent Banner</Banner>
  </div>
);
