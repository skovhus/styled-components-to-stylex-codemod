// Builds JSX-site variants from static consumed props
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex).attrs({
  column: true,
})`
  padding: 8px;
  background-color: #f0f5ff;
  border: 1px solid #6a7ab5;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default gap</Container>
      <Container gap={8}>Gap 8</Container>
      <Container gap={16}>Gap 16</Container>
    </div>
  );
}
