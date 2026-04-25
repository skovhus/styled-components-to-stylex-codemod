// @expected-warning: Unsupported selector: adjacent sibling combinator
import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  & + & {
    color: red;
  }
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second</Thing>
  </div>
);
