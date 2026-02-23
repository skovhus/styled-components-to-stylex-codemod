import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px 16px;

  /* General sibling selector */
  & ~ & {
    border-bottom: 2px solid gray;
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (border-bottom in CSS)</Thing>
    <Thing>Third (border-bottom in CSS)</Thing>
  </div>
);
