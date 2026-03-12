// Arithmetic binary expressions in arrow function interpolations
import styled from "styled-components";

const Box = styled.div<{ $depth: number }>`
  background-color: red;
  padding: 8px;
  padding-left: ${(props) => props.$depth * 16 + 4}px;
  color: white;
`;

export const App = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <Box $depth={0}>Depth 0</Box>
    <Box $depth={1}>Depth 1</Box>
    <Box $depth={2}>Depth 2</Box>
    <Box $depth={3}>Depth 3</Box>
  </div>
);
