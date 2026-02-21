import styled from "styled-components";

// Existing `styles` variable forces the codemod to use `stylexStyles`.
const [styles] = [{ d: "M0 0" }];

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
    <Row>Third (border-top)</Row>
    <p>{styles.d}</p>
  </div>
);
