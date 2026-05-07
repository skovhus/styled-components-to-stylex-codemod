// @expected-warning: Unsupported selector: component selector with child pseudo
import styled from "styled-components";

const Item = styled.div`
  padding: 6px;
`;

const List = styled.div`
  ${Item}:not(:last-child) {
    margin-bottom: 8px;
    border-bottom: 1px solid #cbd5e1;
  }
`;

export const App = () => (
  <List>
    <Item>One</Item>
    <Item>Two</Item>
  </List>
);
