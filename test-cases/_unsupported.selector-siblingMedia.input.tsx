// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Row = styled.div`
  color: #333;

  @media (min-width: 600px) {
    & + & {
      color: red;
    }
  }
`;

export const App = () => (
  <div>
    <Row>First</Row>
    <Row>Second</Row>
  </div>
);
