// styled(Flex).attrs({ column: true, gap: 16 }) with template CSS → inlined to stylex.create()
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true, gap: 16 })`
  padding: 8px;
  background-color: white;
`;

export function App() {
  return <Container>content</Container>;
}
