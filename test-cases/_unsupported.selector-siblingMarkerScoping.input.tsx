// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

// Adjacent sibling `& + &` uses defaultMarker() which is file-global.
// Without defineMarker(), the sibling match cannot be scoped to the
// same component, so a different marked component (e.g. from an
// ancestor relation override in the same file) could incorrectly
// activate this component's sibling styles.
const Row = styled.div`
  color: blue;
  padding: 8px;

  & + & {
    border-top: 1px solid gray;
  }
`;

export const App = () => (
  <Container>
    <Row>First</Row>
    <Row>Second (should have border-top)</Row>
  </Container>
);
