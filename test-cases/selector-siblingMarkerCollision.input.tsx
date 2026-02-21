import styled from "styled-components";

// Pre-existing variable collides with the generated marker name `rowMarker`.
const rowMarker = "existing-marker";

const Row = styled.div`
  padding: 8px;

  & + & {
    border-top-width: 1px;
    border-top-style: solid;
    border-top-color: gray;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", padding: 16 }}>
    <Row>First (no border)</Row>
    <Row>Second (border-top)</Row>
    <p>{rowMarker}</p>
  </div>
);
