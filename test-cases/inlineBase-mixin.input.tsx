// Uses resolver-provided mixin references for base styles
import styled from "styled-components";
import { Flex } from "@linear/orbiter/components/Flex";

const Container = styled(Flex).attrs({
  inlineBaseMode: "mixin",
})`
  padding: 8px;
  background-color: #e7fff1;
  border: 1px solid #58a06d;
`;

export function App() {
  return <Container>Mixin mode</Container>;
}
