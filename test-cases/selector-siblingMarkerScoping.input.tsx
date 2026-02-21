import styled from "styled-components";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;
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
