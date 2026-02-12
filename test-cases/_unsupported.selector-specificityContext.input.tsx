// @expected-warning: Unsupported selector: descendant/child/sibling selector
import styled from "styled-components";

const Thing = styled.div`
  .wrapper && {
    background: papayawhip;
  }
`;

export const App = () => (
  <div className="wrapper">
    <Thing>Context override</Thing>
  </div>
);
