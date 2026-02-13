// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Row = styled.div`
  & + & {
    margin-top: 16px;
  }
`;

export const App = () => (
  <div>
    <Row>First</Row>
    <Row>Second</Row>
  </div>
);
