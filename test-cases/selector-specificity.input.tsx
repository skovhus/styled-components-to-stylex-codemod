import styled from "styled-components";

const Thing = styled.div`
  && {
    color: red;
    padding: 8px;
  }

  &&& {
    color: blue;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Thing>High specificity text (blue due to &&&, with padding)</Thing>
  </div>
);
