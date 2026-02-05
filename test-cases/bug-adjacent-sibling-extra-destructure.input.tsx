import styled from "styled-components";

// Bug: The `& + &` sibling selector is converted to an `isAdjacentSibling` prop,
// but the output also destructures `className` and `_unused` from props even though
// neither exists in the generated RowProps type. Causes TS2339.

const Row = styled.div`
  & + & {
    margin-top: 16px;
  }
`;

export const App = () => (
  <div>
    <Row>First</Row>
    <Row>Second</Row>
  </div>
);
