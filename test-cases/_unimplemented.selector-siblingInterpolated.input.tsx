// @expected-warning: Unsupported selector: sibling combinator
import styled from "styled-components";

const Thing = styled.div`
  color: blue;

  & + & {
    color: ${(props) => props.theme.color.labelBase};
  }
`;

export const App = () => (
  <div style={{ padding: 16 }}>
    <Thing>First</Thing>
    <Thing>Second (theme color)</Thing>
  </div>
);
