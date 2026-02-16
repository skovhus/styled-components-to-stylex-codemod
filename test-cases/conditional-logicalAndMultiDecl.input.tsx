import styled from "styled-components";

// Pattern 1: Logical AND with template literal containing multiple CSS declarations
const Box = styled.div<{ $userSelected?: boolean }>`
  padding: 16px;
  ${(props) => props.$userSelected && `background: blue; border: 1px solid blue;`}
`;

// Pattern 2: Logical AND with string literal containing multiple CSS declarations
const Card = styled.div<{ $highlighted?: boolean }>`
  padding: 8px;
  ${(props) => props.$highlighted && "background: yellow; color: black; font-weight: bold;"}
`;

export const App = () => (
  <div style={{ display: "flex", gap: 16, padding: 16 }}>
    <Box>Default Box</Box>
    <Box $userSelected>Selected Box</Box>
    <Card>Default Card</Card>
    <Card $highlighted>Highlighted Card</Card>
  </div>
);
