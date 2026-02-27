// styled(Flex) with no attrs — gets component defaults (display: flex)
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)`
  padding: 12px;
  border: 1px solid gray;
`;

export function App() {
  return <Container>Default flex</Container>;
}
