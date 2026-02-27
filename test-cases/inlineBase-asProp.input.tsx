// styled(Flex) used with JSX as="span" — polymorphic wrapper with inlined base styles
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex).attrs({ column: true, gap: 8 })`
  padding: 8px;
  background-color: aliceblue;
`;

export function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Container>Default div</Container>
      <Container as="section">As section</Container>
      <Container as="span">As span</Container>
    </div>
  );
}
