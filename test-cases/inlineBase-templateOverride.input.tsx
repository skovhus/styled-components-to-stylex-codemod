// Template CSS overrides inlined base CSS (Flex defaults display:flex, template overrides to grid)
import styled from "styled-components";
import { Flex } from "./lib/flex";

const GridContainer = styled(Flex).attrs({ column: true })`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

export function App() {
  return (
    <GridContainer>
      <div>Cell 1</div>
      <div>Cell 2</div>
    </GridContainer>
  );
}
