import styled from "styled-components";
import { Flex } from "./lib/flex";

// Bug: .attrs({ as: Flex, column: true }) sets the rendered element to Flex with
// column=true, but the codemod drops the `as: Flex` and renders a plain <div> with
// `column` as an invalid HTML attribute. Causes TS2322 on the bare attribute.

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
