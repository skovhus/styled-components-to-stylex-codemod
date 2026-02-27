// Template CSS overrides resolver-provided base styles
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

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
