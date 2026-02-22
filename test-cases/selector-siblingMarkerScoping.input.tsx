import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
// NOTE: defaultMarker() is file-global — not scoped per component.
// If another component in the same file also uses defaultMarker() (e.g. for
// an ancestor relation override), its marker could incorrectly activate
// Row's sibling styles. Use defineMarker() for strict scoping.
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
