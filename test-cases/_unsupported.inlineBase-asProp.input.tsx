// @expected-warning: styled(ImportedComponent) wraps a component whose file uses styled-components — convert the base component's file first to avoid CSS cascade conflicts
// Inline base resolution bails when `as` changes the resolved tag at a call site.
// Falling back to a wrapper around the imported `Flex` would put the StyleX classes
// in a CSS layer behind Flex's unlayered styled-components rules — bail instead.
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
