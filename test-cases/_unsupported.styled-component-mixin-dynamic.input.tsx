// @expected-warning: Using styled-components components as mixins is not supported; use css`` mixins or strings instead
import styled from "styled-components";

// Dynamic mixin with prop-based styles - too complex to inline
const DynamicStyles = styled.div<{ $active: boolean }>`
  color: ${(props) => (props.$active ? "red" : "blue")};
`;

const Container = styled.div`
  padding: 10px;
  ${DynamicStyles}
`;

export const App = () => <Container>Container with dynamic mixin</Container>;
