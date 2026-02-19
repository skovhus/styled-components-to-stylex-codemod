// @expected-warning: Unsupported selector: descendant/child/sibling selector
import styled from "styled-components";

const OverrideStyles = styled.div`
  .wrapper && {
    /* Context-based specificity boost - requires ancestor class */
    background: papayawhip;
    padding: 16px;
  }
`;

export const App = () => (
  <div className="wrapper" style={{ padding: 16 }}>
    <OverrideStyles>Context override (papayawhip background)</OverrideStyles>
  </div>
);
