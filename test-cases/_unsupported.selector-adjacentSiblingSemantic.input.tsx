// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Thing = styled.div`
  color: blue;
  padding: 8px;
  border: 1px solid #bf4f74;

  &.lead + & {
    color: red;
  }
`;

export const App = () => (
  <div>
    <Thing className="lead">Lead</Thing>
    <span>Spacer</span>
    <Thing>Should stay blue (not adjacent to lead)</Thing>
  </div>
);
