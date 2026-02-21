// @expected-warning: Unsupported selector: descendant/child/sibling selector
import styled from "styled-components";

const Other = styled.div`
  color: hotpink;
`;

const Parent = styled.div`
  ${Other} .child & {
    color: red;
  }

  ${Other} .child {
    color: blue;
  }
`;

export const App = () => (
  <Parent>
    <Other className="child">Child</Other>
  </Parent>
);
