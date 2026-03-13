// Single-key boolean variant should emit conditional style, not a variant object, even with template expressions
import styled from "styled-components";
import { Flex } from "./lib/inline-base-flex";

export const Container = styled(Flex)<{ isCompact?: boolean }>`
  padding: ${(props) => (props.isCompact ? "4px" : "16px")};
  background-color: #f0f5ff;
`;

export function App() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <Container column>Column with default padding</Container>
      <Container column isCompact>
        Column compact
      </Container>
    </div>
  );
}
