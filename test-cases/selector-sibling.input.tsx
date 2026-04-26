import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px 16px;

  /* General sibling: matching element appears later in the same parent */
  & ~ & {
    color: red;
    background: lime;
  }
`;

// General sibling with theme interpolation
const ThingThemed = styled.div`
  color: blue;

  & ~ & {
    color: ${(props) => props.theme.color.labelBase};
  }
`;

// Minimal general sibling (margin-top spacing pattern)
const Row = styled.div`
  & ~ & {
    margin-top: 16px;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - general sibling)</Thing>
    <Thing>Third (red, lime - general sibling)</Thing>
    <ThingThemed>First themed</ThingThemed>
    <ThingThemed>Second themed (theme color)</ThingThemed>
    <Row>First row</Row>
    <Row>Second row (margin-top)</Row>
  </div>
);
