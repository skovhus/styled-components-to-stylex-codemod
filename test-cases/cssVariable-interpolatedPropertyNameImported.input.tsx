// Supports CSS variable property names imported from another module.
import styled from "styled-components";
import {
  ITEM_GRID_MIN_WIDTH_VAR as GRID_MIN_WIDTH_VAR,
  ITEM_MIN_WIDTH_VAR,
} from "./lib/item-min-width";

const Container = styled.div`
  ${ITEM_MIN_WIDTH_VAR}: 100%;
  background-color: orange;
`;

const Grid = styled.div`
  ${GRID_MIN_WIDTH_VAR}: 240px;
  background-color: rebeccapurple;
`;

export const App = () => (
  <div>
    <Container>Container</Container>
    <Grid>Grid</Grid>
  </div>
);
