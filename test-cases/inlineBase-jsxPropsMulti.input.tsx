// Multi-prop variant dimensions from independent consumed props
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
      <Container>Default</Container>
      <Container gap={8} align="start">
        Gap 8, start
      </Container>
      <Container gap={16} align="center">
        Gap 16, center
      </Container>
      <Container gap={8} align="end">
        Gap 8, end
      </Container>
    </div>
  );
}
