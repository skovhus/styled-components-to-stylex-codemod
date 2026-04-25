import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px 16px;

  & + & {
    color: red;
    background: lime;
  }
`;

const Row = styled.div`
  & + & {
    margin-top: 16px;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First (blue)</Thing>
    <Thing>Second (red, lime - adjacent)</Thing>
    <span>Spacer</span>
    <Thing>Third (blue - not adjacent to Thing)</Thing>
    <Thing>Fourth (red, lime - adjacent)</Thing>
    <Row>First row</Row>
    <Row>Second row (margin-top)</Row>
  </div>
);
