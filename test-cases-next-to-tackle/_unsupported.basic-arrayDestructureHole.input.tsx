// @expected-warning: Null AST node in array destructuring pattern (elision)
import styled from "styled-components";
import { useState } from "react";

const Container = styled.div`
  padding: 16px;
  background-color: #f0f0f0;
`;

export function App() {
  const [, setHovered] = useState(false);
  return <Container onClick={() => setHovered(true)}>Hello</Container>;
}
