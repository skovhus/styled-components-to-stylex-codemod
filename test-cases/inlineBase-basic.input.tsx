// Inlines base Flex styles from attrs static props
import styled from "styled-components";
import { Flex } from "@linear/orbiter/components/Flex";

const Container = styled(Flex).attrs({
  column: true,
  gap: 16,
  align: "center",
})`
  padding: 8px;
  background-color: #f5f5ff;
  border: 1px solid #667;
`;

export function App() {
  return <Container>Basic</Container>;
}
