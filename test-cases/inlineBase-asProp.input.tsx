// Bails base inlining when as changes resolved tag at callsite
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex).attrs({
  column: true,
})`
  padding: 8px;
  background-color: #eef;
  border: 1px solid #667;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Default</Container>
      <Container as="span">As span</Container>
    </div>
  );
}
