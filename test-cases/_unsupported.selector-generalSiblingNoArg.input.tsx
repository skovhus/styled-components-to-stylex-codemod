// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  & ~ & {
    color: red;
  }
`;

export const App = () => (
  <div>
    <Thing>First</Thing>
    <Thing>Second</Thing>
    <Thing>Third</Thing>
  </div>
);
