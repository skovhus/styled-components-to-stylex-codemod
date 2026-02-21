import styled from "styled-components";

// The adjacent sibling rule appears BEFORE the base color declaration.
// The base value must still be preserved as the default.
const Thing = styled.div`
  & + & {
    color: red;
  }

  color: blue;
  padding: 8px 16px;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red - adjacent)</Thing>
  </div>
);
