import styled from "styled-components";

const Thing = styled.div`
  && {
    /* Double ampersand increases specificity */
    color: red;
  }
`;

export const App = () => (
  <div>
    <Thing>Higher specificity text (red due to &&)</Thing>
  </div>
);
