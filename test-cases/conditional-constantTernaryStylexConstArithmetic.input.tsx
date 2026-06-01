// Constant conditional branches with StyleX-token arithmetic should stay statically extractable.
import styled from "styled-components";
import { zIndex } from "./lib/helpers";

export const Container = styled.div<{ $isSmall?: boolean }>`
  position: fixed;
  inset: 16px;
  z-index: ${(props) => (props.$isSmall ? zIndex.modal : zIndex.dialog + 2)};
  background-color: white;
`;

export const App = () => (
  <div style={{ position: "relative", minHeight: 80 }}>
    <Container>Default z-index</Container>
    <Container $isSmall>Small z-index</Container>
  </div>
);
