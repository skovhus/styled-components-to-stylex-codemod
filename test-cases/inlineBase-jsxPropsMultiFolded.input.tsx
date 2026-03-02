// Multi-prop singleton folding into base style
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

const Container = styled(Flex)`
  padding: 8px;
  background-color: #e8f5e9;
  border: 1px solid #4caf50;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container column gap={12}>
        Folded A
      </Container>
      <Container column gap={12}>
        Folded B
      </Container>
    </div>
  );
}
