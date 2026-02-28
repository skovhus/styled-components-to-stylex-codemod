// Conditional pointer-events and opacity toggled by $open, wrapping a component (Flex)
import styled from "styled-components";
import { Flex } from "./lib/flex";

const Container = styled(Flex)<{ $open: boolean; $duration: number; $delay: number }>`
  opacity: ${(props) => (props.$open ? 1 : 0)};
  transition: opacity ${(props) => props.$duration}ms;
  transition-delay: ${(props) => (props.$open ? props.$delay : 0)}ms;
  pointer-events: ${(props) => (props.$open ? "inherit" : "none")};
`;

export const App = () => (
  <div style={{ display: "flex", gap: "16px" }}>
    <Container $open={true} $delay={100} $duration={300}>
      <button style={{ padding: "8px 16px" }}>Visible and clickable</button>
    </Container>
    <Container $open={false} $delay={0} $duration={200}>
      <button style={{ padding: "8px 16px" }}>Hidden and not clickable</button>
    </Container>
  </div>
);
