import styled from 'styled-components';

const Thing = styled.div`
  /* Single ampersand has normal specificity */
  && {
    /* Double ampersand increases specificity */
    color: red;
  }

  &&& {
    /* Triple ampersand for even higher specificity */
    color: blue;
  }
`;

const OverrideStyles = styled.div`
  .wrapper && {
    /* Context-based specificity boost */
    background: papayawhip;
  }
`;

export const App = () => (
  <div className="wrapper">
    <Thing>High specificity text (blue due to &&&)</Thing>
    <OverrideStyles>Context override (papayawhip background)</OverrideStyles>
  </div>
);