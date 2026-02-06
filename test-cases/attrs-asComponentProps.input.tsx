import styled from "styled-components";
import { Flex } from "./lib/flex";

const DialogItem = styled.div``;

const List = styled(DialogItem).attrs({ as: Flex, column: true })`
  background: white;
  border-radius: 4px;
`;

export const App = () => (
  <List>
    <div>Item 1</div>
    <div>Item 2</div>
  </List>
);
