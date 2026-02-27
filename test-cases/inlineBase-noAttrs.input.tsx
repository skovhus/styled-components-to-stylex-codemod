// Inlines base Flex defaults when no attrs are provided
import styled from "styled-components";
import { Flex } from "@linear/orbiter/components/Flex";

const Container = styled(Flex)`
  padding: 10px;
  background-color: #eef9ff;
  border: 1px solid #5aa;
`;

export function App() {
  return <Container>No attrs</Container>;
}
