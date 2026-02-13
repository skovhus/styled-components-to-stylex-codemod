// @expected-warning: Unsupported selector: sibling combinator inside @media
import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px;

  @media (min-width: 768px) {
    & + & {
      margin-top: 16px;
    }
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (margin-top on wide screens)</Thing>
  </div>
);
