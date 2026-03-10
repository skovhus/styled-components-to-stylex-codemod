// Boolean consumed props should not produce variants keyed by boolean `true`
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Container = styled(Flex)`
  padding: 8px;
  background-color: #f0f5ff;
  border: 1px solid #6a7ab5;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container>Row layout</Container>
      <Container column>Column layout</Container>
      <Container column overflowHidden>
        Column overflow hidden
      </Container>
    </div>
  );
}
