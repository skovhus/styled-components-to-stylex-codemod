import styled from "styled-components";

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

export const App = () => (
  <div>
    <Thing>High specificity text (blue due to &&&)</Thing>
  </div>
);
