// @expected-warning: Unsupported selector: unknown component selector
import styled from "styled-components";

const Other = styled.div`
  color: green;
`;

const Thing = styled.div`
  color: blue;

  ${Other} + & {
    color: red;
  }
`;

export const App = () => (
  <div>
    <Other>First</Other>
    <Thing>Second</Thing>
  </div>
);
