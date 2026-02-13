import styled from "styled-components";

const Thing = styled.div`
  && {
    color: red;
    padding: 8px;
  }
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Thing>High specificity text (red, with padding)</Thing>
  </div>
);
