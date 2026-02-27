// Template CSS overrides resolver-provided base styles
import styled from "styled-components";
import { Flex } from "@linear/orbiter/components/Flex";

const Container = styled(Flex).attrs({
  column: true,
})`
  display: grid;
  flex-direction: row;
  gap: 4px;
  padding: 8px;
  background-color: #eef;
`;

export function App() {
  return <Container>Override</Container>;
}
