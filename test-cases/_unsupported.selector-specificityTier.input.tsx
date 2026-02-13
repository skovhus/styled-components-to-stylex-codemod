// @expected-warning: Unsupported selector: descendant/child/sibling selector
import styled from "styled-components";

const Thing = styled.div`
  &&& {
    color: blue;
  }

  && {
    color: red;
  }
`;

export const App = () => (
  <div>
    <Thing>Specificity tiered text</Thing>
  </div>
);
