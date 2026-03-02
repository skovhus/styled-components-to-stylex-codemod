// Uses resolver-provided mixin references for base styles
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex).attrs({
  direction: "row",
})`
  padding: 8px;
  background-color: #e7fff1;
  border: 1px solid #58a06d;
`;

export function App() {
  return <Container>Mixin mode</Container>;
}
