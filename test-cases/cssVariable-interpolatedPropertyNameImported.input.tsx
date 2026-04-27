// Supports CSS variable property names imported from another module.
import styled from "styled-components";
import { ITEM_MIN_WIDTH_VAR } from "./lib/item-min-width";

const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
`;

export const App = () => (
  <div>
    <Container>Container</Container>
  </div>
);
