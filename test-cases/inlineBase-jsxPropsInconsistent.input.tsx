// Creates per-value variants for differing JSX consumed prop values
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)`
  padding: 8px;
  background-color: #fff5f5;
  border: 1px solid #b66;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container align="start">Start</Container>
      <Container align="center">Center</Container>
      <Container align="end">End</Container>
    </div>
  );
}
